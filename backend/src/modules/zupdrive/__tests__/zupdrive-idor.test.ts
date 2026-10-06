import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  user: { findUnique: jest.fn() },
  invitationSocieteDrive: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  societeDrive: { findUnique: jest.fn() },
  chauffeurDrive: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  vehiculeDrive: { findFirst: jest.fn(), update: jest.fn() },
  documentChauffeurDrive: { findUnique: jest.fn(), update: jest.fn() },
  courseDrive: { findUnique: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
  noteCourseDrive: { create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ JWT_SECRET: "a".repeat(40), API_URL: "https://api.test" }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn() }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail: jest.fn() } }));
jest.mock("../../files/file-upload.service", () => ({ FileUploadService: {} }));
import { SocieteDriveService } from "../societe-drive.service";
import { ChauffeurOnboardingService } from "../chauffeur-onboarding.service";
import { CourseDriveService } from "../course-drive.service";
import { NoteCourseDriveService } from "../note-course-drive.service";

beforeEach(() => {
  jest.restoreAllMocks();
  db.user.findUnique.mockResolvedValue({ email: "alice@example.test", emailVerified: true });
  db.invitationSocieteDrive.findUnique.mockResolvedValue({ id: "invitation-alice", email: "alice@example.test", statut: "EN_ATTENTE", societeId: "societe-a" });
  db.invitationSocieteDrive.findMany.mockResolvedValue([{ id: "invitation-alice" }]);
  db.invitationSocieteDrive.updateMany.mockResolvedValue({ count: 1 });
  db.societeDrive.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id || "societe-b", statut: "VALIDE", region: "BRUXELLES", raisonSociale: "Societe test" }));
  db.chauffeurDrive.findUnique.mockResolvedValue({ id: "chauffeur-alice", statut: "BROUILLON", societeId: null });
  db.chauffeurDrive.findFirst.mockResolvedValue(null);
  db.chauffeurDrive.updateMany.mockResolvedValue({ count: 1 });
  db.vehiculeDrive.findFirst.mockResolvedValue(null);
  db.courseDrive.count.mockResolvedValue(0);
  db.courseDrive.findUnique.mockResolvedValue({ id: "course-alice", passagerId: "alice", chauffeurId: "chauffeur-alice" });
  db.documentChauffeurDrive.findUnique.mockResolvedValue({ id: "piece-alice", chauffeurId: "chauffeur-alice", societeId: "societe-a", archiveeLe: null });
  db.$transaction.mockImplementation(async (callback: any) => callback(db));
});

describe("invitations : la boîte mail doit être confirmée", () => {
  it.each(["liste", "acceptation", "refus"])("une adresse non confirmée n'autorise pas la %s", async operation => {
    db.user.findUnique.mockResolvedValue({ email: "alice@example.test", emailVerified: false });
    const action = operation === "liste" ? SocieteDriveService.invitationsDuCompte("intrus")
      : operation === "acceptation" ? SocieteDriveService.accepterInvitation("intrus", "invitation-alice")
        : SocieteDriveService.refuserInvitation("intrus", "invitation-alice");
    await expect(action).rejects.toMatchObject({ statusCode: 403, code: "EMAIL_NOT_VERIFIED" });
    expect(db.invitationSocieteDrive.findMany).not.toHaveBeenCalled();
    expect(db.invitationSocieteDrive.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.invitationSocieteDrive.updateMany).not.toHaveBeenCalled();
  });
  it.each(["acceptation", "refus"])("Bob confirmé ne répond pas à l'invitation d'Alice : %s", async operation => {
    db.user.findUnique.mockResolvedValue({ email: "bob@example.test", emailVerified: true });
    await expect(operation === "acceptation" ? SocieteDriveService.accepterInvitation("bob", "invitation-alice") : SocieteDriveService.refuserInvitation("bob", "invitation-alice")).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.invitationSocieteDrive.updateMany).not.toHaveBeenCalled();
  });
  it("Alice confirmée liste uniquement les invitations de son adresse", async () => {
    await expect(SocieteDriveService.invitationsDuCompte("alice")).resolves.toEqual([{ id: "invitation-alice" }]);
    expect(db.invitationSocieteDrive.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "alice@example.test", statut: "EN_ATTENTE" } }));
  });
  it("Alice confirmée peut refuser sa propre invitation", async () => {
    jest.spyOn(SocieteDriveService, "prevenirGerant").mockResolvedValue(undefined);
    await SocieteDriveService.refuserInvitation("alice", "invitation-alice");
    expect(db.invitationSocieteDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "invitation-alice", statut: "EN_ATTENTE" }, data: expect.objectContaining({ statut: "REFUSEE" }) }));
  });
  it("Alice confirmée peut rejoindre la société qui l'invite", async () => {
    jest.spyOn(SocieteDriveService as any, "ajusterStatutAuDossier").mockResolvedValue(undefined as never);
    jest.spyOn(SocieteDriveService, "prevenirGerant").mockResolvedValue(undefined);
    jest.spyOn(ChauffeurOnboardingService, "monDossier").mockResolvedValue({ id: "chauffeur-alice" } as any);
    await SocieteDriveService.accepterInvitation("alice", "invitation-alice");
    expect(db.chauffeurDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "chauffeur-alice", societeId: null }, data: expect.objectContaining({ societeId: "societe-a" }) }));
  });
});

describe("sociétés, chauffeurs et documents : IDs voisins refusés", () => {
  it("Bob ne peut pas annuler l'invitation émise par une autre société", async () => {
    db.invitationSocieteDrive.updateMany.mockResolvedValue({ count: 0 });
    await expect(SocieteDriveService.annulerInvitation("bob", "invitation-alice")).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
    expect(db.invitationSocieteDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "invitation-alice", societeId: "societe-b", statut: "EN_ATTENTE" } }));
  });
  it("Bob ne peut pas donner un véhicule étranger à son propre chauffeur", async () => {
    db.chauffeurDrive.findFirst.mockResolvedValue({ id: "chauffeur-bob", societeId: "societe-b", vehiculeId: null });
    await expect(SocieteDriveService.attribuerVehicule("bob", "chauffeur-bob", "vehicule-alice")).rejects.toMatchObject({ code: "VEHICLE_NOT_FOUND" });
    expect(db.chauffeurDrive.updateMany).not.toHaveBeenCalled();
  });
  it.each(["modifier", "retirer", "document"])("Bob ne touche pas au véhicule voisin : %s", async operation => {
    const action = operation === "modifier" ? SocieteDriveService.modifierVehicule("bob", "vehicule-alice", {})
      : operation === "retirer" ? SocieteDriveService.retirerVehicule("bob", "vehicule-alice")
        : SocieteDriveService.deposerPieceVehicule("bob", "vehicule-alice", { type: "licence", file: Buffer.from("fictif") });
    await expect(action).rejects.toMatchObject({ code: "VEHICLE_NOT_FOUND" });
    expect(db.vehiculeDrive.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vehicule-alice", societeId: "societe-b", retireLe: null } }));
    expect(db.vehiculeDrive.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["detacher", "attribuer"])("Bob ne gère pas le chauffeur voisin : %s", async operation => {
    await expect(operation === "detacher" ? SocieteDriveService.detacherChauffeur("bob", "chauffeur-alice") : SocieteDriveService.attribuerVehicule("bob", "chauffeur-alice", null)).rejects.toMatchObject({ code: "CHAUFFEUR_NOT_FOUND" });
    expect(db.chauffeurDrive.findFirst).toHaveBeenCalledWith({ where: { id: "chauffeur-alice", societeId: "societe-b" } });
    expect(db.chauffeurDrive.updateMany).not.toHaveBeenCalled();
  });
  it("une pièce ne peut pas être examinée sous le dossier d'un autre chauffeur", async () => {
    await expect(ChauffeurOnboardingService.examinerPiece("chauffeur-bob", "piece-alice", { approuve: true })).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("une pièce de société ne peut pas être examinée sous une autre société", async () => {
    await expect(SocieteDriveService.examinerPiece("societe-b", "piece-alice", { approuve: true })).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("courses et notes : seules les personnes de la course agissent", () => {
  it.each(["lecture", "annulation", "note"])("Bob passager ne fait pas la %s sur la course d'Alice", async operation => {
    const action = operation === "lecture" ? CourseDriveService.maCourse("bob", "course-alice")
      : operation === "annulation" ? CourseDriveService.annulerParPassager("bob", "course-alice")
        : NoteCourseDriveService.noter({ auteur: "PASSAGER", passagerId: "bob" }, "course-alice", { note: 5 });
    await expect(action).rejects.toMatchObject({ code: "RIDE_NOT_FOUND" });
    expect(db.courseDrive.updateMany).not.toHaveBeenCalled();
    expect(db.noteCourseDrive.create).not.toHaveBeenCalled();
  });
  it.each(["avancer", "annuler", "note"])("Bob chauffeur ne peut pas %s sur la course d'Alice", async operation => {
    jest.spyOn(CourseDriveService, "chauffeurDuCompte").mockResolvedValue({ id: "chauffeur-bob" } as any);
    const action = operation === "avancer" ? CourseDriveService.avancer("bob", "course-alice", "arrive")
      : operation === "annuler" ? CourseDriveService.annulerParChauffeur("bob", "course-alice", "Intrusion")
        : NoteCourseDriveService.noter({ auteur: "CHAUFFEUR", chauffeurId: "chauffeur-bob" }, "course-alice", { note: 5 });
    await expect(action).rejects.toMatchObject({ code: "RIDE_NOT_FOUND" });
    expect(db.courseDrive.updateMany).not.toHaveBeenCalled();
    expect(db.noteCourseDrive.create).not.toHaveBeenCalled();
  });
});
