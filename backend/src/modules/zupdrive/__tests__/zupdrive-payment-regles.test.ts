import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  platformSettingsDrive: { findUnique: jest.fn() },
  courseDrive: { findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
  paymentIntentDrive: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  driverPayoutDrive: { upsert: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), aggregate: jest.fn() },
  driverPayoutBatchDrive: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};
const stripe: any = { paymentIntents: { create: jest.fn(), retrieve: jest.fn() } };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../payments/stripe", () => ({ stripe, STRIPE_CONFIG: { currency: "eur", webhookSecret: "whsec" } }));
import { ZupDrivePaymentService } from "../zupdrive-payment.service";
import { ZupDrivePaymentDriverService } from "../zupdrive-payment-driver.service";
import { ZupDriveMonitoringService } from "../zupdrive-monitoring.service";
import { debutSemaineVersement, finSemaineVersement } from "../semaine-versement";

const paiement = (extra: any = {}) => ({
  id: "pay-1", courseId: "course-1", stripeId: "pi_1", status: "REQUIRES_PAYMENT_METHOD", amountCentimes: 1500, driverEarningsCentimes: 1200, currency: "EUR",
  course: { chauffeurId: "c1", statut: "TERMINEE" }, ...extra,
});
/** L'intention Stripe telle que le webhook la reçoit. */
const intention = (extra: any = {}) => ({
  id: "pi_1", status: "succeeded", currency: "eur", amount: 1500, amount_received: 1500, metadata: { courseId: "course-1" }, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.platformSettingsDrive.findUnique.mockResolvedValue(null);
  db.courseDrive.findUniqueOrThrow.mockResolvedValue({ id: "course-1", departAdresse: "A", arriveeAdresse: "B" });
  db.paymentIntentDrive.findUnique.mockResolvedValue(null);
  db.paymentIntentDrive.create.mockImplementation(async ({ data }: any) => ({ id: "pay-1", ...data }));
  stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", status: "requires_payment_method", client_secret: "secret" });
  db.paymentIntentDrive.updateMany.mockResolvedValue({ count: 1 });
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
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ status: "SUCCEEDED" }));
    await ZupDrivePaymentService.creerVersementSiDu("pay-1");
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

describe("webhook Stripe d'un paiement ZupDrive", () => {
  it("reconnaît une intention de course, pas une commande ZupEat ni un pourboire", () => {
    expect(ZupDrivePaymentService.estUnPaiementDrive(intention() as any)).toBe(true);
    expect(ZupDrivePaymentService.estUnPaiementDrive(intention({ metadata: { courseId: "c", orderId: "o" } }) as any)).toBe(false);
    expect(ZupDrivePaymentService.estUnPaiementDrive(intention({ metadata: { orderId: "o" } }) as any)).toBe(false);
    expect(ZupDrivePaymentService.estUnPaiementDrive(intention({ metadata: {} }) as any)).toBe(false);
  });

  it("payé d'avance, avant tout chauffeur : le paiement passe à SUCCEEDED, aucun versement", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ course: { chauffeurId: null, statut: "RECHERCHE" } }));
    await expect(ZupDrivePaymentService.marquerPaye(intention() as any)).resolves.toBeNull();
    expect(db.paymentIntentDrive.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: { not: "SUCCEEDED" } },
      data: { status: "SUCCEEDED", confirmedAt: expect.any(Date) },
    });
    expect(db.driverPayoutDrive.upsert).not.toHaveBeenCalled();
  });

  it("course déjà terminée : le versement est créé avec le revenu figé sur le paiement", async () => {
    db.paymentIntentDrive.findUnique
      .mockResolvedValueOnce(paiement({ driverEarningsCentimes: 1125 })) // paiement de l'intention
      .mockResolvedValueOnce(paiement({ status: "SUCCEEDED", driverEarningsCentimes: 1125 })); // relu pour le versement
    await ZupDrivePaymentService.marquerPaye(intention() as any);
    expect(db.driverPayoutDrive.upsert.mock.calls[0][0].create).toMatchObject({ paymentId: "pay-1", chauffeurId: "c1", amountCentimes: 1125, status: "PENDING" });
  });

  it("un même événement reçu deux fois ne crée qu'un versement (upsert sur paymentId unique)", async () => {
    for (let i = 0; i < 2; i++) {
      db.paymentIntentDrive.findUnique
        .mockResolvedValueOnce(paiement({ status: i === 0 ? "REQUIRES_PAYMENT_METHOD" : "SUCCEEDED" }))
        .mockResolvedValueOnce(paiement({ status: "SUCCEEDED" }));
      await ZupDrivePaymentService.marquerPaye(intention() as any);
    }
    expect(db.driverPayoutDrive.upsert).toHaveBeenCalledTimes(2);
    for (const [appel] of db.driverPayoutDrive.upsert.mock.calls) {
      expect(appel.where).toEqual({ paymentId: "pay-1" });
      expect(appel.update).toEqual({}); // le rejeu ne réécrit rien
    }
    // La garde « status: { not: SUCCEEDED } » empêche un rejeu de réécrire confirmedAt.
    expect(db.paymentIntentDrive.updateMany.mock.calls.every(([a]: any[]) => a.where.status.not === "SUCCEEDED")).toBe(true);
  });

  it("refuse un montant encaissé différent de celui de la base (409), sans rien écrire", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    await expect(ZupDrivePaymentService.marquerPaye(intention({ amount_received: 100, amount: 100 }) as any)).rejects.toMatchObject({ statusCode: 409, code: "PAYMENT_AMOUNT_MISMATCH" });
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une autre devise ou un état non réglé (409)", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    await expect(ZupDrivePaymentService.marquerPaye(intention({ currency: "usd" }) as any)).rejects.toMatchObject({ code: "PAYMENT_INVALID" });
    await expect(ZupDrivePaymentService.marquerPaye(intention({ status: "processing" }) as any)).rejects.toMatchObject({ code: "PAYMENT_INVALID" });
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une intention dont la métadonnée désigne une autre course (409)", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    await expect(ZupDrivePaymentService.marquerPaye(intention({ metadata: { courseId: "course-autre" } }) as any)).rejects.toMatchObject({ code: "PAYMENT_COURSE_MISMATCH" });
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });

  it("intention inconnue de la base : ignorée sans erreur (Stripe cesse de rejouer)", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(null);
    await expect(ZupDrivePaymentService.marquerPaye(intention() as any)).resolves.toBeNull();
    await expect(ZupDrivePaymentService.marquerEchec(intention({ status: "requires_payment_method" }) as any)).resolves.toBeUndefined();
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });

  it("un échec ou une annulation en retard ne défait jamais un paiement réglé", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ status: "SUCCEEDED" }));
    await ZupDrivePaymentService.marquerEchec(intention({ status: "requires_payment_method" }) as any);
    await ZupDrivePaymentService.marquerAnnule(intention({ status: "canceled", cancellation_reason: "abandoned" }) as any);
    const [echec, annulation] = db.paymentIntentDrive.updateMany.mock.calls.map(([a]: any[]) => a);
    expect(echec).toEqual({ where: { id: "pay-1", status: { not: "SUCCEEDED" } }, data: { status: "REQUIRES_PAYMENT_METHOD" } });
    expect(annulation).toEqual({ where: { id: "pay-1", status: { not: "SUCCEEDED" } }, data: { status: "CANCELED", cancellationReason: "abandoned" } });
  });
});

describe("versement du chauffeur : dans l'ordre où paiement et fin de course arrivent", () => {
  it("course terminée après un paiement d'avance : le versement devient dû", async () => {
    db.paymentIntentDrive.findUnique
      .mockResolvedValueOnce({ id: "pay-1" })
      .mockResolvedValueOnce(paiement({ status: "SUCCEEDED" }));
    await ZupDrivePaymentService.courseTerminee("course-1");
    expect(db.driverPayoutDrive.upsert).toHaveBeenCalledTimes(1);
  });

  it("course terminée sans paiement confirmé : aucun versement", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValueOnce(null);
    await expect(ZupDrivePaymentService.courseTerminee("course-1")).resolves.toBeNull();
    db.paymentIntentDrive.findUnique.mockResolvedValueOnce({ id: "pay-1" }).mockResolvedValueOnce(paiement({ status: "REQUIRES_PAYMENT_METHOD" }));
    await expect(ZupDrivePaymentService.courseTerminee("course-1")).resolves.toBeNull();
    expect(db.driverPayoutDrive.upsert).not.toHaveBeenCalled();
  });

  it("course annulée après paiement : pas de versement", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ status: "SUCCEEDED", course: { chauffeurId: "c1", statut: "ANNULEE" } }));
    await expect(ZupDrivePaymentService.creerVersementSiDu("pay-1")).resolves.toBeNull();
    expect(db.driverPayoutDrive.upsert).not.toHaveBeenCalled();
  });

  it("« demander mes versements » ne prend que les courses terminées", async () => {
    db.paymentIntentDrive.findMany.mockResolvedValue([{ id: "pay-1", driverEarningsCentimes: 1200, currency: "EUR" }]);
    db.driverPayoutDrive.createMany.mockResolvedValue({ count: 1 });
    await ZupDrivePaymentDriverService.preparePayout("c1");
    expect(db.paymentIntentDrive.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "SUCCEEDED", payout: null, course: { chauffeurId: "c1", statut: "TERMINEE" } } }));
  });
});

describe("création du paiement", () => {
  it("rejouer la demande rend le même paiement non réglé (clientSecret retrouvé), sans nouvelle intention Stripe", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    stripe.paymentIntents.retrieve.mockResolvedValue({ status: "requires_payment_method", amount: 1500, client_secret: "secret-1" });
    const r = await ZupDrivePaymentService.createPaymentIntent("course-1", "p1", 1500);
    expect(r).toMatchObject({ paymentId: "pay-1", clientSecret: "secret-1", amount: 1500 });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("une course déjà payée, ou dont l'intention est annulée, répond 409", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ status: "SUCCEEDED" }));
    await expect(ZupDrivePaymentService.createPaymentIntent("course-1", "p1", 1500)).rejects.toMatchObject({ statusCode: 409, code: "PAYMENT_ALREADY_EXISTS" });
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    stripe.paymentIntents.retrieve.mockResolvedValue({ status: "canceled", amount: 1500, client_secret: "x" });
    await expect(ZupDrivePaymentService.createPaymentIntent("course-1", "p1", 1500)).rejects.toMatchObject({ code: "PAYMENT_ALREADY_EXISTS" });
  });

  it("l'intention Stripe porte l'identifiant de la course, une clé d'idempotence, et le statut est enregistré en majuscules", async () => {
    await ZupDrivePaymentService.createPaymentIntent("course-1", "p1", 1500);
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500, metadata: expect.objectContaining({ courseId: "course-1" }) }),
      { idempotencyKey: "zupdrive-course-course-1" }
    );
    expect(db.paymentIntentDrive.create.mock.calls[0][0].data.status).toBe("REQUIRES_PAYMENT_METHOD");
  });

  it("deux demandes simultanées : la perdante (courseId unique) rend le paiement de la gagnante", async () => {
    db.paymentIntentDrive.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    db.paymentIntentDrive.findUniqueOrThrow.mockResolvedValue(paiement());
    stripe.paymentIntents.retrieve.mockResolvedValue({ status: "requires_payment_method", amount: 1500, client_secret: "secret-1" });
    await expect(ZupDrivePaymentService.createPaymentIntent("course-1", "p1", 1500)).resolves.toMatchObject({ clientSecret: "secret-1" });
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

describe("fin de course", () => {
  it("terminer une course payée d'avance déclenche son versement, sans jamais défaire la fin de course", async () => {
    const { CourseDriveService } = await import("../course-drive.service");
    jest.spyOn(CourseDriveService, "chauffeurDuCompte").mockResolvedValue({ id: "c1" } as never);
    jest.spyOn(CourseDriveService, "tableauDeBord").mockResolvedValue({} as never);
    jest.spyOn(CourseDriveService as any, "prevenirPassager").mockResolvedValue(undefined);
    db.courseDrive.findUnique = jest.fn(async () => ({ id: "course-1", chauffeurId: "c1", statut: "EN_COURS" }));
    db.courseDrive.updateMany = jest.fn(async () => ({ count: 1 }));
    const versement = jest.spyOn(ZupDrivePaymentService, "courseTerminee").mockRejectedValue(new Error("base indisponible") as never);

    await expect(CourseDriveService.avancer("user-c1", "course-1", "terminer")).resolves.toBeDefined();
    expect(versement).toHaveBeenCalledWith("course-1");

    versement.mockClear();
    await CourseDriveService.avancer("user-c1", "course-1", "arrive");
    expect(versement).not.toHaveBeenCalled(); // seule la fin de course concerne le versement
    versement.mockRestore();
  });
});
