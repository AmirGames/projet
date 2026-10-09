import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  user: { findUnique: jest.fn(), updateMany: jest.fn() },
  outboxMessage: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
};
const sendEmailVerification = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmailVerification } }));
jest.mock("../../customers/fiche-client.service", () => ({ rattacherFicheInvite: jest.fn() }));

import { envoyerConfirmation, envoyerConfirmationDuCompte, TYPE_EMAIL_CONFIRMATION } from "../auth-confirmation.service";
import { Outbox } from "../../jobs/outbox.service";
import { declarerGestionnairesOutbox } from "../../notifications/outbox-handlers";
import { AccountTokenService } from "../account-token.service";

beforeEach(() => {
  jest.resetAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "compte", email: "pro@example.test", name: "Pro", status: "ACTIVE", emailVerified: false });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.outboxMessage.updateMany.mockResolvedValue({ count: 1 });
  sendEmailVerification.mockResolvedValue(undefined);
  declarerGestionnairesOutbox();
});

describe("confirmation d'adresse durable", () => {
  it("programme uniquement l'identifiant dans le client transactionnel, sans jeton ni SMTP", async () => {
    const tx: any = { outboxMessage: { create: jest.fn(async () => ({ id: "message" })) } };
    await envoyerConfirmation({ id: "compte" }, tx);
    expect(tx.outboxMessage.create).toHaveBeenCalledWith({ data: { type: TYPE_EMAIL_CONFIRMATION, payload: { userId: "compte" }, dedupeKey: undefined } });
    expect(db.outboxMessage.create).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it("génère le lien à l'envoi et ne stocke que son empreinte sur le compte", async () => {
    await envoyerConfirmationDuCompte("compte");
    const [email, name, lien] = sendEmailVerification.mock.calls[0];
    const jeton = new URL(lien).searchParams.get("jeton")!;
    expect([email, name]).toEqual(["pro@example.test", "Pro"]);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: "compte", email: "pro@example.test", emailVerified: false, status: "ACTIVE" },
      data: { emailTokenHash: AccountTokenService.empreinte(jeton), emailTokenExpiresAt: expect.any(Date) },
    });
  });

  it.each([null, { emailVerified: true, status: "ACTIVE" }, { emailVerified: false, status: "DISABLED" }])(
    "ignore un compte absent, confirmé ou désactivé : %j", async (compte) => {
      db.user.findUnique.mockResolvedValue(compte);
      await envoyerConfirmationDuCompte("compte");
      expect(db.user.updateMany).not.toHaveBeenCalled();
      expect(sendEmailVerification).not.toHaveBeenCalled();
    }
  );

  it("n'envoie rien si le compte a été confirmé entre lecture et écriture", async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    await envoyerConfirmationDuCompte("compte");
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it("une panne SMTP conserve le message à reprendre, puis la reprise réussit", async () => {
    const message = { id: "message", type: TYPE_EMAIL_CONFIRMATION, payload: { userId: "compte" }, status: "PENDING", attempts: 0, maxAttempts: 8 };
    db.outboxMessage.findMany.mockResolvedValue([message]);
    sendEmailVerification.mockRejectedValueOnce(new Error("SMTP indisponible"));
    expect(await Outbox.traiterLesDus()).toBe(0);
    expect(db.outboxMessage.update).toHaveBeenLastCalledWith({
      where: { id: "message" },
      data: expect.objectContaining({ status: "PENDING", lastError: "SMTP indisponible", nextAttemptAt: expect.any(Date) }),
    });
    db.outboxMessage.findMany.mockResolvedValue([{ ...message, attempts: 1 }]);
    expect(await Outbox.traiterLesDus()).toBe(1);
    expect(sendEmailVerification).toHaveBeenCalledTimes(2);
    expect(db.outboxMessage.update).toHaveBeenLastCalledWith({ where: { id: "message" }, data: expect.objectContaining({ status: "DONE" }) });
  });
});
