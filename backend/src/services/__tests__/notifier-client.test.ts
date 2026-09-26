import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  pushDevice: { findMany: jest.fn(), deleteMany: jest.fn() },
};

jest.mock("../db", () => ({ db }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../config/socket", () => ({ emitMerchantEvent: jest.fn() }));
jest.mock("../email.service", () => ({ EmailService: { sendEmail: jest.fn() } }));

import { Notifier } from "../notifier.service";

const fetchMock = jest.fn(async (_url: string, _init?: any) => ({
  ok: true,
  json: async () => ({ data: [{ status: "ok" }] }),
}));

describe("Notifier.pushClient vers l'application client", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    db.pushDevice.findMany.mockClear();
    (global as any).fetch = fetchMock;
    db.pushDevice.findMany.mockResolvedValue([{ token: "ExponentPushToken[client]" }]);
  });

  it("pousse sur les téléphones de l'application client du compte, commande jointe", async () => {
    const envoyes = await Notifier.pushClient("Client@Exemple.fr", {
      title: "Commande acceptée",
      body: "Prête vers 12 h 40.",
      data: { tag: "commande", orderId: "cmd-1" },
    });

    expect(envoyes).toBe(1);
    expect(db.pushDevice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { app: "customer", user: { email: { equals: "Client@Exemple.fr", mode: "insensitive" } } },
      })
    );
    const [message] = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(message).toMatchObject({
      to: "ExponentPushToken[client]",
      title: "Commande acceptée",
      data: { tag: "commande", orderId: "cmd-1" },
    });
  });

  it("ne cherche rien pour une commande sans e-mail", async () => {
    const envoyes = await Notifier.pushClient(null, { title: "…", body: "…" });

    expect(envoyes).toBe(0);
    expect(db.pushDevice.findMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ne dérange personne quand aucun téléphone n'est connecté", async () => {
    db.pushDevice.findMany.mockResolvedValue([]);

    const envoyes = await Notifier.pushClient("invite@exemple.fr", { title: "…", body: "…" });

    expect(envoyes).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
