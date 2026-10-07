import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx: any = {
  $executeRaw: jest.fn(),
  merchantPayout: { findMany: jest.fn(), updateMany: jest.fn() },
  courierPayout: { findMany: jest.fn(), updateMany: jest.fn() },
  payoutBatch: { create: jest.fn(), updateMany: jest.fn() },
};
const db: any = {
  ...tx,
  $transaction: jest.fn(async (f: any) => f(tx)),
  payoutBatch: { ...tx.payoutBatch, findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../config/env", () => ({
  getEnv: () => ({ SEPA_DEBTOR_NAME: "ZupEat SRL", SEPA_DEBTOR_IBAN: "BE68539007547034", PAYOUTS_START_DATE: undefined }),
}));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../driver-payout.service", () => ({ DriverPayoutService: { arreterTous: jest.fn() }, MOYENS_VERSEMENT: [] }));
const comparePassword = jest.fn();
jest.mock("../../auth/auth.service", () => ({ AuthService: { comparePassword } }));

import { PayoutBatchService } from "../payout-batch.service";

const IBAN = "BE68539007547034";
const periode = { periodStart: new Date("2026-09-28T00:00:00Z"), periodEnd: new Date("2026-10-05T00:00:00Z") };
const releveCommercant = { id: "mp-1", amount: 120.5, ...periode, org: { name: "Chez Luigi", legalName: null, iban: IBAN, bic: null, accountHolder: null } };
const releveLivreur = { id: "cp-1", amount: 40, ...periode, driver: { name: "Sam", iban: IBAN, bic: null, accountHolder: null } };

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (f: any) => f(tx));
});

describe("préparation d'un lot", () => {
  it("fige bénéficiaires, IBAN et montants, et rattache les relevés au lot", async () => {
    tx.merchantPayout.findMany.mockResolvedValue([releveCommercant]);
    tx.courierPayout.findMany.mockResolvedValue([releveLivreur]);
    tx.payoutBatch.create.mockImplementation(async ({ data }: any) => ({ id: "lot-1", ...data }));
    tx.merchantPayout.updateMany.mockResolvedValue({ count: 1 });
    tx.courierPayout.updateMany.mockResolvedValue({ count: 1 });

    const { lot } = await PayoutBatchService.preparer("admin-1");

    const donnees = tx.payoutBatch.create.mock.calls[0][0].data;
    expect(donnees).toMatchObject({ status: "PREPARED", total: 160.5, itemCount: 2, createdBy: "admin-1" });
    expect(donnees.itemsJson.map((l: any) => [l.kind, l.payoutId, l.iban, l.montant])).toEqual([
      ["commercant", "mp-1", IBAN, 120.5],
      ["livreur", "cp-1", IBAN, 40],
    ]);
    // Seuls les relevés encore libres entrent dans un lot.
    expect(tx.merchantPayout.findMany.mock.calls[0][0].where).toMatchObject({ status: "PENDING", batchId: null });
    expect(tx.merchantPayout.updateMany.mock.calls[0][0].where).toMatchObject({ batchId: null, status: "PENDING" });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    // Le lot rendu ne montre pas les IBAN complets.
    expect((lot as any).itemsJson).toBeUndefined();
  });

  it("deux préparations consécutives : les relevés déjà dans un lot ne sont plus proposés", async () => {
    tx.merchantPayout.findMany.mockResolvedValue([]);
    tx.courierPayout.findMany.mockResolvedValue([]);
    await expect(PayoutBatchService.preparer("admin-1")).rejects.toMatchObject({ code: "NOTHING_TO_PAY" });
    expect(tx.payoutBatch.create).not.toHaveBeenCalled();
  });

  it("un relevé qui a bougé pendant la préparation annule tout", async () => {
    tx.merchantPayout.findMany.mockResolvedValue([releveCommercant]);
    tx.courierPayout.findMany.mockResolvedValue([]);
    tx.payoutBatch.create.mockResolvedValue({ id: "lot-1" });
    tx.merchantPayout.updateMany.mockResolvedValue({ count: 0 });
    await expect(PayoutBatchService.preparer("admin-1")).rejects.toMatchObject({ code: "BATCH_CONFLICT" });
  });

  it("écarte un bénéficiaire sans IBAN valide, qui reste en attente hors lot", async () => {
    tx.merchantPayout.findMany.mockResolvedValue([releveCommercant, { ...releveCommercant, id: "mp-2", org: { ...releveCommercant.org, iban: null } }]);
    tx.courierPayout.findMany.mockResolvedValue([]);
    tx.payoutBatch.create.mockImplementation(async ({ data }: any) => ({ id: "lot-1", ...data }));
    tx.merchantPayout.updateMany.mockResolvedValue({ count: 1 });
    const { ecartes } = await PayoutBatchService.preparer("admin-1");
    expect(ecartes.map((e) => e.id)).toEqual(["mp-2"]);
    expect(tx.merchantPayout.updateMany.mock.calls[0][0].where.id.in).toEqual(["mp-1"]);
  });
});

describe("approbation", () => {
  it("exige le mot de passe de l'administrateur", async () => {
    db.user.findUnique.mockResolvedValue({ passwordHash: "hash" });
    comparePassword.mockResolvedValue(false as never);
    await expect(PayoutBatchService.approuver("lot-1", "admin-1", "mauvais")).rejects.toMatchObject({ code: "REAUTH_FAILED" });
    expect(db.payoutBatch.updateMany).not.toHaveBeenCalled();
  });

  it("approuve un lot préparé, une seule fois", async () => {
    db.user.findUnique.mockResolvedValue({ passwordHash: "hash" });
    comparePassword.mockResolvedValue(true as never);
    db.payoutBatch.updateMany.mockResolvedValue({ count: 1 });
    db.payoutBatch.findUnique.mockResolvedValue({ id: "lot-1", status: "APPROVED" });
    await PayoutBatchService.approuver("lot-1", "admin-1", "bon");
    expect(db.payoutBatch.updateMany.mock.calls[0][0].where).toEqual({ id: "lot-1", status: { in: ["PREPARED"] } });

    db.payoutBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(PayoutBatchService.approuver("lot-1", "admin-1", "bon")).rejects.toMatchObject({ code: "BATCH_STATE_CONFLICT" });
  });
});

describe("export du fichier SEPA", () => {
  const lot = (surcharge: object = {}) => ({
    id: "lot-1",
    reference: "VERSEMENTS-202610061200",
    status: "APPROVED",
    exportedAt: null,
    xmlSha256: null,
    itemsJson: [
      { kind: "commercant", payoutId: "mp-1", id: "MP-mp-1", nom: "Chez Luigi", iban: IBAN, bic: null, montant: 120.5, communication: "Reversement" },
    ],
    ...surcharge,
  });

  it("refuse d'exporter un lot non approuvé", async () => {
    db.payoutBatch.findUnique.mockResolvedValue(lot({ status: "PREPARED" }));
    await expect(PayoutBatchService.exporter("lot-1", "admin-1")).rejects.toMatchObject({ code: "BATCH_NOT_APPROVED" });
  });

  it("le premier export fige l'empreinte ; le suivant rend exactement le même fichier", async () => {
    db.payoutBatch.findUnique.mockResolvedValue(lot());
    db.payoutBatch.updateMany.mockResolvedValue({ count: 1 });
    const premier = await PayoutBatchService.exporter("lot-1", "admin-1");
    const miseAJour = db.payoutBatch.updateMany.mock.calls[0][0].data;
    expect(miseAJour).toMatchObject({ status: "EXPORTED", exportedBy: "admin-1" });
    expect(premier.xml).toContain("120.50");

    db.payoutBatch.findUnique.mockResolvedValue(lot({ status: "EXPORTED", exportedAt: miseAJour.exportedAt, xmlSha256: miseAJour.xmlSha256 }));
    const second = await PayoutBatchService.exporter("lot-1", "admin-1");
    expect(second.xml).toBe(premier.xml);
  });

  it("refuse un lot altéré depuis son export", async () => {
    db.payoutBatch.findUnique.mockResolvedValue(lot());
    db.payoutBatch.updateMany.mockResolvedValue({ count: 1 });
    await PayoutBatchService.exporter("lot-1", "admin-1");
    const { exportedAt, xmlSha256 } = db.payoutBatch.updateMany.mock.calls[0][0].data;

    const altere = lot({ status: "EXPORTED", exportedAt, xmlSha256, itemsJson: [{ ...lot().itemsJson[0], montant: 9999 }] });
    db.payoutBatch.findUnique.mockResolvedValue(altere);
    await expect(PayoutBatchService.exporter("lot-1", "admin-1")).rejects.toMatchObject({ code: "BATCH_TAMPERED" });
  });
});

describe("clôture du lot", () => {
  it("confirmer ne marque versés que les relevés du lot", async () => {
    db.payoutBatch.findUnique.mockResolvedValue({ id: "lot-1", reference: "REF" });
    tx.payoutBatch.updateMany.mockResolvedValue({ count: 1 });
    tx.merchantPayout.updateMany.mockResolvedValue({ count: 1 });
    tx.courierPayout.updateMany.mockResolvedValue({ count: 1 });
    db.merchantPayout.findMany.mockResolvedValue([]);

    expect(await PayoutBatchService.confirmer("lot-1", "admin-1", "BANQUE-42")).toEqual({ commercants: 1, livreurs: 1 });
    expect(tx.merchantPayout.updateMany.mock.calls[0][0].where).toEqual({ batchId: "lot-1", status: "PENDING" });
    expect(tx.courierPayout.updateMany.mock.calls[0][0].where).toEqual({ batchId: "lot-1", status: "PENDING" });
    expect(tx.payoutBatch.updateMany.mock.calls[0][0].where.status.in).toEqual(["EXPORTED", "SUBMITTED"]);
  });

  it("confirmer deux fois est refusé : pas de second versement", async () => {
    db.payoutBatch.findUnique.mockResolvedValue({ id: "lot-1", reference: "REF" });
    tx.payoutBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(PayoutBatchService.confirmer("lot-1", "admin-1")).rejects.toMatchObject({ code: "BATCH_STATE_CONFLICT" });
    expect(tx.merchantPayout.updateMany).not.toHaveBeenCalled();
  });

  it("un refus de la banque libère les relevés, qui redeviennent proposables", async () => {
    tx.payoutBatch.updateMany.mockResolvedValue({ count: 1 });
    await PayoutBatchService.rejeter("lot-1", "admin-1", "fichier refusé");
    expect(tx.merchantPayout.updateMany).toHaveBeenCalledWith({ where: { batchId: "lot-1", status: "PENDING" }, data: { batchId: null } });
    expect(tx.courierPayout.updateMany).toHaveBeenCalledWith({ where: { batchId: "lot-1", status: "PENDING" }, data: { batchId: null } });
  });

  it("annuler n'est possible qu'avant l'export", async () => {
    tx.payoutBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(PayoutBatchService.annuler("lot-1", "admin-1")).rejects.toMatchObject({ code: "BATCH_STATE_CONFLICT" });
    expect(tx.payoutBatch.updateMany.mock.calls[0][0].where.status.in).toEqual(["PREPARED", "APPROVED"]);
  });
});
