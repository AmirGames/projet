import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let obligatoire = true;
const db: any = {
  courseDrive: { findUnique: jest.fn(), updateMany: jest.fn() },
  paymentIntentDrive: { findUnique: jest.fn() },
  chauffeurDrive: { findMany: jest.fn() },
  noteCourseDrive: { findUnique: jest.fn() },
  propositionCourseDrive: { updateMany: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ ZUPDRIVE_PAIEMENT_OBLIGATOIRE: obligatoire }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn() }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail: jest.fn() } }));
jest.mock("../../payments/stripe", () => ({ stripe: {}, STRIPE_CONFIG: { currency: "eur" } }));
import { CourseDriveService, RECHERCHE_MAX_MS } from "../course-drive.service";

const MAINTENANT = new Date("2026-10-07T12:00:00.000Z");
const course = (extra: any = {}) => ({
  id: "course-1", passagerId: "p1", statut: "RECHERCHE", region: "BRUXELLES", chauffeurId: null, propositions: [],
  createdAt: new Date(MAINTENANT.getTime() - 10_000), departLatitude: 50.85, departLongitude: 4.35, chauffeur: null, vehicule: null, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  obligatoire = true;
  db.courseDrive.findUnique.mockResolvedValue(course());
  db.courseDrive.updateMany.mockResolvedValue({ count: 1 });
  db.chauffeurDrive.findMany.mockResolvedValue([]);
  db.noteCourseDrive.findUnique.mockResolvedValue(null);
  jest.spyOn(CourseDriveService as any, "prevenirPassager").mockResolvedValue(undefined);
});

describe("paiement obligatoire avant la recherche d'un chauffeur", () => {
  it("course non payée : aucun chauffeur n'est sollicité", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(null);
    await expect(CourseDriveService.proposerAuSuivant("course-1", MAINTENANT)).resolves.toBeNull();
    expect(db.chauffeurDrive.findMany).not.toHaveBeenCalled();
  });

  it("paiement commencé mais pas confirmé par Stripe : aucun chauffeur non plus", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue({ status: "REQUIRES_PAYMENT_METHOD" });
    await CourseDriveService.proposerAuSuivant("course-1", MAINTENANT);
    expect(db.chauffeurDrive.findMany).not.toHaveBeenCalled();
  });

  it("paiement confirmé : la recherche démarre", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue({ status: "SUCCEEDED" });
    await CourseDriveService.proposerAuSuivant("course-1", MAINTENANT);
    expect(db.chauffeurDrive.findMany).toHaveBeenCalledTimes(1);
  });

  it("option désactivée (défaut) : le comportement d'avant, sans consulter le paiement", async () => {
    obligatoire = false;
    await CourseDriveService.proposerAuSuivant("course-1", MAINTENANT);
    expect(db.paymentIntentDrive.findUnique).not.toHaveBeenCalled();
    expect(db.chauffeurDrive.findMany).toHaveBeenCalledTimes(1);
  });

  it("une course jamais payée expire comme une course sans chauffeur", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(null);
    db.courseDrive.findUnique.mockResolvedValue(course({ createdAt: new Date(MAINTENANT.getTime() - RECHERCHE_MAX_MS - 1000) }));
    await CourseDriveService.proposerAuSuivant("course-1", MAINTENANT);
    expect(db.courseDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ statut: "SANS_CHAUFFEUR" }) }));
  });

  it("la course du passager indique si le paiement est obligatoire et où il en est", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue({ status: "SUCCEEDED" });
    db.courseDrive.findUnique.mockResolvedValue(course({ cleIdempotence: "k", tarifApplique: {}, societeId: null, vehiculeId: null }));
    const r: any = await CourseDriveService.maCourse("p1", "course-1");
    expect(r.paiement).toEqual({ obligatoire: true, statut: "SUCCEEDED" });
    obligatoire = false;
    db.paymentIntentDrive.findUnique.mockResolvedValue(null);
    expect(((await CourseDriveService.maCourse("p1", "course-1")) as any).paiement).toEqual({ obligatoire: false, statut: null });
  });
});
