import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  platformSettingsDrive: { findUnique: jest.fn() },
  courseDrive: { findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
  paymentIntentDrive: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  driverPayoutDrive: { upsert: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), aggregate: jest.fn() },
  driverPayoutBatchDrive: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};
const stripe: any = { paymentIntents: { create: jest.fn() } };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../payments/stripe", () => ({ stripe, STRIPE_CONFIG: { currency: "eur" } }));
import { ZupDrivePaymentService } from "../zupdrive-payment.service";
import { ZupDrivePaymentDriverService } from "../zupdrive-payment-driver.service";
import { ZupDriveMonitoringService } from "../zupdrive-monitoring.service";
import { debutSemaineVersement, finSemaineVersement } from "../semaine-versement";

const paiement = (extra: any = {}) => ({
  id: "pay-1", courseId: "course-1", status: "REQUIRES_PAYMENT_METHOD", driverEarningsCentimes: 1200, currency: "EUR",
  course: { chauffeurId: "c1", chauffeur: { id: "c1" } }, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.platformSettingsDrive.findUnique.mockResolvedValue(null);
  db.courseDrive.findUniqueOrThrow.mockResolvedValue({ id: "course-1", departAdresse: "A", arriveeAdresse: "B" });
  db.paymentIntentDrive.findUnique.mockResolvedValue(null);
  db.paymentIntentDrive.create.mockImplementation(async ({ data }: any) => ({ id: "pay-1", ...data }));
  stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", status: "requires_payment_method", client_secret: "secret" });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.driverPayoutDrive.upsert.mockImplementation(async ({ create }: any) => ({ id: "po-1", ...create }));
});
afterEach(() => { jest.useRealTimers(); });

describe("commission : une seule règle", () => {
  it("le paiement utilise le pourcentage de PlatformSettingsDrive, pas un 0,2 en dur", async () => {
    db.platformSettingsDrive.findUnique.mockResolvedValue({ commissionPercentage: 25 });
    await ZupDrivePaymentService.createPaymentIntent("course-1", "p1", 1001);
    expect(db.paymentIntentDrive.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCentimes: 1001, platformCommissionCentimes: 250, driverEarningsCentimes: 751 }),
    });
  });

  it("sans ligne de réglages : 20 % ; la somme des parts est exacte", async () => {
    await ZupDrivePaymentService.createPaymentIntent("course-1", "p1", 1001);
    const data = db.paymentIntentDrive.create.mock.calls[0][0].data;
    expect(data.platformCommissionCentimes).toBe(200);
    expect(data.platformCommissionCentimes + data.driverEarningsCentimes).toBe(1001);
  });

  it("un versement préparé garde le montant figé du paiement, même si le pourcentage a changé depuis", async () => {
    db.paymentIntentDrive.findMany.mockResolvedValue([{ id: "pay-1", driverEarningsCentimes: 1200, currency: "EUR" }]);
    db.driverPayoutDrive.createMany.mockResolvedValue({ count: 1 });
    db.platformSettingsDrive.findUnique.mockResolvedValue({ commissionPercentage: 50 }); // changé après le paiement
    const resultat = await ZupDrivePaymentDriverService.preparePayout("c1");
    expect(db.driverPayoutDrive.createMany.mock.calls[0][0].data[0].amountCentimes).toBe(1200);
    expect(resultat.amount).toBe(1200);
    expect(db.platformSettingsDrive.findUnique).not.toHaveBeenCalled();
  });

  it("les gains de la supervision arrondissent course par course, comme repartirPrixCourse", async () => {
    db.platformSettingsDrive.findUnique.mockResolvedValue({ commissionPercentage: 25 });
    db.courseDrive.findMany.mockResolvedValue([{ prixCentimes: 1002 }, { prixCentimes: 1002 }, { prixCentimes: 1002 }]);
    // 1002 × 25 % = 250,5 → commission 251 → chauffeur 751 ; ×3 = 2253 (arrondir le total donnerait 2254).
    await expect(ZupDriveMonitoringService.getGainsChauffeur("c1", new Date(0))).resolves.toEqual({ gainsCentimes: 2253, nombreCourses: 3 });
  });
});

describe("semaine des lots de versement", () => {
  it("lundi 00:00 UTC, pour n'importe quel instant de la semaine", () => {
    expect(debutSemaineVersement(new Date("2026-10-07T14:35:12.345Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z"); // mercredi
    expect(debutSemaineVersement(new Date("2026-10-05T00:00:00.000Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z"); // lundi pile
    expect(debutSemaineVersement(new Date("2026-10-11T23:59:59.999Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z"); // dimanche
  });

  it("une semaine fait toujours 7 jours exacts, changement d'heure compris", () => {
    const debut = debutSemaineVersement(new Date("2026-03-25T10:00:00.000Z")); // semaine du passage à l'heure d'été
    expect(finSemaineVersement(debut).toISOString()).toBe("2026-03-30T00:00:00.000Z");
    expect(finSemaineVersement(debut).getTime() - debut.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it("le webhook de paiement et preparePayout rangent leurs versements dans la même période", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-07T14:35:12.345Z"));
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    await ZupDrivePaymentService.handlePaymentSucceeded("pi_1");
    const periodeWebhook = db.driverPayoutDrive.upsert.mock.calls[0][0].create;

    db.paymentIntentDrive.findMany.mockResolvedValue([{ id: "pay-2", driverEarningsCentimes: 800, currency: "EUR" }]);
    db.driverPayoutDrive.createMany.mockResolvedValue({ count: 1 });
    await ZupDrivePaymentDriverService.preparePayout("c1");
    const periodePrepare = db.driverPayoutDrive.createMany.mock.calls[0][0].data[0];

    expect(periodeWebhook.periodStart.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periodePrepare.periodStart.getTime()).toBe(periodeWebhook.periodStart.getTime());
    expect(periodePrepare.periodEnd.getTime()).toBe(periodeWebhook.periodEnd.getTime());
  });
});

describe("webhook de paiement : rejouable", () => {
  it("un même événement reçu deux fois ne crée qu'un versement (upsert sur paymentId unique)", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    await ZupDrivePaymentService.handlePaymentSucceeded("pi_1");
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ status: "SUCCEEDED" }));
    await ZupDrivePaymentService.handlePaymentSucceeded("pi_1");

    expect(db.driverPayoutDrive.upsert).toHaveBeenCalledTimes(2);
    for (const [appel] of db.driverPayoutDrive.upsert.mock.calls) {
      expect(appel.where).toEqual({ paymentId: "pay-1" });
      expect(appel.update).toEqual({}); // le second appel ne réécrit rien
    }
    expect(db.paymentIntentDrive.update).toHaveBeenCalledTimes(1); // pas de SUCCEEDED rejoué
  });

  it("le versement reprend le revenu chauffeur figé sur le paiement", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ driverEarningsCentimes: 751 }));
    await ZupDrivePaymentService.handlePaymentSucceeded("pi_1");
    expect(db.driverPayoutDrive.upsert.mock.calls[0][0].create.amountCentimes).toBe(751);
  });
});

describe("lot hebdomadaire", () => {
  const verser = (id: string, montant: number) => ({ id, amountCentimes: montant });

  it("rassemble les versements de la semaine (même ceux dont l'heure n'est pas minuit) sans reprendre ceux déjà rattachés", async () => {
    db.driverPayoutDrive.findMany.mockResolvedValue([verser("a", 1200), verser("b", 800)]);
    db.driverPayoutBatchDrive.findFirst.mockResolvedValue(null);
    db.driverPayoutBatchDrive.create.mockResolvedValue({ id: "lot-1", status: "PENDING" });
    db.driverPayoutDrive.aggregate.mockResolvedValue({ _sum: { amountCentimes: 2000 }, _count: 2 });
    db.driverPayoutBatchDrive.update.mockResolvedValue({ id: "lot-1", status: "PENDING" });

    await ZupDrivePaymentService.createWeeklyBatch(new Date("2026-10-07T14:35:00.000Z"));

    expect(db.driverPayoutDrive.findMany).toHaveBeenCalledWith({
      where: { status: "PENDING", batchId: null, periodStart: { gte: new Date("2026-10-05T00:00:00.000Z"), lt: new Date("2026-10-12T00:00:00.000Z") } },
    });
    expect(db.driverPayoutDrive.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] }, batchId: null }, data: { batchId: "lot-1" } });
  });

  it("un lot existant voit son total recalculé quand un versement s'y ajoute", async () => {
    db.driverPayoutDrive.findMany.mockResolvedValue([verser("c", 500)]);
    db.driverPayoutBatchDrive.findFirst.mockResolvedValue({ id: "lot-1", status: "PENDING" });
    db.driverPayoutDrive.aggregate.mockResolvedValue({ _sum: { amountCentimes: 2500 }, _count: 3 });
    db.driverPayoutBatchDrive.update.mockResolvedValue({ id: "lot-1", status: "PENDING" });

    await ZupDrivePaymentService.createWeeklyBatch(new Date("2026-10-07T00:00:00.000Z"));

    expect(db.driverPayoutBatchDrive.update).toHaveBeenCalledWith({ where: { id: "lot-1" }, data: { totalAmountCentimes: 2500, payoutCount: 3 } });
  });

  it("un lot déjà soumis à Stripe ne reçoit plus rien : 409", async () => {
    db.driverPayoutDrive.findMany.mockResolvedValue([verser("d", 500)]);
    db.driverPayoutBatchDrive.findFirst.mockResolvedValue({ id: "lot-1", status: "SUBMITTED" });
    await expect(ZupDrivePaymentService.createWeeklyBatch(new Date("2026-10-07T00:00:00.000Z"))).rejects.toMatchObject({ statusCode: 409, code: "BATCH_ALREADY_SUBMITTED" });
    expect(db.driverPayoutDrive.updateMany).not.toHaveBeenCalled();
  });
});
