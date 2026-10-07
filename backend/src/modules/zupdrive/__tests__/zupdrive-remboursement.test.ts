import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  platformSettingsDrive: { findUnique: jest.fn() },
  paymentIntentDrive: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  driverPayoutDrive: { upsert: jest.fn() },
};
const stripe: any = { refunds: { list: jest.fn(), create: jest.fn() }, paymentIntents: { create: jest.fn(), retrieve: jest.fn() } };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../payments/stripe", () => ({ stripe, STRIPE_CONFIG: { currency: "eur", webhookSecret: "whsec" } }));
import { ZupDrivePaymentService } from "../zupdrive-payment.service";
import { CourseDriveService } from "../course-drive.service";

const paiement = (extra: any = {}) => ({
  id: "pay-1", courseId: "course-1", stripeId: "pi_1", status: "SUCCEEDED", amountCentimes: 1500,
  course: { statut: "ANNULEE" }, payout: null, ...extra,
});
const remboursement = (statut: string, montant = 1500) => ({ id: `re_${statut}`, status: statut, amount: montant });

beforeEach(() => {
  jest.clearAllMocks();
  db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
  db.paymentIntentDrive.updateMany.mockResolvedValue({ count: 1 });
  stripe.refunds.list.mockResolvedValue({ data: [] });
  stripe.refunds.create.mockResolvedValue({});
});

/** Ce que Stripe répond à la relecture qui suit la demande. */
const stripeRend = (...liste: any[]) => stripe.refunds.list.mockResolvedValueOnce({ data: [] }).mockResolvedValue({ data: liste });

describe("remboursement d'une course payée qui n'a pas abouti", () => {
  it("course annulée : remboursement total demandé à Stripe, puis REFUNDED une fois rendu", async () => {
    stripeRend(remboursement("succeeded"));
    await expect(ZupDrivePaymentService.rembourserCourse("course-1", "Course annulée par le passager")).resolves.toBe("REFUNDED");
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", reason: "requested_by_customer", metadata: { courseId: "course-1", raison: "Course annulée par le passager" } },
      { idempotencyKey: "zupdrive-refund-pay-1-0" }
    );
    expect(db.paymentIntentDrive.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: { in: ["SUCCEEDED", "REFUND_REQUESTED", "REFUND_FAILED"] } },
      data: { status: "REFUNDED" },
    });
  });

  it("sans chauffeur : même remboursement", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ course: { statut: "SANS_CHAUFFEUR" } }));
    stripeRend(remboursement("succeeded"));
    await expect(ZupDrivePaymentService.rembourserCourse("course-1", "Aucun chauffeur")).resolves.toBe("REFUNDED");
  });

  it("rejouer l'appel ne rembourse pas deux fois : un remboursement réussi ou en attente est repris", async () => {
    stripe.refunds.list.mockResolvedValue({ data: [remboursement("succeeded")] });
    await ZupDrivePaymentService.rembourserCourse("course-1", "x");
    stripe.refunds.list.mockResolvedValue({ data: [remboursement("pending")] });
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement());
    await expect(ZupDrivePaymentService.rembourserCourse("course-1", "x")).resolves.toBe("REFUND_REQUESTED");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("remboursement échoué : nouvelle demande avec une autre clé d'idempotence ; deuxième échec → 502 et REFUND_FAILED", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ status: "REFUND_FAILED" }));
    stripe.refunds.list.mockResolvedValue({ data: [remboursement("failed")] });
    await expect(ZupDrivePaymentService.rembourserCourse("course-1", "x")).rejects.toMatchObject({ statusCode: 502, code: "REFUND_FAILED" });
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: "zupdrive-refund-pay-1-1" });
  });

  it.each([
    ["course terminée", { course: { statut: "TERMINEE" } }],
    ["course en cours", { course: { statut: "EN_COURS" } }],
    ["chauffeur déjà versé", { payout: { id: "po-1" } }],
  ])("%s : 409, rien n'est demandé à Stripe", async (_nom, extra) => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement(extra));
    await expect(ZupDrivePaymentService.rembourserCourse("course-1", "x")).rejects.toMatchObject({ statusCode: 409, code: "COURSE_NOT_REFUNDABLE" });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it.each([["aucun paiement", null], ["paiement jamais réglé", paiement({ status: "REQUIRES_PAYMENT_METHOD" })], ["déjà remboursé", paiement({ status: "REFUNDED" })]])(
    "%s : rien à rendre",
    async (_nom, ligne) => {
      db.paymentIntentDrive.findUnique.mockResolvedValue(ligne);
      await expect(ZupDrivePaymentService.rembourserCourse("course-1", "x")).resolves.toBeNull();
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    }
  );

  it("un remboursement partiel fait depuis le tableau de bord Stripe ne change pas le statut", async () => {
    stripe.refunds.list.mockResolvedValue({ data: [remboursement("succeeded", 500)] });
    await expect(ZupDrivePaymentService.synchroniserRemboursement("pay-1")).resolves.toBe("SUCCEEDED");
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });
});

describe("remboursement : événements Stripe et filet de sécurité", () => {
  it("un événement de remboursement d'une intention de course resynchronise le paiement ; sinon il n'est pas à ZupDrive", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValueOnce({ id: "pay-1" }).mockResolvedValue(paiement({ status: "REFUND_REQUESTED" }));
    stripe.refunds.list.mockResolvedValue({ data: [remboursement("succeeded")] });
    await expect(ZupDrivePaymentService.surRemboursement("pi_1")).resolves.toBe(true);
    expect(db.paymentIntentDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REFUNDED" } }));

    db.paymentIntentDrive.findUnique.mockResolvedValue(null);
    await expect(ZupDrivePaymentService.surRemboursement("pi_commande_zupeat")).resolves.toBe(false);
  });

  it("le balayage reprend les courses payées non abouties ; un échec n'arrête pas les autres", async () => {
    db.paymentIntentDrive.findMany.mockResolvedValue([{ courseId: "c-a" }, { courseId: "c-b" }]);
    const rembourse = jest.spyOn(ZupDrivePaymentService, "rembourserCourse")
      .mockRejectedValueOnce(new Error("Stripe indisponible") as never)
      .mockResolvedValueOnce("REFUNDED" as never);
    await expect(ZupDrivePaymentService.rembourserLesCoursesNonAboutiesPayees()).resolves.toBe(1);
    expect(rembourse).toHaveBeenCalledTimes(2);
    expect(db.paymentIntentDrive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ["SUCCEEDED", "REFUND_FAILED"] }, course: { statut: { in: ["ANNULEE", "SANS_CHAUFFEUR"] } }, payout: null },
    }));
    rembourse.mockRestore();
  });

  it("paiement reçu après l'annulation de la course : remboursé, aucun versement", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiement({ status: "REQUIRES_PAYMENT_METHOD", course: { statut: "ANNULEE", chauffeurId: null } }));
    const rembourse = jest.spyOn(ZupDrivePaymentService, "rembourserCourse").mockResolvedValue("REFUNDED" as never);
    const intention: any = { id: "pi_1", status: "succeeded", currency: "eur", amount: 1500, amount_received: 1500, metadata: { courseId: "course-1" } };
    await expect(ZupDrivePaymentService.marquerPaye(intention)).resolves.toBeNull();
    expect(rembourse).toHaveBeenCalledWith("course-1", expect.any(String));
    expect(db.driverPayoutDrive.upsert).not.toHaveBeenCalled();
    rembourse.mockRestore();
  });
});

describe("annulation d'une course payée", () => {
  const course = { id: "course-1", passagerId: "p1", chauffeurId: null, statut: "RECHERCHE" };
  beforeEach(() => {
    db.courseDrive = { findUnique: jest.fn(async () => course), updateMany: jest.fn(async () => ({ count: 1 })) };
    db.propositionCourseDrive = { updateMany: jest.fn(async () => ({ count: 0 })) };
    jest.spyOn(CourseDriveService, "maCourse").mockResolvedValue({} as never);
  });

  it("le passager qui annule est remboursé", async () => {
    const rembourse = jest.spyOn(ZupDrivePaymentService, "rembourserCourse").mockResolvedValue("REFUNDED" as never);
    await CourseDriveService.annulerParPassager("p1", "course-1", "changement de plan");
    expect(rembourse).toHaveBeenCalledWith("course-1", "Course annulée par le passager");
    rembourse.mockRestore();
  });

  it("un échec du remboursement ne défait pas l'annulation (le balayage reprendra)", async () => {
    const rembourse = jest.spyOn(ZupDrivePaymentService, "rembourserCourse").mockRejectedValue(new Error("Stripe indisponible") as never);
    await expect(CourseDriveService.annulerParPassager("p1", "course-1")).resolves.toBeDefined();
    expect(db.courseDrive.updateMany).toHaveBeenCalled();
    rembourse.mockRestore();
  });
});
