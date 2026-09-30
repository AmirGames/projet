import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * ZupDrive — relances d'expiration des pièces des chauffeurs : 30 puis 10
 * jours avant, une seule fois chacune, puis passage en « expirée ».
 */

type Ligne = Record<string, any>;
let pieces: Ligne[] = [];

/** Les filtres Prisma que le service emploie : égalité, null, in, gt/lte. */
const correspond = (ligne: Ligne, where: Ligne = {}) =>
  Object.entries(where).every(([cle, attendu]) => {
    const valeur = ligne[cle];
    if (attendu === null) return valeur === null || valeur === undefined;
    if (attendu && typeof attendu === "object" && !(attendu instanceof Date)) {
      if ("in" in attendu && !(attendu.in as unknown[]).includes(valeur)) return false;
      if ("gt" in attendu && !(valeur && valeur > attendu.gt)) return false;
      if ("lte" in attendu && !(valeur && valeur <= attendu.lte)) return false;
      return true;
    }
    return valeur === attendu;
  });

const db: any = {
  documentChauffeurDrive: {
    findMany: jest.fn(async ({ where }: any) =>
      pieces.filter((p) => correspond(p, where)).map((p) => ({ ...p, chauffeur: { nomComplet: "Chauffeur Test" } }))
    ),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const lignes = pieces.filter((p) => correspond(p, where));
      lignes.forEach((l) => Object.assign(l, data));
      return { count: lignes.length };
    }),
  },
  chauffeurDrive: {
    findUnique: jest.fn(async () => ({ nomComplet: "Chauffeur <Test>", user: { email: "chauffeur@exemple.test" } })),
  },
  notification: { create: jest.fn(async ({ data }: any) => ({ id: "n", ...data })) },
};

const courriels: any[] = [];
const sendEmail = jest.fn(async (data: any) => {
  courriels.push(data);
  return { success: true };
});
const notifierPlateforme = jest.fn(async (_titre: string, _message: string, _lien: string) => undefined);

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail } }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme }));
jest.mock("../../files/file-upload.service", () => ({ FileUploadService: {} }));

import { ChauffeurExpirationService } from "../chauffeur-expiration.service";

const JOUR = 24 * 3600 * 1000;
const MAINTENANT = new Date("2026-10-01T08:00:00Z");
const dans = (jours: number) => new Date(MAINTENANT.getTime() + jours * JOUR);

const piece = (id: string, expireDans: number | null, extra: Ligne = {}) => ({
  id,
  chauffeurId: "ch1",
  type: "assurance",
  statut: "APPROVED",
  dateExpiration: expireDans === null ? null : dans(expireDans),
  rappel30JoursLe: null,
  rappel10JoursLe: null,
  ...extra,
});

beforeEach(() => {
  pieces = [];
  courriels.length = 0;
  sendEmail.mockClear();
  notifierPlateforme.mockClear();
  db.notification.create.mockClear();
});

describe("relances d'expiration des pièces chauffeurs", () => {
  it("ne relance pas une pièce qui expire dans plus de 30 jours, ni sans date", async () => {
    pieces = [piece("a", 45), piece("b", null)];
    expect(await ChauffeurExpirationService.surveiller(MAINTENANT)).toEqual({ rappels: 0, expirees: 0 });
    expect(courriels).toHaveLength(0);
  });

  it("relance à 30 jours, une seule fois, dans l'espace et par courriel", async () => {
    pieces = [piece("a", 28)];
    expect((await ChauffeurExpirationService.surveiller(MAINTENANT)).rappels).toBe(1);
    expect(pieces[0].rappel30JoursLe).toEqual(MAINTENANT);
    expect(pieces[0].rappel10JoursLe).toBeNull();
    expect(courriels[0].subject).toContain("expire dans 28 jours");
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ link: "/chauffeur", priority: "HIGH" }) })
    );

    // Passage suivant, une heure plus tard : rien de plus.
    expect((await ChauffeurExpirationService.surveiller(new Date(MAINTENANT.getTime() + 3600000))).rappels).toBe(0);
    expect(courriels).toHaveLength(1);
  });

  it("relance de nouveau à 10 jours", async () => {
    pieces = [piece("a", 9, { rappel30JoursLe: dans(-21) })];
    expect((await ChauffeurExpirationService.surveiller(MAINTENANT)).rappels).toBe(1);
    expect(pieces[0].rappel10JoursLe).toEqual(MAINTENANT);
    // La date de la première relance est conservée.
    expect(pieces[0].rappel30JoursLe).toEqual(dans(-21));
    expect(courriels[0].subject).toContain("expire dans 9 jours");
  });

  it("n'envoie que la relance des 10 jours à une pièce déposée tardivement", async () => {
    pieces = [piece("a", 8)];
    expect((await ChauffeurExpirationService.surveiller(MAINTENANT)).rappels).toBe(1);
    expect(courriels).toHaveLength(1);
    expect(pieces[0].rappel10JoursLe).toEqual(MAINTENANT);
    // Marquée aussi pour les 30 jours : elle ne partira plus.
    expect(pieces[0].rappel30JoursLe).toEqual(MAINTENANT);
    await ChauffeurExpirationService.surveiller(MAINTENANT);
    expect(courriels).toHaveLength(1);
  });

  it("ne relance pas une pièce refusée ou déjà expirée", async () => {
    pieces = [piece("a", 5, { statut: "REJECTED" }), piece("b", 5, { statut: "EXPIRED" })];
    expect((await ChauffeurExpirationService.surveiller(MAINTENANT)).rappels).toBe(0);
  });

  it("un courriel en échec ne fait pas relancer au passage suivant", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SMTP indisponible"));
    pieces = [piece("a", 20)];
    await ChauffeurExpirationService.surveiller(MAINTENANT);
    expect(pieces[0].rappel30JoursLe).toEqual(MAINTENANT);
    await ChauffeurExpirationService.surveiller(MAINTENANT);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("passe la pièce échue en « expirée », prévient le chauffeur et l'équipe, une seule fois", async () => {
    pieces = [piece("a", -1, { rappel30JoursLe: dans(-31), rappel10JoursLe: dans(-11) })];
    expect(await ChauffeurExpirationService.surveiller(MAINTENANT)).toEqual({ rappels: 0, expirees: 1 });
    expect(pieces[0].statut).toBe("EXPIRED");
    expect(courriels[0].subject).toContain("document expiré");
    expect(notifierPlateforme).toHaveBeenCalledWith(
      expect.stringContaining("Pièce expirée"),
      expect.any(String),
      "/superowner/zupdrive/chauffeurs/ch1"
    );

    await ChauffeurExpirationService.surveiller(MAINTENANT);
    expect(notifierPlateforme).toHaveBeenCalledTimes(1);
  });

  it("échappe le nom du chauffeur dans le courriel", async () => {
    pieces = [piece("a", 20)];
    await ChauffeurExpirationService.surveiller(MAINTENANT);
    expect(courriels[0].html).toContain("Chauffeur &lt;Test&gt;");
  });
});
