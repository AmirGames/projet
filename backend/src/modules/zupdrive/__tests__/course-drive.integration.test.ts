import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * ZupDrive — courses : prix, attribution au chauffeur le plus proche,
 * étapes, annulations. Contre une vraie base PostgreSQL (DATABASE_URL) :
 * l'attribution repose sur des filtres de relations et des transactions que
 * seul Prisma sur PostgreSQL vérifie vraiment. La suite crée ses propres
 * comptes et les retire à la fin.
 *
 *   set -a; . ./.env; set +a; npx jest src/modules/zupdrive/__tests__/course-drive.integration.test.ts
 */

jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bcrypt from "bcrypt";
import { db } from "../../../services/db";
import {
  calculerPrix,
  regionDuCodePostal,
} from "../tarification-drive.service";
import { CourseDriveService, DELAI_REPONSE_MS, RECHERCHE_MAX_MS } from "../course-drive.service";
import { estimer as estimerTrajet, COEFFICIENT_DETOUR } from "../itineraire.service";
import { signerDevis } from "../devis-signe";

const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const REGION = "WALLONIE";
// Namur (5000) → Jambes (5100) : même région, un peu plus d'un kilomètre.
const DEPART = { adresse: "Place d'Armes, 5000 Namur", latitude: 50.4632, longitude: 4.8665, codePostal: "5000" };
const ARRIVEE = { adresse: "Avenue Jean Materne, 5100 Jambes", latitude: 50.4555, longitude: 4.8759, codePostal: "5100" };
/** Un point à `km` kilomètres au nord du départ. */
const auNord = (km: number) => ({ latitude: DEPART.latitude + km / 111.2, longitude: DEPART.longitude });

const TARIF = { priseEnChargeCentimes: 250, parKmCentimes: 180, parMinuteCentimes: 30, minimumCentimes: 800 };

let tarifAvant: any = null;
const comptes: string[] = [];
let passager: string;
let autrePassager: string;
let proche: { id: string; userId: string };
let loin: { id: string; userId: string };

async function compte(nom: string) {
  const user = await db.user.create({
    data: { email: `${nom}-${suffixe}@zupdrive.test`, name: `${nom} Test`, passwordHash: await bcrypt.hash("x", 4) },
  });
  comptes.push(user.id);
  return user.id;
}

async function chauffeur(nom: string, extra: Record<string, unknown>) {
  const userId = await compte(nom);
  const c = await db.chauffeurDrive.create({
    data: {
      userId,
      nomComplet: `${nom} Chauffeur`,
      region: REGION,
      statut: "VALIDE",
      enLigne: true,
      positionLe: new Date(),
      vehiculePlaque: "TLAA123",
      ...extra,
    },
  });
  return { id: c.id, userId };
}

let cle = 0;
/** Un devis pour ce passager, puis la commande de ce devis. */
const commande = async (qui: string) => {
  const devis = await CourseDriveService.devis(qui, DEPART, ARRIVEE);
  return CourseDriveService.commander(qui, { devis: devis.devis, cleIdempotence: `cle-${suffixe}-${++cle}` });
};

const propositionOuverte = (chauffeurId: string) =>
  db.propositionCourseDrive.findFirst({ where: { chauffeurId, statut: "EN_ATTENTE" } });

beforeAll(async () => {
  tarifAvant = await db.tarifDrive.findUnique({ where: { region: REGION } });
  await db.tarifDrive.upsert({
    where: { region: REGION },
    create: { region: REGION, ...TARIF, actif: true },
    update: { ...TARIF, actif: true },
  });
  // Aucun autre chauffeur de la région en ligne ne doit se glisser dans l'attribution.
  await db.chauffeurDrive.updateMany({ where: { region: REGION, enLigne: true }, data: { enLigne: false } });

  passager = await compte("passager");
  autrePassager = await compte("curieux");
  proche = await chauffeur("proche", auNord(1));
  loin = await chauffeur("loin", auNord(5));
  // Proches mais exclus : une autre région, un suspendu, une position périmée, trop loin.
  await chauffeur("bruxellois", { ...auNord(0.5), region: "BRUXELLES" });
  await chauffeur("suspendu", { ...auNord(0.5), statut: "SUSPENDU" });
  await chauffeur("perime", { ...auNord(0.5), positionLe: new Date(Date.now() - 10 * 60_000) });
  await chauffeur("lointain", auNord(40));
});

afterAll(async () => {
  await db.courseDrive.deleteMany({ where: { passagerId: { in: comptes } } });
  await db.chauffeurDrive.deleteMany({ where: { userId: { in: comptes } } });
  await db.user.deleteMany({ where: { id: { in: comptes } } });
  if (tarifAvant) {
    const { region: _r, createdAt: _c, updatedAt: _u, ...valeurs } = tarifAvant;
    await db.tarifDrive.update({ where: { region: REGION }, data: valeurs });
  } else {
    await db.tarifDrive.delete({ where: { region: REGION } }).catch(() => undefined);
  }
  await db.$disconnect();
});

beforeEach(async () => {
  // Chaque scénario part sans course active ni proposition ouverte.
  await db.courseDrive.updateMany({
    where: { passagerId: { in: comptes }, statut: { in: ["RECHERCHE", "ACCEPTEE", "ARRIVEE", "EN_COURS"] } },
    data: { statut: "ANNULEE" },
  });
  await db.propositionCourseDrive.updateMany({
    where: { chauffeurId: { in: [proche.id, loin.id] }, statut: "EN_ATTENTE" },
    data: { statut: "CADUQUE" },
  });
  await db.chauffeurDrive.updateMany({ where: { id: { in: [proche.id, loin.id] } }, data: { positionLe: new Date() } });
});

describe("prix", () => {
  it("applique le minimum", () => {
    expect(calculerPrix(TARIF, 500, 60)).toBe(800);
  });

  it("n'arrondit qu'une fois, sur le total, au centime le plus proche", () => {
    // 250 + 180 × 3,333 km + 30 × 7,5 min = 250 + 599,94 + 225 = 1074,94 → 1075
    expect(calculerPrix(TARIF, 3333, 450)).toBe(1075);
  });

  it("estime la distance routière et la durée", () => {
    const { distanceMetres, dureeSecondes } = estimerTrajet(DEPART, auNord(10));
    expect(distanceMetres).toBeCloseTo(10_000 * COEFFICIENT_DETOUR, -2);
    // À 25 km/h : 13 km en un peu plus de 31 minutes.
    expect(dureeSecondes).toBeGreaterThan(30 * 60);
  });

  it("trouve la région d'après le code postal", () => {
    expect(regionDuCodePostal("1000")).toBe("BRUXELLES");
    expect(regionDuCodePostal("1300")).toBe("WALLONIE");
    expect(regionDuCodePostal("2000")).toBe("FLANDRE");
    expect(regionDuCodePostal("5000")).toBe("WALLONIE");
    expect(regionDuCodePostal("9000")).toBe("FLANDRE");
    expect(regionDuCodePostal("75001")).toBeNull();
  });
});

describe("devis et commande", () => {
  it("refuse un trajet entre deux régions", async () => {
    await expect(
      CourseDriveService.devis(passager, DEPART, { ...ARRIVEE, codePostal: "1000" })
    ).rejects.toMatchObject({ code: "CROSS_REGION_RIDE" });
  });

  it("refuse une région où le service n'est pas ouvert", async () => {
    await db.tarifDrive.upsert({
      where: { region: "FLANDRE" },
      create: { region: "FLANDRE", ...TARIF, actif: false },
      update: {},
    });
    const flandre = await db.tarifDrive.findUnique({ where: { region: "FLANDRE" } });
    if (!flandre?.actif) {
      await expect(
        CourseDriveService.devis(passager, { ...DEPART, codePostal: "9000" }, { ...ARRIVEE, codePostal: "9000" })
      ).rejects.toMatchObject({ code: "REGION_NOT_SERVED" });
    }
  });

  it("refuse un devis retouché, celui d'un autre compte, ou un devis expiré", async () => {
    const devis = await CourseDriveService.devis(passager, DEPART, ARRIVEE);
    const nouvelleCle = () => `cle-${suffixe}-${++cle}`;

    // Le prix baissé dans le devis : la signature ne correspond plus.
    const [corps, signature] = devis.devis.split(".");
    const retouche = JSON.parse(Buffer.from(corps, "base64url").toString());
    retouche.prixCentimes = 1;
    const falsifie = `${Buffer.from(JSON.stringify(retouche)).toString("base64url")}.${signature}`;
    await expect(
      CourseDriveService.commander(passager, { devis: falsifie, cleIdempotence: nouvelleCle() })
    ).rejects.toMatchObject({ code: "INVALID_QUOTE" });

    await expect(
      CourseDriveService.commander(autrePassager, { devis: devis.devis, cleIdempotence: nouvelleCle() })
    ).rejects.toMatchObject({ code: "INVALID_QUOTE" });

    const { v: _version, ...contenu } = retouche;
    const expire = signerDevis({ ...contenu, passagerId: passager, exp: Date.now() - 1 });
    await expect(
      CourseDriveService.commander(passager, { devis: expire, cleIdempotence: nouvelleCle() })
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
  });

  it("crée la course au prix fixe et la propose au chauffeur le plus proche, lui seul", async () => {
    const devis = await CourseDriveService.devis(passager, DEPART, ARRIVEE);
    const course = await commande(passager);

    expect(course.statut).toBe("RECHERCHE");
    expect(course.prixCentimes).toBe(devis.prixCentimes);
    expect(await propositionOuverte(proche.id)).not.toBeNull();
    expect(await propositionOuverte(loin.id)).toBeNull();
    const autres = await db.propositionCourseDrive.count({ where: { courseId: course.id } });
    expect(autres).toBe(1);
  });

  it("rend la même course quand la commande est rejouée, et refuse un second trajet en parallèle", async () => {
    const devis = await CourseDriveService.devis(passager, DEPART, ARRIVEE);
    const demande = { devis: devis.devis, cleIdempotence: `cle-${suffixe}-rejouee` };
    const premiere = await CourseDriveService.commander(passager, demande);
    const rejouee = await CourseDriveService.commander(passager, demande);
    expect(rejouee.id).toBe(premiere.id);

    await expect(commande(passager)).rejects.toMatchObject({ code: "RIDE_IN_PROGRESS" });
  });

  it("ne montre la course qu'à son passager", async () => {
    const course = await commande(passager);
    await expect(CourseDriveService.maCourse(autrePassager, course.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("attribution et étapes", () => {
  it("passe au suivant quand le plus proche refuse, puis attribue la course à celui qui accepte", async () => {
    const course = await commande(passager);

    const pourProche = (await propositionOuverte(proche.id))!;
    await CourseDriveService.refuser(proche.userId, pourProche.id);

    const pourLoin = (await propositionOuverte(loin.id))!;
    expect(pourLoin.courseId).toBe(course.id);

    // Le refus est définitif : sa proposition ne s'accepte plus.
    await expect(CourseDriveService.accepter(proche.userId, pourProche.id)).rejects.toMatchObject({ code: "OFFER_CLOSED" });

    const tableau = await CourseDriveService.accepter(loin.userId, pourLoin.id);
    expect(tableau.course?.statut).toBe("ACCEPTEE");

    const vue = await CourseDriveService.maCourse(passager, course.id);
    expect(vue.statut).toBe("ACCEPTEE");
    expect(vue.chauffeur).toMatchObject({ prenom: "loin", plaque: "TLAA123" });
    expect(vue.chauffeur?.position).not.toBeNull();
  });

  it("n'attribue la course qu'une fois, même si l'acceptation arrive deux fois en même temps", async () => {
    const course = await commande(passager);
    const proposition = (await propositionOuverte(proche.id))!;

    const resultats = await Promise.allSettled([
      CourseDriveService.accepter(proche.userId, proposition.id),
      CourseDriveService.accepter(proche.userId, proposition.id),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lue = await db.courseDrive.findUnique({ where: { id: course.id } });
    expect(lue).toMatchObject({ statut: "ACCEPTEE", chauffeurId: proche.id });
  });

  it("fait avancer la course dans l'ordre, et pas autrement", async () => {
    const devis = await CourseDriveService.devis(passager, DEPART, ARRIVEE);
    const course = await commande(passager);
    await CourseDriveService.accepter(proche.userId, (await propositionOuverte(proche.id))!.id);

    await expect(CourseDriveService.avancer(proche.userId, course.id, "terminer")).rejects.toMatchObject({
      code: "INVALID_RIDE_STATUS",
    });
    // Un autre chauffeur ne touche pas à cette course.
    await expect(CourseDriveService.avancer(loin.userId, course.id, "arrive")).rejects.toMatchObject({ statusCode: 404 });

    await CourseDriveService.avancer(proche.userId, course.id, "arrive");
    await CourseDriveService.avancer(proche.userId, course.id, "arrive"); // rejouée : sans effet
    await CourseDriveService.avancer(proche.userId, course.id, "demarrer");

    // À bord, le passager ne peut plus annuler.
    await expect(CourseDriveService.annulerParPassager(passager, course.id)).rejects.toMatchObject({
      code: "INVALID_RIDE_STATUS",
    });

    await CourseDriveService.avancer(proche.userId, course.id, "terminer");
    const finie = await db.courseDrive.findUnique({ where: { id: course.id } });
    expect(finie?.statut).toBe("TERMINEE");
    expect(finie?.arriveeLe && finie.debutLe && finie.termineeLe).toBeTruthy();
    expect(finie?.prixCentimes).toBe(devis.prixCentimes);
  });

  it("un chauffeur occupé ne reçoit pas d'autre course", async () => {
    await commande(passager);
    await CourseDriveService.accepter(proche.userId, (await propositionOuverte(proche.id))!.id);

    await commande(autrePassager);
    expect(await propositionOuverte(proche.id)).toBeNull();
    expect(await propositionOuverte(loin.id)).not.toBeNull();
  });

  it("une annulation du passager ferme la proposition ouverte", async () => {
    const course = await commande(passager);
    const proposition = (await propositionOuverte(proche.id))!;

    await CourseDriveService.annulerParPassager(passager, course.id, "Plus besoin");
    await expect(CourseDriveService.accepter(proche.userId, proposition.id)).rejects.toMatchObject({ code: "OFFER_CLOSED" });
  });
});

describe("dans la durée", () => {
  it("une proposition sans réponse expire, et la course passe au suivant", async () => {
    const course = await commande(passager);
    const plusTard = new Date(Date.now() + DELAI_REPONSE_MS + 1000);

    await CourseDriveService.balayer(plusTard);
    const expiree = await db.propositionCourseDrive.findFirst({ where: { courseId: course.id, chauffeurId: proche.id } });
    expect(expiree?.statut).toBe("EXPIREE");
    const suivante = await db.propositionCourseDrive.findFirst({ where: { courseId: course.id, chauffeurId: loin.id } });
    expect(suivante?.statut).toBe("EN_ATTENTE");
  });

  it("sans preneur à temps, la course passe SANS_CHAUFFEUR", async () => {
    const course = await commande(passager);
    await CourseDriveService.balayer(new Date(Date.now() + RECHERCHE_MAX_MS + 60_000));
    const lue = await db.courseDrive.findUnique({ where: { id: course.id } });
    expect(lue?.statut).toBe("SANS_CHAUFFEUR");
  });

  it("seul un chauffeur validé peut se mettre en ligne", async () => {
    const suspendu = await db.chauffeurDrive.findFirst({ where: { userId: { in: comptes }, statut: "SUSPENDU" } });
    await expect(CourseDriveService.passerEnLigne(suspendu!.userId, true)).rejects.toMatchObject({
      code: "CHAUFFEUR_NOT_ACTIVE",
    });
  });
});
