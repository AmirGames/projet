import "dotenv/config";

/**
 * Concurrence réelle sur PostgreSQL : les verrous et les écritures conditionnelles
 * des reversements (C-08) et des lots bancaires (C-09). Une base simulée ne peut
 * pas prouver cela : les deux appels doivent réellement s'exécuter en même temps.
 *
 * Chaque test crée ses propres lignes (identifiants uniques) et ne dépend d'aucune autre suite.
 */

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../../config/env", () => {
  const reel = jest.requireActual("../../../config/env") as typeof import("../../../config/env");
  return {
    ...reel,
    getEnv: () => ({
      ...reel.getEnv(),
      PAYOUTS_START_DATE: undefined,
      SEPA_DEBTOR_NAME: "ZupEat SRL",
      SEPA_DEBTOR_IBAN: "BE68539007547034",
    }),
  };
});

import { db } from "../../../services/db";
import { MerchantPayoutService } from "../merchant-payout.service";
import { PayoutBatchService } from "../payout-batch.service";

// Clés de chiffrement stables : sans elles, chaque processus en tire d'autres et
// ne relit pas les lignes (IBAN chiffrés) laissées par un passage précédent.
process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ pgtest: Buffer.alloc(32, 77).toString("base64") });
process.env.DATA_ENCRYPTION_ACTIVE_KEY = "pgtest";

const unique = `pg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const debut = new Date("2026-09-28T00:00:00Z");
const fin = new Date("2026-10-05T00:00:00Z");

async function nouvelleOrganisation(suffixe: string, iban: string | null = "BE68539007547034") {
  const org = await db.organization.create({
    data: { name: `Org ${unique}-${suffixe}`, slug: `${unique}-${suffixe}`, iban },
  });
  organisations.push(org.id);
  const store = await db.store.create({ data: { orgId: org.id, name: "Boutique", slug: `${unique}-${suffixe}-s` } });
  return { org, store };
}

async function commandeTerminee(storeId: string, n: number) {
  const order = await db.order.create({
    data: {
      storeId,
      customerName: "Client",
      customerEmail: `c${n}-${unique}@example.test`,
      customerPhone: "0470000000",
      deliveryType: "PICKUP",
      status: "COMPLETED",
      totalAmount: 20,
      taxAmount: 0,
      feesAmount: 0,
      commissionAmount: 1,
      paymentStatus: "SUCCEEDED",
      paymentId: `pi_${unique}_${n}`,
      createdAt: new Date("2026-09-30T10:00:00Z"),
    },
  });
  return order;
}

const organisations: string[] = [];

afterAll(async () => {
  // La base de test est partagée entre passages : on retire ce qu'on a créé.
  const releves = await db.merchantPayout.findMany({ where: { orgId: { in: organisations } }, select: { id: true, batchId: true } });
  await db.order.deleteMany({ where: { store: { orgId: { in: organisations } } } });
  await db.merchantPayout.deleteMany({ where: { id: { in: releves.map((r) => r.id) } } });
  await db.payoutBatch.deleteMany({ where: { id: { in: releves.map((r) => r.batchId).filter((b): b is string => !!b) } } });
  await db.store.deleteMany({ where: { orgId: { in: organisations } } });
  await db.organization.deleteMany({ where: { id: { in: organisations } } });
  await db.$disconnect();
});

describe("C-08 : deux arrêtés simultanés du même commerçant", () => {
  it("un seul relevé, chaque commande rattachée une seule fois", async () => {
    const { org, store } = await nouvelleOrganisation("a");
    for (let n = 0; n < 5; n++) await commandeTerminee(store.id, n);

    const resultats = await Promise.allSettled(
      Array.from({ length: 4 }, () => MerchantPayoutService.arreter(org.id, debut, fin)),
    );

    const releves = await db.merchantPayout.findMany({ where: { orgId: org.id } });
    expect(releves).toHaveLength(1);
    expect(releves[0].orderCount).toBe(5);
    expect(Number(releves[0].amount)).toBe(95); // 5 × (20 − 1 de commission)

    const commandes = await db.order.findMany({ where: { storeId: store.id } });
    expect(commandes.every((c) => c.merchantPayoutId === releves[0].id)).toBe(true);

    // Les autres passages n'ont rien à arrêter : jamais une erreur, jamais un second relevé.
    const crees = resultats.filter((r) => r.status === "fulfilled" && r.value);
    expect(crees).toHaveLength(1);
    expect(resultats.filter((r) => r.status === "rejected")).toHaveLength(0);
  });
});

describe("C-09 : deux préparations simultanées de lot", () => {
  it("un relevé n'entre que dans un seul lot actif", async () => {
    const { org } = await nouvelleOrganisation("b");
    const releve = await db.merchantPayout.create({
      data: { orgId: org.id, periodStart: debut, periodEnd: fin, orderCount: 1, amount: 50, status: "PENDING", lines: [] },
    });

    const resultats = await Promise.allSettled([
      PayoutBatchService.preparer("admin-a"),
      PayoutBatchService.preparer("admin-b"),
    ]);

    const relu = await db.merchantPayout.findUnique({ where: { id: releve.id } });
    expect(relu!.batchId).toBeTruthy();

    // Les relevés en attente de toute la base (autres suites comprises) peuvent
    // entrer dans l'un ou l'autre lot, mais notre relevé n'est que dans un seul.
    const lots = await db.payoutBatch.findMany({ where: { merchantPayouts: { some: { id: releve.id } } } });
    expect(lots).toHaveLength(1);
    expect(resultats.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);

    await PayoutBatchService.annuler(lots[0].id, "admin-a", "test");
    const libere = await db.merchantPayout.findUnique({ where: { id: releve.id } });
    expect(libere!.batchId).toBeNull();
  });

  it("confirmer deux fois le même lot ne marque versé qu'une fois", async () => {
    const { org } = await nouvelleOrganisation("c");
    const releve = await db.merchantPayout.create({
      data: { orgId: org.id, periodStart: debut, periodEnd: fin, orderCount: 1, amount: 40, status: "PENDING", lines: [] },
    });
    await PayoutBatchService.preparer("admin-a");
    const lot = (await db.merchantPayout.findUnique({ where: { id: releve.id }, select: { batchId: true } }))!.batchId!;
    await db.payoutBatch.update({ where: { id: lot }, data: { status: "EXPORTED", exportedAt: new Date() } });

    const resultats = await Promise.allSettled([
      PayoutBatchService.confirmer(lot, "admin-a", "REF-1"),
      PayoutBatchService.confirmer(lot, "admin-b", "REF-2"),
    ]);

    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejete = resultats.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejete.reason.code).toBe("BATCH_STATE_CONFLICT");
    const relu = await db.merchantPayout.findUnique({ where: { id: releve.id } });
    expect(relu!.status).toBe("PAID");
  });
});
