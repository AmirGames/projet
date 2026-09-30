import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

/**
 * ZupDrive — inscription des chauffeurs (licence LVC) et validation par
 * l'équipe ZupDrive.
 *
 * Ce qui est vérifié : le dossier est toujours celui du compte connecté, il ne
 * se soumet que complet, les transitions d'état sont contrôlées côté serveur
 * (même en appelant les routes directement), et l'administration est réservée
 * aux rôles de la plateforme DRIVE, avec journalisation.
 */

const env = {
  NODE_ENV: "test",
  PORT: 3001,
  DATABASE_URL: "postgresql://localhost/test",
  JWT_SECRET: "x".repeat(40),
  JWT_REFRESH_SECRET: "y".repeat(40),
  API_URL: "http://api.exemple.test",
  FRONTEND_URL: "http://localhost:3000",
  ENABLE_STRIPE: false,
  ENABLE_EMAIL_VERIFICATION: false,
  LOG_LEVEL: "error",
};

// ---------------------------------------------------------------------------
// Une base en mémoire, limitée à ce que le module utilise.
// ---------------------------------------------------------------------------

type Ligne = Record<string, any>;
const tables: { chauffeurs: Ligne[]; documents: Ligne[] } = { chauffeurs: [], documents: [] };
let sequence = 0;
const nouvelId = (prefixe: string) => `${prefixe}${String(++sequence).padStart(24, "0")}`;

const correspond = (ligne: Ligne, where: Ligne = {}) =>
  Object.entries(where).every(([cle, valeur]) => {
    if (valeur && typeof valeur === "object" && "in" in valeur) return (valeur.in as unknown[]).includes(ligne[cle]);
    if (valeur && typeof valeur === "object" && "not" in valeur) return (ligne[cle] ?? null) !== valeur.not;
    if (valeur === null) return (ligne[cle] ?? null) === null;
    return ligne[cle] === valeur;
  });

const avecDocuments = (chauffeur: Ligne | undefined, include?: Ligne) =>
  chauffeur && include?.documents
    ? { ...chauffeur, documents: tables.documents.filter((d) => d.chauffeurId === chauffeur.id && !d.archiveeLe) }
    : chauffeur ?? null;

const db: any = {
  $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  systemConfig: { findFirst: jest.fn(async () => null) },
  platformRole: {
    // Les rôles de base, avec leurs permissions par défaut, sur chaque plateforme.
    findMany: jest.fn(async () =>
      Object.entries(
        jest.requireActual<any>("../../auth/permissions-plateforme.service").PERMISSIONS_PAR_DEFAUT as object
      ).map(([code, permissions]) => ({ code, label: code, permissions }))
    ),
    createMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(async ({ where }: any) => ({ name: `Nom ${where.id}`, email: `${where.id}@exemple.test` })),
  },
  notification: { create: jest.fn(async ({ data }: any) => ({ id: "n", ...data })) },
  systemAuditLog: { create: jest.fn(async () => ({})) },
  chauffeurDrive: {
    findUnique: jest.fn(async ({ where, include, select }: any) => {
      const trouve = tables.chauffeurs.find((c) => correspond(c, where));
      if (trouve && select?.user) return { user: { email: `${trouve.userId}@exemple.test` } };
      return avecDocuments(trouve, include);
    }),
    create: jest.fn(async ({ data }: any) => {
      if (tables.chauffeurs.some((c) => c.userId === data.userId)) throw Object.assign(new Error(), { code: "P2002" });
      const ligne = { id: nouvelId("ch"), statut: "BROUILLON", motifStatut: null, soumisLe: null, createdAt: new Date(), ...data };
      tables.chauffeurs.push(ligne);
      return ligne;
    }),
    update: jest.fn(async ({ where, data }: any) => Object.assign(tables.chauffeurs.find((c) => c.id === where.id)!, data)),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const lignes = tables.chauffeurs.filter((c) => correspond(c, where));
      lignes.forEach((l) => Object.assign(l, data));
      return { count: lignes.length };
    }),
    findMany: jest.fn(async ({ where }: any) =>
      tables.chauffeurs
        .filter((c) => correspond(c, where))
        .map((c) => ({ ...avecDocuments(c, { documents: true }), user: { email: `${c.userId}@exemple.test` } }))
    ),
    count: jest.fn(async ({ where }: any) => tables.chauffeurs.filter((c) => correspond(c, where)).length),
    groupBy: jest.fn(async () => []),
  },
  documentChauffeurDrive: {
    findUnique: jest.fn(async ({ where }: any) => tables.documents.find((d) => d.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => Object.assign(tables.documents.find((d) => d.id === where.id)!, data)),
    create: jest.fn(async ({ data }: any) => {
      const ligne = { id: nouvelId("doc"), createdAt: new Date(), archiveeLe: null, ...data };
      tables.documents.push(ligne);
      return ligne;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const lignes = tables.documents.filter((d) => correspond(d, where));
      lignes.forEach((l) => Object.assign(l, data));
      return { count: lignes.length };
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const piece = tables.documents.find((d) => d.url.endsWith(where.url.endsWith));
      const chauffeur = piece && tables.chauffeurs.find((c) => c.id === piece.chauffeurId);
      return chauffeur?.userId === where.chauffeur.userId ? { id: piece!.id } : null;
    }),
  },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => env, loadEnv: () => env }));
jest.mock("../../../config/logger", () => {
  const passe = (_req: any, _res: any, next: any) => next();
  return {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    requestLogger: passe,
    lireConsole: jest.fn(() => []),
  };
});
jest.mock("../../merchants/compte-restreint.middleware", () => ({
  compteRestreint: (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../../realtime/socket", () => ({
  ...(jest.requireActual("../../realtime/socket") as object),
  emitNotification: jest.fn(),
}));
jest.mock("../../notifications/notification.service", () => ({
  ...(jest.requireActual("../../notifications/notification.service") as object),
  notifierPlateforme: jest.fn(async () => undefined),
}));
jest.mock("../../files/file-upload.service", () => ({
  FileUploadService: {
    uploadDocument: jest.fn(async () => ({
      url: `http://api.exemple.test/uploads/chauffeurs/${String(++sequence).padStart(32, "a")}.jpg`,
      publicId: "p",
    })),
  },
}));

/**
 * La session : « Bearer <userId> » ou « Bearer <userId>:<plateforme>:<rôle> »
 * pour un membre de l'équipe. « superowner » est le superowner.
 */
jest.mock("../../auth/auth.middleware", () => {
  const { ApiError } = jest.requireActual("../../../middleware/errorHandler") as any;
  const authentifier = (req: any, _res: any, next: any) => {
    const entete: string | undefined = req.headers.authorization;
    if (!entete?.startsWith("Bearer ")) {
      return next(new ApiError(401, "Missing or invalid authorization header", "MISSING_AUTH"));
    }
    const [userId, plateforme, role] = entete.slice(7).split(":");
    req.userId = userId;
    req.user = { userId };
    req.compte = {
      id: userId,
      isSuperOwner: userId === "superowner",
      isSystemAdmin: Boolean(role),
      acces: role ? { [plateforme]: role } : {},
    };
    next();
  };
  return {
    ...(jest.requireActual("../../auth/auth.middleware") as object),
    authMiddleware: authentifier,
    authFacultative: (_req: any, _res: any, next: any) => next(),
  };
});

import { createApp } from "../../../app";
import { numeroBceNormalise, piecesExigees } from "../chauffeur-onboarding.service";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0, 0]);
// 0123.456.749 : 1234567 mod 97 = 48, 97 − 48 = 49.
const BCE = "BE 0123.456.749";

const PROFIL_COMPLET = {
  nomComplet: "Chauffeur Test",
  telephone: "+32 470 12 34 56",
  region: "WALLONIE",
  numeroEntreprise: BCE,
  numeroLicence: "LVC-2026-001",
  vehiculeMarque: "Toyota",
  vehiculeModele: "Corolla",
  vehiculePlaque: "t-laa-123",
};

let app: ReturnType<typeof createApp>;
const en = (qui: string) => ({ Authorization: `Bearer ${qui}` });

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  tables.chauffeurs = [];
  tables.documents = [];
  db.systemAuditLog.create.mockClear();
});

async function deposerTout(qui: string, region = "WALLONIE") {
  for (const type of piecesExigees(region)) {
    const reponse = await request(app)
      .post("/api/zupdrive/chauffeur/me/documents")
      .set(en(qui))
      .field("type", type)
      .attach("file", JPEG, { filename: "piece.jpg", contentType: "image/jpeg" });
    expect(reponse.status).toBe(201);
  }
}

async function dossierSoumis(qui = "user-chauffeur") {
  await request(app).post("/api/zupdrive/chauffeur/me").set(en(qui)).send(PROFIL_COMPLET).expect(201);
  await deposerTout(qui);
  await request(app).post("/api/zupdrive/chauffeur/me/submit").set(en(qui)).expect(200);
  return tables.chauffeurs.find((c) => c.userId === qui)!;
}

describe("règles", () => {
  it("vérifie le numéro BCE (modulo 97) et le normalise", () => {
    expect(numeroBceNormalise("BE0123.456.749")).toBe("0123456749");
    expect(numeroBceNormalise("0123 456 749")).toBe("0123456749");
    expect(numeroBceNormalise("0123.456.748")).toBeNull();
    expect(numeroBceNormalise("123456749")).toBeNull();
  });

  it("exige les pièces propres à la région", () => {
    expect(piecesExigees("FLANDRE")).toContain("bestuurderspas");
    expect(piecesExigees("FLANDRE")).not.toContain("casier_judiciaire");
    expect(piecesExigees("BRUXELLES")).toContain("casier_judiciaire");
    expect(piecesExigees("WALLONIE")).not.toContain("bestuurderspas");
  });
});

describe("dossier du chauffeur", () => {
  it("exige une session", async () => {
    await request(app).get("/api/zupdrive/chauffeur/me").expect(401);
  });

  it("n'a pas de dossier avant de le commencer", async () => {
    const reponse = await request(app).get("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).expect(200);
    expect(reponse.body.data).toBeNull();
  });

  it("ouvre un seul dossier même si la requête est rejouée", async () => {
    await request(app).post("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).send({}).expect(201);
    await request(app).post("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).send({}).expect(201);
    expect(tables.chauffeurs).toHaveLength(1);
    // Le nom vient du compte ZupOne quand il n'est pas donné.
    expect(tables.chauffeurs[0].nomComplet).toBe("Nom user-chauffeur");
  });

  it("refuse un numéro BCE invalide et normalise la plaque", async () => {
    await request(app).post("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).send({}).expect(201);
    const refus = await request(app)
      .patch("/api/zupdrive/chauffeur/me")
      .set(en("user-chauffeur"))
      .send({ numeroEntreprise: "0123.456.748" });
    expect(refus.status).toBe(400);
    expect(refus.body.code ?? refus.body.error?.code).toBe("INVALID_BCE_NUMBER");

    const ok = await request(app)
      .patch("/api/zupdrive/chauffeur/me")
      .set(en("user-chauffeur"))
      .send({ numeroEntreprise: BCE, vehiculePlaque: "t-laa-123" })
      .expect(200);
    expect(ok.body.data.numeroEntreprise).toBe("0123456749");
    expect(ok.body.data.numeroTva).toBe("BE0123456749");
    expect(ok.body.data.vehiculePlaque).toBe("TLAA123");
  });

  it("ne prend pas de champ inconnu (statut, userId…)", async () => {
    await request(app).post("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).send({}).expect(201);
    await request(app)
      .patch("/api/zupdrive/chauffeur/me")
      .set(en("user-chauffeur"))
      .send({ statut: "VALIDE" })
      .expect(400);
    expect(tables.chauffeurs[0].statut).toBe("BROUILLON");
  });

  it("ne soumet pas un dossier incomplet", async () => {
    await request(app).post("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).send(PROFIL_COMPLET).expect(201);
    const reponse = await request(app).post("/api/zupdrive/chauffeur/me/submit").set(en("user-chauffeur"));
    expect(reponse.status).toBe(400);
    expect(tables.chauffeurs[0].statut).toBe("BROUILLON");
  });

  it("soumet un dossier complet, une seule fois, puis le fige", async () => {
    const chauffeur = await dossierSoumis();
    expect(chauffeur.statut).toBe("SOUMIS");

    // Rejouer la soumission ne change rien.
    await request(app).post("/api/zupdrive/chauffeur/me/submit").set(en("user-chauffeur")).expect(200);

    await request(app).patch("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).send({ telephone: "+32 470 00 00 00" }).expect(409);
    await request(app)
      .post("/api/zupdrive/chauffeur/me/documents")
      .set(en("user-chauffeur"))
      .field("type", "assurance")
      .attach("file", JPEG, { filename: "piece.jpg", contentType: "image/jpeg" })
      .expect(409);
  });

  it("ne sert pas les pièces d'un chauffeur à un autre compte", async () => {
    await dossierSoumis("user-chauffeur");
    const piece = tables.documents[0];
    const relatif = piece.url.slice(piece.url.indexOf("/uploads/") + "/uploads/".length);

    await request(app)
      .get(`/api/files/signed-url`)
      .query({ url: piece.url })
      .set(en("user-curieux"))
      .expect(404);
    const proprietaire = await request(app).get(`/api/files/signed-url`).query({ url: piece.url }).set(en("user-chauffeur"));
    expect(proprietaire.status).toBe(200);
    expect(proprietaire.body.data.url).toContain(relatif);
  });
});

describe("administration ZupDrive", () => {
  it("est fermée aux comptes sans rôle ZupDrive, même admin ZupEat", async () => {
    await request(app).get("/api/zupdrive/admin/chauffeurs").set(en("user-chauffeur")).expect(403);
    await request(app).get("/api/zupdrive/admin/chauffeurs").set(en("admin-eat:EAT:ADMIN")).expect(403);
    await request(app).get("/api/zupdrive/admin/chauffeurs").set(en("admin-drive:DRIVE:ADMIN")).expect(200);
  });

  it("laisse le support ZupDrive lire sans décider", async () => {
    const chauffeur = await dossierSoumis();
    await request(app).get(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}`).set(en("support:DRIVE:SUPPORT")).expect(200);
    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/approve`).set(en("support:DRIVE:SUPPORT")).expect(403);
  });

  it("ne valide qu'un dossier dont toutes les pièces sont validées, et journalise", async () => {
    const chauffeur = await dossierSoumis();
    const admin = en("admin-drive:DRIVE:ADMIN");

    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/approve`).set(admin).expect(400);

    for (const piece of tables.documents) {
      await request(app)
        .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${piece.id}`)
        .set(admin)
        .send({ approuve: true })
        .expect(200);
    }

    const reponse = await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/approve`).set(admin).expect(200);
    expect(reponse.body.data.statut).toBe("VALIDE");
    expect(chauffeur.validePar).toBe("admin-drive");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ZUPDRIVE_APPROVE_CHAUFFEUR", target: chauffeur.id }),
      })
    );

    // Une seconde validation, ou un refus après coup, sont des transitions interdites.
    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/approve`).set(admin).expect(409);
    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/reject`).set(admin).send({ motif: "Trop tard" }).expect(409);
  });

  it("refuse une pièce ou un dossier seulement avec un motif, et le chauffeur peut corriger", async () => {
    const chauffeur = await dossierSoumis();
    const admin = en("superowner");
    const piece = tables.documents[0];

    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${piece.id}`)
      .set(admin)
      .send({ approuve: false })
      .expect(400);
    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/reject`).set(admin).send({}).expect(400);
    await request(app)
      .post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/reject`)
      .set(admin)
      .send({ motif: "Assurance illisible" })
      .expect(200);
    expect(chauffeur.statut).toBe("REFUSE");

    await request(app).patch("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).send({ telephone: "+32 470 99 99 99" }).expect(200);
    await request(app).post("/api/zupdrive/chauffeur/me/submit").set(en("user-chauffeur")).expect(200);
    expect(chauffeur.statut).toBe("SOUMIS");
    expect(chauffeur.motifStatut).toBeNull();
  });

  it("n'examine pas la pièce d'un autre dossier via l'identifiant", async () => {
    const premier = await dossierSoumis("user-a");
    await dossierSoumis("user-b");
    const pieceDeB = tables.documents.find((d) => d.chauffeurId !== premier.id)!;

    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${premier.id}/documents/${pieceDeB.id}`)
      .set(en("superowner"))
      .send({ approuve: true })
      .expect(404);
    expect(pieceDeB.statut).toBe("PENDING");
  });
});

describe("droits de l'espace manager, toutes plateformes", () => {
  const lire = (qui: string) => request(app).get("/api/superowner/me/permissions/plateformes").set(en(qui));

  it("donne la plateforme ZupDrive seule à un membre ZupDrive, sans 403 pour ZupEat", async () => {
    const reponse = await lire("admin-drive:DRIVE:ADMIN").expect(200);
    expect(reponse.body.plateformes.EAT).toBeNull();
    expect(reponse.body.plateformes.DRIVE.permissions.chauffeurs).toBe("write");
  });

  it("donne au support ZupDrive la lecture seule des chauffeurs", async () => {
    const reponse = await lire("support:DRIVE:SUPPORT").expect(200);
    expect(reponse.body.plateformes.DRIVE.permissions.chauffeurs).toBe("read");
  });

  it("refuse un compte hors de l'équipe", async () => {
    await lire("user-chauffeur").expect(403);
  });

  it("garde le 403 de la route par plateforme (application mobile ZupEat)", async () => {
    await request(app)
      .get("/api/superowner/me/permissions?plateforme=EAT")
      .set(en("admin-drive:DRIVE:ADMIN"))
      .expect(403);
  });
});

describe("suspension pour une pièce expirée", () => {
  /** Un chauffeur validé dont la licence vient d'expirer, suspendu par la surveillance. */
  async function suspenduPourExpiration(qui = "user-chauffeur") {
    const chauffeur = await dossierSoumis(qui);
    const admin = en("superowner");
    for (const piece of tables.documents.filter((d) => d.chauffeurId === chauffeur.id)) {
      await request(app)
        .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${piece.id}`)
        .set(admin)
        .send({ approuve: true })
        .expect(200);
    }
    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/approve`).set(admin).expect(200);
    // Ce que fait ChauffeurExpirationService (testé à part).
    tables.documents.find((d) => d.chauffeurId === chauffeur.id && d.type === "licence")!.statut = "EXPIRED";
    Object.assign(chauffeur, { statut: "SUSPENDU", motifStatut: "Licence expirée", suspenduPourExpirationLe: new Date() });
    return chauffeur;
  }

  const deposerLicence = (qui: string) =>
    request(app)
      .post("/api/zupdrive/chauffeur/me/documents")
      .set(en(qui))
      .field("type", "licence")
      .attach("file", JPEG, { filename: "licence.jpg", contentType: "image/jpeg" });

  it("laisse le chauffeur déposer la pièce à jour, et le rétablit quand l'équipe la valide", async () => {
    const chauffeur = await suspenduPourExpiration();
    await deposerLicence("user-chauffeur").expect(201);
    expect(chauffeur.statut).toBe("SUSPENDU");

    const licence = tables.documents.find((d) => d.chauffeurId === chauffeur.id && d.type === "licence")!;
    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${licence.id}`)
      .set(en("superowner"))
      .send({ approuve: true })
      .expect(200);

    expect(chauffeur.statut).toBe("VALIDE");
    expect(chauffeur.suspenduPourExpirationLe).toBeNull();
    expect(chauffeur.motifStatut).toBeNull();
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: expect.objectContaining({ chauffeur: { avant: "SUSPENDU", apres: "VALIDE" } }),
        }),
      })
    );
  });

  it("ne le rétablit pas tant que la pièce à jour n'est pas validée", async () => {
    const chauffeur = await suspenduPourExpiration();
    await deposerLicence("user-chauffeur").expect(201);
    const licence = tables.documents.find((d) => d.chauffeurId === chauffeur.id && d.type === "licence")!;
    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${licence.id}`)
      .set(en("superowner"))
      .send({ approuve: false, note: "Illisible" })
      .expect(200);
    expect(chauffeur.statut).toBe("SUSPENDU");
  });

  it("une suspension décidée par l'équipe fige le dossier et n'est jamais levée par un dépôt", async () => {
    const chauffeur = await suspenduPourExpiration();
    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/reactivate`).set(en("superowner")).expect(200);
    await request(app)
      .post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/suspend`)
      .set(en("superowner"))
      .send({ motif: "Plainte d'un passager" })
      .expect(200);
    expect(chauffeur.suspenduPourExpirationLe).toBeNull();
    await deposerLicence("user-chauffeur").expect(409);
  });
});

describe("renouvellement d'une pièce : l'ancienne version reste en vigueur", () => {
  async function chauffeurValide(qui = "user-chauffeur") {
    const chauffeur = await dossierSoumis(qui);
    for (const piece of tables.documents.filter((d) => d.chauffeurId === chauffeur.id)) {
      await request(app)
        .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${piece.id}`)
        .set(en("superowner"))
        .send({ approuve: true })
        .expect(200);
    }
    await request(app).post(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/approve`).set(en("superowner")).expect(200);
    return chauffeur;
  }

  const renouveler = (qui: string, type = "assurance") =>
    request(app)
      .post("/api/zupdrive/chauffeur/me/documents")
      .set(en(qui))
      .field("type", type)
      .field("dateExpiration", new Date(Date.now() + 400 * 86400000).toISOString())
      .attach("file", JPEG, { filename: "piece.jpg", contentType: "image/jpeg" });

  const versions = (chauffeurId: string, type = "assurance") =>
    tables.documents.filter((d) => d.chauffeurId === chauffeurId && d.type === type);

  it("dépose la nouvelle version à côté de l'ancienne, qui reste validée", async () => {
    const chauffeur = await chauffeurValide();
    const ancienne = versions(chauffeur.id)[0];
    await renouveler("user-chauffeur").expect(201);

    expect(versions(chauffeur.id)).toHaveLength(2);
    expect(ancienne.statut).toBe("APPROVED");
    expect(ancienne.archiveeLe).toBeFalsy();

    const moi = await request(app).get("/api/zupdrive/chauffeur/me").set(en("user-chauffeur")).expect(200);
    const assurances = moi.body.data.documents.filter((d: any) => d.type === "assurance");
    expect(assurances.map((d: any) => [d.statut, d.renouvellement])).toEqual([
      ["APPROVED", false],
      ["PENDING", true],
    ]);
  });

  it("un renouvellement refusé laisse l'ancienne version en vigueur, et le chauffeur validé", async () => {
    const chauffeur = await chauffeurValide();
    const ancienne = versions(chauffeur.id)[0];
    await renouveler("user-chauffeur").expect(201);
    const nouvelle = versions(chauffeur.id)[1];

    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${nouvelle.id}`)
      .set(en("superowner"))
      .send({ approuve: false, note: "Mauvais document" })
      .expect(200);

    expect(nouvelle.statut).toBe("REJECTED");
    expect(ancienne.statut).toBe("APPROVED");
    expect(ancienne.archiveeLe).toBeFalsy();
    expect(chauffeur.statut).toBe("VALIDE");

    // Un nouveau dépôt remplace la version refusée : pas de troisième version.
    await renouveler("user-chauffeur").expect(201);
    expect(versions(chauffeur.id)).toHaveLength(2);
    expect(nouvelle.statut).toBe("PENDING");
  });

  it("un renouvellement validé archive l'ancienne version, gardée pour l'historique", async () => {
    const chauffeur = await chauffeurValide();
    const ancienne = versions(chauffeur.id)[0];
    await renouveler("user-chauffeur").expect(201);
    const nouvelle = versions(chauffeur.id)[1];

    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${nouvelle.id}`)
      .set(en("superowner"))
      .send({ approuve: true })
      .expect(200);

    expect(nouvelle.statut).toBe("APPROVED");
    expect(ancienne.archiveeLe).toBeInstanceOf(Date);
    expect(tables.documents).toContain(ancienne);

    const dossier = await request(app).get(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}`).set(en("superowner")).expect(200);
    expect(dossier.body.data.documents.filter((d: any) => d.type === "assurance")).toHaveLength(1);

    // Une version archivée ne s'examine plus.
    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${ancienne.id}`)
      .set(en("superowner"))
      .send({ approuve: false, note: "Trop tard" })
      .expect(404);
  });

  it("refuse de valider une version expirée", async () => {
    const chauffeur = await chauffeurValide();
    const ancienne = versions(chauffeur.id)[0];
    Object.assign(ancienne, { statut: "EXPIRED", dateExpiration: new Date(Date.now() - 86400000) });
    await request(app)
      .patch(`/api/zupdrive/admin/chauffeurs/${chauffeur.id}/documents/${ancienne.id}`)
      .set(en("superowner"))
      .send({ approuve: true })
      .expect(400);
  });
});
