import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { db, ClientTransaction } from "../../../services/db";

jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../../config/env", () => ({
  getEnv: () => ({
    SEPA_DEBTOR_NAME: "Test A04",
    SEPA_DEBTOR_IBAN: "BE68539007547034",
  }),
}));
import { DriverPayoutService } from "../driver-payout.service";
import { PayoutBatchService } from "../payout-batch.service";
import { diagnostiquerVersements } from "../payout-diagnostic.service";

jest.setTimeout(30000);

const integration =
  process.env.PAYOUT_INTEGRATION === "true" ? describe : describe.skip;
integration("A04 — concurrence réelle PostgreSQL", () => {
  // Même trousseau de test que les suites PostgreSQL historiques du module.
  process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({
    pgtest: Buffer.alloc(32, 77).toString("base64"),
  });
  process.env.DATA_ENCRYPTION_ACTIVE_KEY = "pgtest";
  const prefixe = `a04-${randomUUID()}`;
  const observateur = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  const transaction = db.$transaction.bind(db);
  const periode = {
    periodStart: new Date("2026-09-28"),
    periodEnd: new Date("2026-10-05"),
  };
  let driverId: string;
  let storeId: string;
  let payoutId: string;
  let orderId: string;
  let orgId: string;

  beforeAll(async () => {
    if (!/test/i.test(new URL(process.env.DATABASE_URL!).pathname))
      throw new Error("Base de test dédiée obligatoire");
    await observateur.connect();
    orgId = (
      await db.organization.create({ data: { name: prefixe, slug: prefixe } })
    ).id;
    storeId = (
      await db.store.create({ data: { orgId, name: prefixe, slug: prefixe } })
    ).id;
    driverId = (
      await db.courier.create({
        data: {
          name: prefixe,
          email: `${prefixe}@example.test`,
          phone: "000",
          vehicleType: "bike",
          iban: "BE68539007547034",
        },
      })
    ).id;
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.orderDelivery.deleteMany({ where: { driverId } });
    await db.courierTip.deleteMany({ where: { driverId } });
    await db.courierPayout.deleteMany({ where: { driverId } });
    await db.payoutBatch.deleteMany({ where: { createdBy: prefixe } });
    await db.order.deleteMany({ where: { storeId } });
    orderId = (
      await db.order.create({
        data: {
          storeId,
          customerName: prefixe,
          customerEmail: `${prefixe}@example.test`,
          customerPhone: "000",
          deliveryType: "DELIVERY",
          status: "COMPLETED",
          totalAmount: 20,
          taxAmount: 0,
          feesAmount: 8.25,
        },
      })
    ).id;
    const r = await db.courierPayout.create({
      data: { driverId, ...periode, deliveryCount: 1, amount: 10.75 },
    });
    payoutId = r.id;
    await db.orderDelivery.create({
      data: {
        orderId,
        driverId,
        status: "DELIVERED",
        deliveryTime: new Date("2026-10-01"),
        driverPayout: 8.25,
        payoutId,
      },
    });
    await db.courierTip.create({
      data: {
        orderId,
        driverId,
        amount: 2.5,
        status: "PAID",
        paidAt: new Date("2026-10-01"),
        payoutId,
      },
    });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    const lots = await db.payoutBatch.findMany({
      where: { createdBy: prefixe },
      select: { id: true },
    });
    await db.notification.deleteMany({
      where: { recipientEmail: `${prefixe}@example.test` },
    });
    await db.orderDelivery.deleteMany({ where: { driverId } });
    await db.courierTip.deleteMany({ where: { driverId } });
    await db.courierPayout.deleteMany({ where: { driverId } });
    await db.payoutBatch.deleteMany({
      where: { id: { in: lots.map((l) => l.id) } },
    });
    await db.order.deleteMany({ where: { storeId } });
    await db.store.delete({ where: { id: storeId } });
    await db.organization.delete({ where: { id: orgId } });
    await db.courier.delete({ where: { id: driverId } });
    await observateur.end();
    await db.$disconnect();
  });

  /** Bloquer le gagnant APRÈS sa vraie écriture, donc verrou de ligne détenu.
   * Libérer seulement quand PostgreSQL atteste que le perdant attend ce verrou.
   * Aucun délai arbitraire ne détermine l'ordre des opérations. */
  async function course(
    gagnant: () => Promise<unknown>,
    perdant: () => Promise<unknown>,
    modele: "courierPayout" | "payoutBatch" | "orderDelivery" = "courierPayout",
    doitAttendre = true,
  ) {
    let debloquer!: () => void;
    let signaler!: () => void;
    const barriere = new Promise<void>((r) => {
      debloquer = r;
    });
    const verrouille = new Promise<void>((r) => {
      signaler = r;
    });
    let premiere = true;
    const espion = jest.spyOn(db, "$transaction").mockImplementation((async (
      f: (tx: ClientTransaction) => Promise<unknown>,
    ) => {
      const intercepter = premiere;
      premiere = false;
      return transaction(
        async (tx) => {
          const proxy = new Proxy(tx, {
            get(cible, propriete) {
              if (!intercepter || propriete !== modele)
                return Reflect.get(cible, propriete);
              return new Proxy(tx[modele], {
                get(delegate, operation) {
                  if (operation !== "updateMany")
                    return Reflect.get(delegate, operation);
                  return async (args: any) => {
                    const resultat = await (delegate.updateMany as any)(args);
                    if (resultat.count > 0) {
                      signaler();
                      await barriere;
                    }
                    return resultat;
                  };
                },
              });
            },
          });
          return f(proxy);
        },
        { timeout: 15000 },
      );
    }) as any);
    const a = gagnant();
    // Propager un éventuel échec sans laisser attendre la barrière.
    await Promise.race([
      verrouille,
      a.then(() => {
        throw new Error("Le gagnant n'a pas pris le verrou attendu");
      }),
    ]);
    const b = perdant();
    const resultatB = b.then(
      (value) => ({ value, erreur: undefined }),
      (erreur: any) => ({ value: undefined, erreur }),
    );
    let erreurAttente: unknown;
    try {
      if (!doitAttendre) {
        // Un relevé déjà dans un lot est inadmissible même avant la clôture.
        expect((await resultatB).erreur).toBeDefined();
      } else {
        const limite = Date.now() + 8000;
        let attente = false;
        while (Date.now() < limite) {
          const r = await observateur.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0",
          );
          if (r.rowCount) {
            attente = true;
            break;
          }
          await new Promise<void>((r) => setImmediate(r));
        }
        expect(attente).toBe(true);
      }
    } catch (err) {
      erreurAttente = err;
    } finally {
      debloquer();
    }
    try {
      await a;
      const resultat = await resultatB;
      if (erreurAttente) throw erreurAttente;
      return resultat;
    } finally {
      espion.mockRestore();
    }
  }
  const payer = () =>
    DriverPayoutService.payer(
      payoutId,
      { method: "CASH", reference: "preuve A04" },
      prefixe,
    );
  const annuler = () => DriverPayoutService.annuler(payoutId, "test A04");
  const preparer = () => PayoutBatchService.preparer(prefixe);
  async function verifier(status: string, rattache: boolean) {
    const r = await db.courierPayout.findUniqueOrThrow({
      where: { id: payoutId },
    });
    expect(r.status).toBe(status);
    expect(Number(r.amount)).toBe(10.75);
    expect(
      (await db.orderDelivery.findUniqueOrThrow({ where: { orderId } }))
        .payoutId,
    ).toBe(rattache ? payoutId : null);
    expect(
      (await db.courierTip.findUniqueOrThrow({ where: { orderId } })).payoutId,
    ).toBe(rattache ? payoutId : null);
    expect(
      Number(
        (await db.courierTip.findUniqueOrThrow({ where: { orderId } })).amount,
      ),
    ).toBe(2.5);
    return r;
  }
  async function exporter() {
    const { lot } = await preparer();
    // Précondition approuvée en base, sans authentification externe ni banque.
    await db.payoutBatch.update({
      where: { id: lot.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedBy: prefixe },
    });
    const premier = await PayoutBatchService.exporter(lot.id, prefixe);
    await db.courier.update({
      where: { id: driverId },
      data: { iban: "BE71096123456769" },
    });
    expect((await PayoutBatchService.exporter(lot.id, prefixe)).xml).toBe(
      premier.xml,
    );
    await db.courier.update({
      where: { id: driverId },
      data: { iban: "BE68539007547034" },
    });
    return lot.id;
  }

  it.each(["payer", "annuler"] as const)(
    "préparation gagne contre %s",
    async (action) => {
      const r = await course(preparer, action === "payer" ? payer : annuler);
      expect(r.erreur).toMatchObject({
        statusCode: 409,
        code: "PAYOUT_IN_BATCH",
      });
      expect((await verifier("PENDING", true)).batchId).not.toBeNull();
    },
  );
  it.each(["payer", "annuler"] as const)(
    "%s gagne contre préparation ; lot incomplet annulé",
    async (action) => {
      const r = await course(action === "payer" ? payer : annuler, preparer);
      expect(r.erreur).toMatchObject({
        statusCode: 409,
        code: "BATCH_CONFLICT",
      });
      expect(
        (
          await verifier(
            action === "payer" ? "PAID" : "CANCELLED",
            action === "payer",
          )
        ).batchId,
      ).toBeNull();
    },
  );
  it("deux paiements : une seule écriture et une seule notification", async () => {
    const avant = await db.notification.count({
      where: { recipientEmail: `${prefixe}@example.test` },
    });
    expect((await course(payer, payer)).erreur).toMatchObject({
      code: "ALREADY_PAID",
    });
    await verifier("PAID", true);
    expect(
      await db.notification.count({
        where: { recipientEmail: `${prefixe}@example.test` },
      }),
    ).toBe(avant + 1);
    await expect(annuler()).rejects.toMatchObject({ code: "ALREADY_PAID" });
    await verifier("PAID", true);
  });
  it("confirmation gagne contre annulation du relevé ; gains payés jamais libérés", async () => {
    const id = await exporter();
    expect(
      (
        await course(
          () => PayoutBatchService.confirmer(id, prefixe),
          annuler,
          "courierPayout",
          false,
        )
      ).erreur,
    ).toMatchObject({ code: "PAYOUT_IN_BATCH" });
    expect((await verifier("PAID", true)).batchId).toBe(id);
  });
  it("annulation du relevé avant confirmation refusée dès qu'il est dans le lot", async () => {
    const id = await exporter();
    await expect(annuler()).rejects.toMatchObject({ code: "PAYOUT_IN_BATCH" });
    await PayoutBatchService.confirmer(id, prefixe);
    await verifier("PAID", true);
  });
  it("deux confirmations : une seule clôture ; rejeu sans effet", async () => {
    const id = await exporter();
    const confirmer = () =>
      PayoutBatchService.confirmer(id, prefixe, "BANQUE-A04");
    expect(
      (await course(confirmer, confirmer, "payoutBatch")).erreur,
    ).toMatchObject({ code: "BATCH_STATE_CONFLICT" });
    const avant = await verifier("PAID", true);
    await expect(confirmer()).rejects.toMatchObject({
      code: "BATCH_STATE_CONFLICT",
    });
    expect((await verifier("PAID", true)).paidAt).toEqual(avant.paidAt);
  });
  it("confirmation contre refus : aucun relevé payé ne sort du lot", async () => {
    const id = await exporter();
    expect(
      (
        await course(
          () => PayoutBatchService.confirmer(id, prefixe),
          () => PayoutBatchService.rejeter(id, prefixe, "refus"),
          "payoutBatch",
        )
      ).erreur,
    ).toMatchObject({ code: "BATCH_STATE_CONFLICT" });
    expect((await verifier("PAID", true)).batchId).toBe(id);
  });
  it.each(["annuler", "rejeter"] as const)(
    "%s le lot libère uniquement le rattachement ; rejeu ne libère pas un nouveau lot",
    async (action) => {
      const id =
        action === "rejeter" ? await exporter() : (await preparer()).lot.id;
      await PayoutBatchService[action](id, prefixe, "test");
      expect((await verifier("PENDING", true)).batchId).toBeNull();
      const nouveau = (await preparer()).lot.id;
      await expect(
        PayoutBatchService[action](id, prefixe, "test"),
      ).rejects.toMatchObject({ code: "BATCH_STATE_CONFLICT" });
      expect((await verifier("PENDING", true)).batchId).toBe(nouveau);
    },
  );
  it("annulation du relevé rejouée après nouvel arrêté : aucun gain libéré deux fois", async () => {
    await annuler();
    const nouveau = await DriverPayoutService.arreter(
      driverId,
      periode.periodStart,
      periode.periodEnd,
    );
    expect(Number(nouveau.amount)).toBe(10.75);
    await expect(annuler()).rejects.toMatchObject({ code: "PAYOUT_CANCELLED" });
    expect(
      (await db.orderDelivery.findUniqueOrThrow({ where: { orderId } }))
        .payoutId,
    ).toBe(nouveau.id);
    expect(
      (await db.courierTip.findUniqueOrThrow({ where: { orderId } })).payoutId,
    ).toBe(nouveau.id);
  });
  it("deux arrêtés : aucun gain partagé et montant cohérent", async () => {
    await annuler();
    const arreter = () =>
      DriverPayoutService.arreter(
        driverId,
        periode.periodStart,
        periode.periodEnd,
      );
    expect(
      (await course(arreter, arreter, "orderDelivery")).erreur,
    ).toMatchObject({ code: "PAYOUT_EARNINGS_CONFLICT" });
    const courseLiee = await db.orderDelivery.findUniqueOrThrow({
      where: { orderId },
    });
    const tip = await db.courierTip.findUniqueOrThrow({ where: { orderId } });
    expect(courseLiee.payoutId).toBe(tip.payoutId);
    expect(
      Number(
        (
          await db.courierPayout.findUniqueOrThrow({
            where: { id: tip.payoutId! },
          })
        ).amount,
      ),
    ).toBe(10.75);
  });
  it("montant historique incohérent : confirmation et refus roulent intégralement en arrière", async () => {
    const id = await exporter();
    await db.courierPayout.update({
      where: { id: payoutId },
      data: { amount: 11 },
    });
    await expect(
      PayoutBatchService.confirmer(id, prefixe),
    ).rejects.toMatchObject({ code: "BATCH_CONTENT_CONFLICT" });
    await expect(
      PayoutBatchService.rejeter(id, prefixe, "test"),
    ).rejects.toMatchObject({ code: "BATCH_CONTENT_CONFLICT" });
    expect(
      (await db.payoutBatch.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("EXPORTED");
    expect(
      (await db.courierPayout.findUniqueOrThrow({ where: { id: payoutId } }))
        .status,
    ).toBe("PENDING");
    expect(
      (await db.orderDelivery.findUniqueOrThrow({ where: { orderId } }))
        .payoutId,
    ).toBe(payoutId);
  });
  it("échec de libération des pourboires : annulation et courses roulent en arrière", async () => {
    const espion = jest.spyOn(db, "$transaction").mockImplementation((async (
      f: any,
    ) =>
      transaction((tx) =>
        f(
          new Proxy(tx, {
            get(cible, propriete) {
              if (propriete !== "courierTip")
                return Reflect.get(cible, propriete);
              return new Proxy(tx.courierTip, {
                get(delegate, operation) {
                  if (operation !== "updateMany")
                    return Reflect.get(delegate, operation);
                  return async () => {
                    throw new Error("échec simulé");
                  };
                },
              });
            },
          }),
        ),
      )) as any);
    await expect(annuler()).rejects.toThrow("échec simulé");
    espion.mockRestore();
    await verifier("PENDING", true);
  });
  it("diagnostic en lecture seule détecte les historiques sans modifier l'état", async () => {
    const id = (await preparer()).lot.id;
    expect((await diagnostiquerVersements()).ecarts).toEqual([]);
    await db.courierPayout.update({
      where: { id: payoutId },
      data: { status: "CANCELLED" },
    });
    const diagnostic = await diagnostiquerVersements();
    expect(diagnostic.ecarts).toEqual(
      expect.arrayContaining([
        { code: "CANCELLED_WITH_EARNINGS", type: "releve", id: payoutId },
        { code: "PAYOUT_BATCH_STATE", type: "releve", id: payoutId },
        { code: "BATCH_CONTENT_MISMATCH", type: "lot", id },
      ]),
    );
    expect(JSON.stringify(diagnostic)).not.toContain("BE68539007547034");
    expect(
      (await db.courierPayout.findUniqueOrThrow({ where: { id: payoutId } }))
        .status,
    ).toBe("CANCELLED");
    expect(
      (await db.payoutBatch.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("PREPARED");
  });
});
