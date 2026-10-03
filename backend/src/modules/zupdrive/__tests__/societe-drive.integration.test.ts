import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";

/**
 * ZupDrive — sociétés de taxi / VTC : leur dossier, leurs véhicules, leurs
 * chauffeurs, et les courses de ces chauffeurs. Contre une vraie base
 * PostgreSQL (DATABASE_URL) : contraintes (une société à la fois, plaque
 * unique, un véhicule un chauffeur, pièce à un seul dossier), filtres de
 * relations et transactions ne se vérifient vraiment que là. La suite crée
 * ses propres comptes et les retire à la fin.
 *
 *   set -a; . ./.env; set +a; npx jest src/modules/zupdrive/__tests__/societe-drive.integration.test.ts
 */

jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
const notifierPlateforme = jest.fn(async (_titre: string, _message: string, _lien: string) => undefined);
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme }));
const sendEmail = jest.fn(async (_data: any) => ({ success: true }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail } }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
let fichier = 0;
jest.mock("../../files/file-upload.service", () => ({
  FileUploadService: {
    uploadDocument: jest.fn(async () => ({ url: `http://api.test/uploads/chauffeurs/test${++fichier}.pdf` })),
  },
}));

import bcrypt from "bcrypt";
import { db } from "../../../services/db";
import { ChauffeurOnboardingService } from "../chauffeur-onboarding.service";
import { ChauffeurExpirationService } from "../chauffeur-expiration.service";
import { CourseDriveService } from "../course-drive.service";
import { SocieteDriveService } from "../societe-drive.service";
import { peutLire } from "../../files/fichiers-prives.service";

const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const REGION = "FLANDRE";
// Gand (9000) → Gentbrugge (9050) : même région.
const DEPART = { adresse: "Korenmarkt, 9000 Gent", latitude: 51.0543, longitude: 3.7196, codePostal: "9000" };
const ARRIVEE = { adresse: "Brusselsesteenweg, 9050 Gentbrugge", latitude: 51.0378, longitude: 3.7598, codePostal: "9050" };
const TARIF = { priseEnChargeCentimes: 250, parKmCentimes: 180, parMinuteCentimes: 30, minimumCentimes: 800 };
// Numéros BCE valables (les deux derniers chiffres valent 97 − base mod 97),
// propres à cette suite.
const bce = (graine: number) => {
  const base = `0${String(graine % 10_000_000).padStart(7, "0")}`;
  return `${base}${String(97 - (Number(base) % 97)).padStart(2, "0")}`;
};
const BCE_A = bce(Date.now() % 9_000_000);
const BCE_B = bce((Date.now() % 9_000_000) + 1);

let tarifAvant: any = null;
const comptes: string[] = [];
const fichierPdf = () => ({ file: Buffer.from("%PDF-1.4"), mimeType: "application/pdf" });

async function compte(nom: string) {
  const user = await db.user.create({
    // Les scénarios légitimes représentent des destinataires ayant confirmé
    // leur boîte mail ; les adresses non confirmées ont leur régression dédiée.
    data: { email: `${nom}-${suffixe}@zupdrive.test`, emailVerified: true, name: `${nom} Test`, passwordHash: await bcrypt.hash("x", 4) },
  });
  comptes.push(user.id);
  return { id: user.id, email: user.email };
}

/** Une société validée, avec un véhicule conforme : de quoi faire rouler un chauffeur. */
async function societeEnRegle(gerantId: string, numero: string, plaque: string) {
  await SocieteDriveService.creer(gerantId, { raisonSociale: `Taxi ${plaque}`, numeroEntreprise: numero, region: REGION, telephone: "+32 9 123 45 67" });
  const tva = await SocieteDriveService.deposerPiece(gerantId, { type: "tva", ...fichierPdf() });
  await SocieteDriveService.soumettre(gerantId);
  const societe = (await SocieteDriveService.maSociete(gerantId))!;
  await SocieteDriveService.examinerPiece(societe.id, tva.id, { approuve: true });
  await SocieteDriveService.valider(societe.id, "admin-test");
  const vehicule = await SocieteDriveService.ajouterVehicule(gerantId, { marque: "Toyota", modele: "Prius", plaque });
  for (const type of ["licence", "assurance", "controle_technique", "immatriculation"] as const) {
    const piece = await SocieteDriveService.deposerPieceVehicule(gerantId, vehicule.id, {
      type,
      ...fichierPdf(),
      dateExpiration: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    });
    await SocieteDriveService.examinerPiece(societe.id, piece.id, { approuve: true });
  }
  return { societeId: societe.id, vehiculeId: vehicule.id };
}

/** Un chauffeur qui accepte l'invitation, avec ses pièces personnelles validées. */
async function chauffeurDeSociete(gerantId: string, nom: string) {
  const qui = await compte(nom);
  const invitation = await SocieteDriveService.inviter(gerantId, qui.email.toUpperCase());
  await SocieteDriveService.accepterInvitation(qui.id, invitation.id);
  await ChauffeurOnboardingService.modifier(qui.id, { telephone: "+32 470 00 00 00" });
  const chauffeur = await db.chauffeurDrive.findUniqueOrThrow({ where: { userId: qui.id } });
  for (const type of ["identite", "permis", "bestuurderspas"] as const) {
    const piece = await ChauffeurOnboardingService.deposerPiece(qui.id, { type, ...fichierPdf() });
    await ChauffeurOnboardingService.examinerPiece(chauffeur.id, piece.id, { approuve: true });
  }
  await ChauffeurOnboardingService.soumettre(qui.id);
  await ChauffeurOnboardingService.valider(chauffeur.id, "admin-test");
  return { userId: qui.id, email: qui.email, chauffeurId: chauffeur.id };
}

let gerantA: { id: string; email: string };
let gerantB: { id: string; email: string };
let A: { societeId: string; vehiculeId: string };
let B: { societeId: string; vehiculeId: string };
let chauffeur: { userId: string; email: string; chauffeurId: string };

beforeAll(async () => {
  tarifAvant = await db.tarifDrive.findUnique({ where: { region: REGION } });
  await db.tarifDrive.upsert({
    where: { region: REGION },
    create: { region: REGION, ...TARIF, actif: true },
    update: { ...TARIF, actif: true },
  });
  await db.chauffeurDrive.updateMany({ where: { region: REGION, enLigne: true }, data: { enLigne: false } });

  gerantA = await compte("gerant-a");
  gerantB = await compte("gerant-b");
  A = await societeEnRegle(gerantA.id, BCE_A, `1TST${suffixe.slice(-3).toUpperCase()}`);
  B = await societeEnRegle(gerantB.id, BCE_B, `2TST${suffixe.slice(-3).toUpperCase()}`);
  chauffeur = await chauffeurDeSociete(gerantA.id, "chauffeur-a");
});

afterAll(async () => {
  const societes = await db.societeDrive.findMany({ where: { gerantId: { in: comptes } }, select: { id: true } });
  const ids = societes.map((s) => s.id);
  await db.courseDrive.deleteMany({ where: { OR: [{ passagerId: { in: comptes } }, { societeId: { in: ids } }] } });
  await db.chauffeurDrive.deleteMany({ where: { userId: { in: comptes } } });
  await db.societeDrive.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: comptes } } });
  if (tarifAvant) {
    const { region: _r, createdAt: _c, updatedAt: _u, ...valeurs } = tarifAvant;
    await db.tarifDrive.update({ where: { region: REGION }, data: valeurs });
  } else {
    await db.tarifDrive.delete({ where: { region: REGION } }).catch(() => undefined);
  }
  await db.$disconnect();
});

describe("dossier de la société", () => {
  it("contrôle le numéro BCE et n'inscrit une entreprise qu'une fois", async () => {
    const autre = await compte("gerant-doublon");
    await expect(SocieteDriveService.creer(autre.id, { raisonSociale: "Faux", numeroEntreprise: "0123.456.748" })).rejects.toMatchObject({
      code: "INVALID_BCE_NUMBER",
    });
    await expect(SocieteDriveService.creer(autre.id, { raisonSociale: "Copie", numeroEntreprise: BCE_A })).rejects.toMatchObject({
      statusCode: 409,
      code: "BCE_ALREADY_REGISTERED",
    });
  });

  it("ouvrir deux fois rend le même dossier", async () => {
    const qui = await compte("gerant-idem");
    const [un, deux] = await Promise.all([
      SocieteDriveService.creer(qui.id, { raisonSociale: "Idem SRL" }),
      SocieteDriveService.creer(qui.id, { raisonSociale: "Idem SRL" }),
    ]);
    expect(un!.id).toBe(deux!.id);
    expect(await db.societeDrive.count({ where: { gerantId: qui.id } })).toBe(1);
  });

  it("ne se soumet que complète, et ne se valide qu'avec ses pièces validées", async () => {
    const qui = await compte("gerant-incomplet");
    await SocieteDriveService.creer(qui.id, { raisonSociale: "Lent SRL", region: REGION });
    await expect(SocieteDriveService.soumettre(qui.id)).rejects.toMatchObject({ code: "INCOMPLETE_FILE" });

    await SocieteDriveService.modifier(qui.id, { numeroEntreprise: bce((Date.now() % 9_000_000) + 7), telephone: "+32 9 000 00 00" });
    await SocieteDriveService.deposerPiece(qui.id, { type: "tva", ...fichierPdf() });
    await SocieteDriveService.soumettre(qui.id);
    const societe = (await SocieteDriveService.maSociete(qui.id))!;
    expect(societe.statut).toBe("SOUMIS");
    await expect(SocieteDriveService.valider(societe.id, "admin")).rejects.toMatchObject({ code: "INCOMPLETE_FILE" });
    // Figé pendant l'examen.
    await expect(SocieteDriveService.modifier(qui.id, { telephone: "+32 9 111 11 11" })).rejects.toMatchObject({ code: "DOSSIER_LOCKED" });
  });

  it("refuse une pièce qui n'est pas celle d'une société", async () => {
    await expect(SocieteDriveService.deposerPiece(gerantA.id, { type: "permis", ...fichierPdf() })).rejects.toMatchObject({
      code: "INVALID_DOCUMENT_TYPE",
    });
  });
});

describe("véhicules", () => {
  it("normalise la plaque et n'inscrit un véhicule actif qu'une fois", async () => {
    const plaque = `3-tst-${suffixe.slice(-3)}`;
    const v = await SocieteDriveService.ajouterVehicule(gerantA.id, { marque: "Skoda", modele: "Octavia", plaque });
    expect(v.plaque).toBe(`3TST${suffixe.slice(-3).toUpperCase()}`);
    await expect(SocieteDriveService.ajouterVehicule(gerantB.id, { marque: "Skoda", modele: "Octavia", plaque })).rejects.toMatchObject({
      code: "PLATE_ALREADY_REGISTERED",
    });
    // Retiré, il peut être inscrit ailleurs (vendu).
    await SocieteDriveService.retirerVehicule(gerantA.id, v.id);
    await expect(SocieteDriveService.ajouterVehicule(gerantB.id, { marque: "Skoda", modele: "Octavia", plaque })).resolves.toBeTruthy();
  });

  it("n'est conforme qu'avec toutes ses pièces validées", async () => {
    expect((await db.vehiculeDrive.findUniqueOrThrow({ where: { id: A.vehiculeId } })).conforme).toBe(true);
    const nouveau = await SocieteDriveService.ajouterVehicule(gerantA.id, { marque: "Kia", modele: "Niro", plaque: `4TST${suffixe.slice(-3)}` });
    const piece = await SocieteDriveService.deposerPieceVehicule(gerantA.id, nouveau.id, { type: "licence", ...fichierPdf() });
    await SocieteDriveService.examinerPiece(A.societeId, piece.id, { approuve: true });
    expect((await db.vehiculeDrive.findUniqueOrThrow({ where: { id: nouveau.id } })).conforme).toBe(false);
  });

  it("une pièce appartient à un seul dossier (contrainte en base)", async () => {
    await expect(
      db.documentChauffeurDrive.create({
        data: { type: "licence", url: "x", societeId: A.societeId, vehiculeId: A.vehiculeId },
      })
    ).rejects.toBeTruthy();
  });
});

describe("chauffeurs de société", () => {
  it("rattache à l'acceptation, avec la région de la société et un dossier réduit", async () => {
    const dossier = (await ChauffeurOnboardingService.monDossier(chauffeur.userId))!;
    expect(dossier.societeId).toBe(A.societeId);
    expect(dossier.region).toBe(REGION);
    expect(dossier.statut).toBe("VALIDE");
    expect(dossier.piecesExigees).toEqual(["identite", "permis", "bestuurderspas"]);
  });

  it("une invitation ne s'accepte que par son destinataire, et une société à la fois", async () => {
    const invitation = await SocieteDriveService.inviter(gerantB.id, chauffeur.email);
    // Inviter deux fois rend la même invitation.
    expect((await SocieteDriveService.inviter(gerantB.id, chauffeur.email)).id).toBe(invitation.id);

    const intrus = await compte("intrus");
    await expect(SocieteDriveService.accepterInvitation(intrus.id, invitation.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(SocieteDriveService.accepterInvitation(chauffeur.userId, invitation.id)).rejects.toMatchObject({
      code: "ALREADY_IN_COMPANY",
    });
    await SocieteDriveService.refuserInvitation(chauffeur.userId, invitation.id);
  });

  it("une pièce de la société ne se dépose pas depuis le dossier du chauffeur", async () => {
    await expect(ChauffeurOnboardingService.deposerPiece(chauffeur.userId, { type: "licence", ...fichierPdf() })).rejects.toMatchObject({
      code: "PIECE_DE_LA_SOCIETE",
    });
  });

  it("cloisonnement : une société ne touche ni aux véhicules ni aux chauffeurs d'une autre", async () => {
    await expect(SocieteDriveService.attribuerVehicule(gerantB.id, chauffeur.chauffeurId, B.vehiculeId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(SocieteDriveService.attribuerVehicule(gerantA.id, chauffeur.chauffeurId, B.vehiculeId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(SocieteDriveService.detacherChauffeur(gerantB.id, chauffeur.chauffeurId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(SocieteDriveService.deposerPieceVehicule(gerantB.id, A.vehiculeId, { type: "licence", ...fichierPdf() })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("le gérant lit les pièces de sa société, pas celles d'une autre", async () => {
    const piece = await db.documentChauffeurDrive.findFirstOrThrow({ where: { vehiculeId: A.vehiculeId } });
    const relatif = piece.url.split("/uploads/")[1];
    expect(await peutLire({ userId: gerantA.id }, relatif)).toBe(true);
    expect(await peutLire({ userId: gerantB.id }, relatif)).toBe(false);
    expect(await peutLire({ userId: chauffeur.userId }, relatif)).toBe(false);
  });
});

describe("courses d'un chauffeur de société", () => {
  const passagerCommande = async (passagerId: string, cle: string) => {
    const devis = await CourseDriveService.devis(passagerId, DEPART, ARRIVEE);
    return CourseDriveService.commander(passagerId, { devis: devis.devis, cleIdempotence: cle });
  };

  it("ne roule pas sans véhicule attribué", async () => {
    await expect(CourseDriveService.passerEnLigne(chauffeur.userId, true)).rejects.toMatchObject({ code: "VEHICLE_NOT_READY" });
  });

  it("roule avec le véhicule conforme attribué, et la course garde la société et le véhicule", async () => {
    await SocieteDriveService.attribuerVehicule(gerantA.id, chauffeur.chauffeurId, A.vehiculeId);
    await CourseDriveService.passerEnLigne(chauffeur.userId, true);
    await CourseDriveService.enregistrerPosition(chauffeur.userId, { latitude: DEPART.latitude + 0.005, longitude: DEPART.longitude });

    const passager = await compte("passager");
    const course = await passagerCommande(passager.id, `cle-${suffixe}-1`);
    const proposition = await db.propositionCourseDrive.findFirstOrThrow({
      where: { courseId: course.id, chauffeurId: chauffeur.chauffeurId, statut: "EN_ATTENTE" },
    });
    await CourseDriveService.accepter(chauffeur.userId, proposition.id);

    const acceptee = await db.courseDrive.findUniqueOrThrow({ where: { id: course.id } });
    expect(acceptee.societeId).toBe(A.societeId);
    expect(acceptee.vehiculeId).toBe(A.vehiculeId);
    // Le passager voit le véhicule de la société.
    const vue = await CourseDriveService.maCourse(passager.id, course.id);
    expect(vue.chauffeur?.plaque).toBe((await db.vehiculeDrive.findUniqueOrThrow({ where: { id: A.vehiculeId } })).plaque);

    // Ni départ ni changement de véhicule pendant la course.
    await expect(SocieteDriveService.quitterSociete(chauffeur.userId)).rejects.toMatchObject({ code: "RIDE_IN_PROGRESS" });
    await expect(SocieteDriveService.attribuerVehicule(gerantA.id, chauffeur.chauffeurId, null)).rejects.toMatchObject({
      code: "RIDE_IN_PROGRESS",
    });
    await CourseDriveService.avancer(chauffeur.userId, course.id, "arrive");
    await CourseDriveService.avancer(chauffeur.userId, course.id, "demarrer");
    await CourseDriveService.avancer(chauffeur.userId, course.id, "terminer");

    const { courses } = await SocieteDriveService.courses(gerantA.id, { limit: 10, offset: 0 });
    expect(courses.map((c) => c.id)).toContain(course.id);
    expect((await SocieteDriveService.courses(gerantB.id, { limit: 10, offset: 0 })).courses.map((c) => c.id)).not.toContain(course.id);
  });

  it("une pièce du véhicule qui expire l'arrête et met son chauffeur hors ligne", async () => {
    await CourseDriveService.passerEnLigne(chauffeur.userId, true);
    const assurance = await db.documentChauffeurDrive.findFirstOrThrow({
      where: { vehiculeId: A.vehiculeId, type: "assurance", archiveeLe: null },
    });
    await db.documentChauffeurDrive.update({ where: { id: assurance.id }, data: { dateExpiration: new Date(Date.now() - 1000) } });

    const resultat = await ChauffeurExpirationService.surveiller(new Date());
    expect(resultat.vehiculesArretes).toBeGreaterThanOrEqual(1);
    expect((await db.vehiculeDrive.findUniqueOrThrow({ where: { id: A.vehiculeId } })).conforme).toBe(false);
    expect((await db.chauffeurDrive.findUniqueOrThrow({ where: { id: chauffeur.chauffeurId } })).enLigne).toBe(false);
    await expect(CourseDriveService.passerEnLigne(chauffeur.userId, true)).rejects.toMatchObject({ code: "VEHICLE_NOT_READY" });

    // La version à jour, validée : il roule de nouveau.
    const neuve = await SocieteDriveService.deposerPieceVehicule(gerantA.id, A.vehiculeId, {
      type: "assurance",
      ...fichierPdf(),
      dateExpiration: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    });
    await SocieteDriveService.examinerPiece(A.societeId, neuve.id, { approuve: true });
    expect((await db.vehiculeDrive.findUniqueOrThrow({ where: { id: A.vehiculeId } })).conforme).toBe(true);
    await expect(CourseDriveService.passerEnLigne(chauffeur.userId, true)).resolves.toBeTruthy();
  });

  it("une société suspendue ne fait plus rouler ses chauffeurs", async () => {
    await SocieteDriveService.suspendre(A.societeId, "Contrôle en cours");
    expect((await db.chauffeurDrive.findUniqueOrThrow({ where: { id: chauffeur.chauffeurId } })).enLigne).toBe(false);
    await expect(CourseDriveService.passerEnLigne(chauffeur.userId, true)).rejects.toMatchObject({ code: "COMPANY_NOT_ACTIVE" });
    await SocieteDriveService.reactiver(A.societeId);
  });

  it("quitter la société : son véhicule est libéré, et sans licence à lui il repasse en brouillon", async () => {
    await SocieteDriveService.quitterSociete(chauffeur.userId);
    const apres = await db.chauffeurDrive.findUniqueOrThrow({ where: { id: chauffeur.chauffeurId } });
    expect(apres.societeId).toBeNull();
    expect(apres.vehiculeId).toBeNull();
    expect(apres.enLigne).toBe(false);
    expect(apres.statut).toBe("BROUILLON");
    // L'historique garde la société.
    expect(await db.courseDrive.count({ where: { chauffeurId: chauffeur.chauffeurId, societeId: A.societeId } })).toBeGreaterThanOrEqual(1);
  });
});
