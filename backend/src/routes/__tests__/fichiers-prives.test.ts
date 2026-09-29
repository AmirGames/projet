import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import { join } from "path";
import request from "supertest";

/**
 * SEC — pièces privées du stockage local (CWE-552 / CWE-942).
 *
 * Permis, RIB, pièces des commerçants et photos de dépôt étaient servis sans
 * jeton sous /uploads, et /api/drivers/documents/file/* répondait
 * « Access-Control-Allow-Origin: * ».
 */

const ORIGINE_SITE = "http://localhost:3000";

const env = {
  NODE_ENV: "test",
  PORT: 3001,
  DATABASE_URL: "postgresql://localhost/test",
  JWT_SECRET: "x".repeat(40),
  JWT_REFRESH_SECRET: "y".repeat(40),
  API_URL: "http://api.exemple.test",
  FRONTEND_URL: ORIGINE_SITE,
  ENABLE_STRIPE: false,
  ENABLE_EMAIL_VERIFICATION: false,
  LOG_LEVEL: "error",
};

const db: any = {
  systemConfig: { findFirst: jest.fn(async () => null) },
  driverDocument: { findFirst: jest.fn() },
  organizationDocument: { findFirst: jest.fn() },
  orderDelivery: { findFirst: jest.fn() },
  membership: { findFirst: jest.fn() },
  platformRole: { findMany: jest.fn(async () => []), createMany: jest.fn() },
};

jest.mock("../../services/db", () => ({ db }));
jest.mock("../../config/env", () => ({ getEnv: () => env, loadEnv: () => env }));
jest.mock("../../config/logger", () => {
  const passe = (_req: any, _res: any, next: any) => next();
  return {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    requestLogger: passe,
    lireConsole: jest.fn(() => []),
  };
});
// Aucun verrou de compte ni de cloisonnement ici : ils ont leurs propres tests.
jest.mock("../../middleware/compte-restreint", () => ({
  compteRestreint: (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../../middleware/cloisonnement", () => ({
  cloisonnement: (_req: any, _res: any, next: any) => next(),
}));

/**
 * La session, réduite à ce qui compte ici : « Bearer <userId> ». Le compte
 * « user-plateforme » est le superowner.
 */
jest.mock("../../middleware/auth", () => {
  const { ApiError } = jest.requireActual("../../middleware/errorHandler") as any;
  const authentifier = (req: any, _res: any, next: any) => {
    const entete: string | undefined = req.headers.authorization;
    if (!entete?.startsWith("Bearer ")) {
      return next(new ApiError(401, "Missing or invalid authorization header", "MISSING_AUTH"));
    }
    const userId = entete.slice(7);
    req.userId = userId;
    req.compte = { id: userId, isSuperOwner: userId === "user-plateforme", isSystemAdmin: false, acces: {} };
    next();
  };
  return {
    ...(jest.requireActual("../../middleware/auth") as object),
    authMiddleware: authentifier,
    authFacultative: (_req: any, _res: any, next: any) => next(),
  };
});

import { createApp } from "../../app";
import { FileUploadService } from "../../services/file-upload.service";

const RACINE = join(process.cwd(), "uploads");
const PERMIS = "drivers/0123456789abcdef0123456789abcdef.jpg";
const ANCIEN_PERMIS = "drivers/1700000000000-0123456789abcdef.jpg";
const PIECE_COMMERCANT = "merchants/fedcba9876543210fedcba9876543210.pdf";
const PHOTO_DEPOT = "deliveries/aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb.jpg";
const LOGO = "stores/cccccccccccccccccccccccccccccccc.png";
const FICHIERS = [PERMIS, ANCIEN_PERMIS, PIECE_COMMERCANT, PHOTO_DEPOT, LOGO];
const crees: string[] = [];

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  for (const relatif of FICHIERS) {
    const complet = join(RACINE, relatif);
    fs.mkdirSync(join(complet, ".."), { recursive: true });
    fs.writeFileSync(complet, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]));
    crees.push(complet);
  }
  app = createApp();
});

afterAll(() => {
  for (const complet of crees) fs.rmSync(complet, { force: true });
});

beforeEach(() => {
  db.systemConfig.findFirst.mockResolvedValue(null);
  // Le permis appartient au livreur dont le compte est « user-livreur ».
  db.driverDocument.findFirst.mockImplementation(async ({ where }: any) =>
    where.driver.userId === "user-livreur" &&
    [PERMIS, ANCIEN_PERMIS].some((r) => where.documentUrl.endsWith === `/uploads/${r}`)
      ? { id: "doc-1" }
      : null
  );
  db.organizationDocument.findFirst.mockImplementation(async ({ where }: any) =>
    where.org.memberships.some.userId === "user-commercant" ? { id: "piece-1" } : null
  );
  db.orderDelivery.findFirst.mockImplementation(async ({ where }: any) =>
    where.proofPhoto.endsWith === `/uploads/${PHOTO_DEPOT}`
      ? {
          driver: { userId: "user-livreur" },
          order: { customer: { userId: "user-client" }, store: { orgId: "org-1" } },
        }
      : null
  );
  db.membership.findFirst.mockImplementation(async ({ where }: any) =>
    where.userId === "user-commercant" && where.orgId === "org-1" ? { id: "m-1" } : null
  );
});

describe("statique /uploads", () => {
  it("ne sert plus les pièces privées", async () => {
    for (const relatif of [PERMIS, PIECE_COMMERCANT, PHOTO_DEPOT]) {
      const reponse = await request(app).get(`/uploads/${relatif}`);
      expect(reponse.status).toBe(404);
    }
  });

  it("sert toujours les visuels des boutiques", async () => {
    const reponse = await request(app).get(`/uploads/${LOGO}`).set("Origin", ORIGINE_SITE);
    expect(reponse.status).toBe(200);
    expect(reponse.headers["access-control-allow-origin"]).toBe(ORIGINE_SITE);
  });

  it("ne remonte pas hors du dossier des boutiques", async () => {
    const reponse = await request(app).get(`/uploads/stores/..%2F${PERMIS}`);
    expect(reponse.status).toBe(404);
  });
});

describe("GET /api/files/<dossier>/<fichier>", () => {
  it("refuse sans jeton (401)", async () => {
    const reponse = await request(app).get(`/api/files/${PERMIS}`);
    expect(reponse.status).toBe(401);
  });

  it("refuse le permis d'un autre livreur", async () => {
    const reponse = await request(app).get(`/api/files/${PERMIS}`).set("Authorization", "Bearer user-autre-livreur");
    expect([403, 404]).toContain(reponse.status);
  });

  it("sert le permis à son propriétaire, sans cache ni CORS ouvert", async () => {
    const reponse = await request(app)
      .get(`/api/files/${PERMIS}`)
      .set("Authorization", "Bearer user-livreur")
      .set("Origin", ORIGINE_SITE);
    expect(reponse.status).toBe(200);
    expect(reponse.headers["content-type"]).toContain("image/jpeg");
    expect(reponse.headers["cache-control"]).toBe("private, no-store");
    expect(reponse.headers["access-control-allow-origin"]).toBe(ORIGINE_SITE);
    expect(reponse.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("ne renvoie jamais « * », ni l'origine d'un site étranger", async () => {
    const reponse = await request(app)
      .get(`/api/files/${PERMIS}`)
      .set("Authorization", "Bearer user-livreur")
      .set("Origin", "https://pirate.exemple");
    expect(reponse.status).toBe(200);
    expect(reponse.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sert la pièce commerçant aux membres de l'organisation et à la plateforme seulement", async () => {
    const membre = await request(app).get(`/api/files/${PIECE_COMMERCANT}`).set("Authorization", "Bearer user-commercant");
    const plateforme = await request(app).get(`/api/files/${PIECE_COMMERCANT}`).set("Authorization", "Bearer user-plateforme");
    const etranger = await request(app).get(`/api/files/${PIECE_COMMERCANT}`).set("Authorization", "Bearer user-livreur");
    expect(membre.status).toBe(200);
    expect(plateforme.status).toBe(200);
    expect(etranger.status).toBe(404);
  });

  it("sert la photo de dépôt au client, au commerce et au livreur de la course", async () => {
    for (const compte of ["user-client", "user-commercant", "user-livreur", "user-plateforme"]) {
      const reponse = await request(app).get(`/api/files/${PHOTO_DEPOT}`).set("Authorization", `Bearer ${compte}`);
      expect(reponse.status).toBe(200);
    }
    const etranger = await request(app).get(`/api/files/${PHOTO_DEPOT}`).set("Authorization", "Bearer user-autre");
    expect(etranger.status).toBe(404);
  });

  it("refuse une remontée de dossier", async () => {
    const reponse = await request(app)
      .get("/api/files/drivers/..%2F..%2Fpackage.json")
      .set("Authorization", "Bearer user-plateforme");
    expect(reponse.status).toBe(404);
  });
});

describe("adresses signées", () => {
  it("se délivrent au propriétaire, à partir de l'ancienne adresse enregistrée en base", async () => {
    const reponse = await request(app)
      .get("/api/files/signed-url")
      .query({ url: `http://localhost:3001/uploads/${ANCIEN_PERMIS}` })
      .set("Authorization", "Bearer user-livreur");
    expect(reponse.status).toBe(200);
    expect(reponse.headers["cache-control"]).toBe("private, no-store");

    const signee = new URL(reponse.body.data.url);
    expect(signee.pathname).toBe(`/api/files/${ANCIEN_PERMIS}`);
    expect(Number(signee.searchParams.get("exp")) - Date.now() / 1000).toBeLessThanOrEqual(300);

    // Une balise <img> n'envoie pas de jeton : l'adresse suffit.
    const image = await request(app).get(`${signee.pathname}${signee.search}`);
    expect(image.status).toBe(200);
    expect(image.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("ne se délivrent pas sans jeton ni à un autre livreur", async () => {
    const sans = await request(app).get("/api/files/signed-url").query({ url: `/uploads/${PERMIS}` });
    const autre = await request(app)
      .get("/api/files/signed-url")
      .query({ url: `/uploads/${PERMIS}` })
      .set("Authorization", "Bearer user-autre-livreur");
    expect(sans.status).toBe(401);
    expect(autre.status).toBe(404);
  });

  it("ne valent que pour leur fichier, et pas au-delà de l'échéance", async () => {
    const reponse = await request(app)
      .get("/api/files/signed-url")
      .query({ url: `/uploads/${PERMIS}` })
      .set("Authorization", "Bearer user-livreur");
    const signee = new URL(reponse.body.data.url);

    const autreFichier = await request(app).get(`/api/files/${PIECE_COMMERCANT}${signee.search}`);
    expect(autreFichier.status).toBe(403);

    const prolongee = await request(app).get(
      `${signee.pathname}?exp=${Number(signee.searchParams.get("exp")) + 3600}&sig=${signee.searchParams.get("sig")}`
    );
    expect(prolongee.status).toBe(403);
  });
});

describe("GET /api/drivers/documents/file/* (ancienne route)", () => {
  it("exige un jeton", async () => {
    const reponse = await request(app).get(`/api/drivers/documents/file/${PERMIS}`).set("Origin", ORIGINE_SITE);
    expect(reponse.status).toBe(401);
    expect(reponse.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("refuse un autre livreur et sert le propriétaire, sans « * »", async () => {
    const autre = await request(app)
      .get(`/api/drivers/documents/file/${PERMIS}`)
      .set("Authorization", "Bearer user-autre-livreur");
    expect([403, 404]).toContain(autre.status);

    const proprietaire = await request(app)
      .get(`/api/drivers/documents/file/${PERMIS}`)
      .set("Authorization", "Bearer user-livreur")
      .set("Origin", "https://pirate.exemple");
    expect(proprietaire.status).toBe(200);
    expect(proprietaire.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("répond au préflight sans « * »", async () => {
    const reponse = await request(app)
      .options(`/api/drivers/documents/file/${PERMIS}`)
      .set("Origin", "https://pirate.exemple")
      .set("Access-Control-Request-Method", "GET");
    expect(reponse.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("noms de fichiers", () => {
  it("128 bits aléatoires, sans horodatage", async () => {
    const { url } = await FileUploadService.uploadDocument(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), "permis.jpg", "drivers", "image/jpeg");
    const nom = url.split("/").pop()!;
    crees.push(join(RACINE, "drivers", nom));
    expect(nom).toMatch(/^[a-f0-9]{32}\.jpg$/);
  });

  it("refuse un contenu qui n'est ni image ni PDF, quel que soit son nom", async () => {
    await expect(
      FileUploadService.uploadDocument(Buffer.from("<html>"), "permis.jpg", "drivers", "image/jpeg")
    ).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" });
  });
});
