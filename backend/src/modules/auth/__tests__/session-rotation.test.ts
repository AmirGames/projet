import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

/**
 * Rotation des jetons de renouvellement, détection de réutilisation, refus des
 * jetons sans session en production, déconnexion — sur une base simulée.
 */

type Session = { id: string; userId: string; revokedAt: Date | null; expiresAt: Date };
type Jeton = { id: string; jtiHash: string; sessionId: string; usedAt: Date | null; expiresAt: Date };

let sessions: Session[] = [];
let jetons: Jeton[] = [];
let n = 0;

const db: any = {
  $transaction: jest.fn(async (action: any) => action(db)),
  sessionConnexion: {
    create: jest.fn(async ({ data }: any) => {
      const s = { id: `sess-${++n}`, revokedAt: null, ...data };
      sessions.push(s);
      return s;
    }),
    findUnique: jest.fn(async ({ where }: any) => sessions.find((s) => s.id === where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const l = sessions.filter((s) => (!where.id || s.id === where.id) &&
        (!where.userId || s.userId === where.userId) && (where.revokedAt === null ? !s.revokedAt : true));
      l.forEach((s) => Object.assign(s, data));
      return { count: l.length };
    }),
  },
  jetonRafraichissement: {
    create: jest.fn(async ({ data }: any) => {
      jetons.push({ id: `jt-${++n}`, usedAt: null, ...data });
    }),
    // Un instantané, comme la base : une lecture ne voit pas les écritures qui suivent.
    findUnique: jest.fn(async ({ where }: any) => {
      const trouve = jetons.find((j) => j.jtiHash === where.jtiHash);
      return trouve ? { ...trouve } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const l = jetons.filter((j) => j.id === where.id && !j.usedAt);
      l.forEach((j) => Object.assign(j, data));
      return { count: l.length };
    }),
    count: jest.fn(async ({ where }: any) => jetons.filter((j) => j.sessionId === where.sessionId).length),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  },
  user: {
    update: jest.fn(async ({ data }: any) => data),
    findUnique: jest.fn(async ({ where }: any) => ({
      id: where.id,
      isSuperOwner: false,
      isSystemAdmin: false,
      accesEquipe: [],
      passwordChangedAt: null,
    })),
  },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../compte-connecte", () => ({ compteConnecte: jest.fn(async (id: string) => ({ user: { id } })) }));

import { SsoService } from "../sso.service";
import { AuthService } from "../auth.service";
import { authMiddleware } from "../auth.middleware";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.get("/protege", authMiddleware, (_req, res) => res.json({ ok: true }));
app.use(errorHandler);

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e: any) {
    return e.code ?? e.message;
  }
};

describe("rotation des jetons de renouvellement", () => {
  beforeEach(() => {
    sessions = [];
    jetons = [];
    process.env.NODE_ENV = "test";
  });

  it("émet un nouveau refresh à chaque renouvellement et consomme l'ancien", async () => {
    const { refreshToken: r1, sid } = await SsoService.connecter("u1");
    const { refreshToken: r2, sid: sid2 } = await SsoService.renouveler(r1);

    expect(sid2).toBe(sid);
    expect(r2).not.toBe(r1);
    expect(AuthService.verifyRefreshToken(r2).jti).not.toBe(AuthService.verifyRefreshToken(r1).jti);

    // Le nouveau jeton tourne à son tour.
    const { refreshToken: r3 } = await SsoService.renouveler(r2);
    expect(r3).toBeTruthy();
    expect(sessions[0].revokedAt).toBeNull();
  });

  it("révoque la session si un ancien refresh est présenté (après la tolérance)", async () => {
    const { refreshToken: r1, sid, accessToken } = await SsoService.connecter("u1");
    const { refreshToken: r2 } = await SsoService.renouveler(r1);

    // Le jeton a été consommé il y a une minute : ce n'est plus une concurrence.
    jetons.forEach((j) => j.usedAt && (j.usedAt = new Date(Date.now() - 60_000)));

    expect(await code(SsoService.renouveler(r1))).toBe("SESSION_INVALIDE");
    expect(sessions.find((s) => s.id === sid)!.revokedAt).not.toBeNull();

    // Le jeton légitime le plus récent et l'access token meurent avec la session.
    expect(await code(SsoService.renouveler(r2))).toBe("SESSION_INVALIDE");
    const res = await request(app).get("/protege").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_INVALIDE");
  });

  it("refuse sans révoquer un renouvellement concurrent (même jeton, quelques ms d'écart)", async () => {
    const { refreshToken: r1, sid } = await SsoService.connecter("u1");
    await SsoService.renouveler(r1);

    expect(await code(SsoService.renouveler(r1))).toBe("REFRESH_CONCURRENT");
    expect(sessions.find((s) => s.id === sid)!.revokedAt).toBeNull();
  });

  it("deux renouvellements réellement simultanés : un seul passe, la session reste ouverte (C-22)", async () => {
    const { refreshToken: r1, sid } = await SsoService.connecter("u1");

    const [a, b] = await Promise.allSettled([SsoService.renouveler(r1), SsoService.renouveler(r1)]);
    const reussis = [a, b].filter((r) => r.status === "fulfilled");
    const refuses = [a, b].filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(reussis).toHaveLength(1);
    expect(refuses).toHaveLength(1);
    expect(refuses[0].reason.code).toBe("REFRESH_CONCURRENT");
    expect(sessions.find((s) => s.id === sid)!.revokedAt).toBeNull();

    // Le jeton gagnant reste utilisable : la session n'a pas été fermée.
    const { refreshToken: r2 } = (reussis[0] as PromiseFulfilledResult<{ refreshToken: string }>).value;
    expect((await SsoService.renouveler(r2)).refreshToken).toBeTruthy();
  });

  it("un jeton consommé depuis longtemps puis rejoué ferme toujours la session (vol)", async () => {
    const { refreshToken: r1, sid } = await SsoService.connecter("u1");
    await SsoService.renouveler(r1);
    jetons.forEach((j) => j.usedAt && (j.usedAt = new Date(Date.now() - 60_000)));
    expect(await code(SsoService.renouveler(r1))).toBe("SESSION_INVALIDE");
    expect(sessions.find((s) => s.id === sid)!.revokedAt).not.toBeNull();
  });

  it("déconnexion : l'access token et le refresh cessent de valoir", async () => {
    const { accessToken, refreshToken, sid } = await SsoService.connecter("u1");
    const avant = await request(app).get("/protege").set("Authorization", `Bearer ${accessToken}`);
    expect(avant.status).toBe(200);

    await SsoService.fermer(sid);

    const apres = await request(app).get("/protege").set("Authorization", `Bearer ${accessToken}`);
    expect(apres.status).toBe(401);
    expect(await code(SsoService.renouveler(refreshToken))).toBe("SESSION_INVALIDE");
  });

  it("REST et temps réel relisent une révocation externe sans cache", async () => {
    const { sid } = await SsoService.connecter("u1");
    expect(await SsoService.sessionActive(sid)).toBe(true);
    sessions.find((s) => s.id === sid)!.revokedAt = new Date();
    expect(await SsoService.sessionActive(sid)).toBe(false);
    expect(await SsoService.sessionActive(sid, { sansCache: true })).toBe(false);
  });
});

describe("jetons sans session (sid)", () => {
  beforeEach(() => {
    sessions = [];
    jetons = [];
  });

  it("refuse en production un access token sans sid", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(app)
      .get("/protege")
      .set("Authorization", `Bearer ${AuthService.generateAccessToken("u1")}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_INVALIDE");
  });

  it("refuse en production un refresh sans sid", async () => {
    process.env.NODE_ENV = "production";
    expect(await code(SsoService.renouveler(AuthService.generateRefreshToken("u1")))).toBe("SESSION_INVALIDE");
  });

  it("l'accepte hors production (compatibilité des anciens jetons)", async () => {
    process.env.NODE_ENV = "test";
    const res = await request(app)
      .get("/protege")
      .set("Authorization", `Bearer ${AuthService.generateAccessToken("u1")}`);
    expect(res.status).toBe(200);
  });

  it("n'accepte un refresh sans jti qu'une fois, et pas si la session tourne déjà", async () => {
    process.env.NODE_ENV = "test";
    const { sid } = await SsoService.connecter("u1");
    // Un refresh antérieur à la rotation : sid, pas de jti. La session a déjà
    // émis un jeton roté (connecter) : il est refusé et la session se ferme.
    const ancien = AuthService.generateRefreshToken("u1", sid);
    expect(await code(SsoService.renouveler(ancien))).toBe("SESSION_INVALIDE");
    expect(sessions[0].revokedAt).not.toBeNull();
  });
});

describe("refresh par cookie httpOnly (opt-in web) et CSRF", () => {
  // Les routes réelles sont montées ici : seule la base est simulée.
  const auth = express();
  auth.use(express.json());
  beforeAll(async () => {
    auth.use("/api/auth", (await import("../auth.routes")).default);
    auth.use("/api/auth", (await import("../auth.motdepasse.routes")).default);
    auth.use(errorHandler);
  });

  beforeEach(() => {
    sessions = [];
    jetons = [];
    process.env.NODE_ENV = "test";
    process.env.FRONTEND_URL = "https://zupone.com";
  });

  const cookieDe = (res: request.Response) =>
    (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) => c.startsWith("zup_refresh="));

  it("refuse par cookie une origine étrangère (403 CSRF_ORIGINE) sans consommer le jeton", async () => {
    const { refreshToken } = await SsoService.connecter("u1");
    const res = await request(auth)
      .post("/api/auth/refresh")
      .set("Cookie", `zup_refresh=${refreshToken}`)
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_ORIGINE");
    expect(jetons.every((j) => !j.usedAt)).toBe(true);
  });

  it("refuse par cookie une requête sans Origin ni Referer", async () => {
    const { refreshToken } = await SsoService.connecter("u1");
    const res = await request(auth).post("/api/auth/refresh").set("Cookie", `zup_refresh=${refreshToken}`);
    expect(res.status).toBe(403);
  });

  it("renouvelle par cookie depuis une origine autorisée : nouveau cookie roté, refresh absent du corps", async () => {
    const { refreshToken } = await SsoService.connecter("u1");
    const res = await request(auth)
      .post("/api/auth/refresh")
      .set("Cookie", `zup_refresh=${refreshToken}`)
      .set("Origin", "https://zupone.com");

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = cookieDe(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie.split(";")[0]).not.toContain(refreshToken);
  });

  it("accepte le refresh par cookie depuis chaque domaine du site (public, pro, livreur, groupe, vitrine, drive, chauffeur)", async () => {
    // Les valeurs de deploy/env.production.example : FRONTEND_URL + ALLOWED_ORIGINS + SSO_ORIGIN.
    process.env.FRONTEND_URL = "https://zupeat.com";
    process.env.SSO_ORIGIN = "https://zupone.com";
    process.env.ALLOWED_ORIGINS =
      "https://manager.zupeat.com,https://delivery.zupeat.com,https://manager.zupone.com,https://zupone.com,https://zupdrive.com,https://driver.zupdrive.com";
    try {
      for (const origine of [
        "https://zupeat.com",
        "https://manager.zupeat.com",
        "https://delivery.zupeat.com",
        "https://manager.zupone.com",
        "https://zupone.com",
        "https://zupdrive.com",
        "https://driver.zupdrive.com",
      ]) {
        const { refreshToken } = await SsoService.connecter("u1");
        const res = await request(auth)
          .post("/api/auth/refresh")
          .set("Cookie", `zup_refresh=${refreshToken}`)
          .set("Origin", origine);
        expect({ origine, statut: res.status }).toEqual({ origine, statut: 200 });
      }

      // Un domaine voisin ou un faux sous-domaine n'est pas le site.
      for (const origine of ["https://zupeat.com.evil.example", "https://evil-zupeat.com", "http://zupeat.com"]) {
        const { refreshToken } = await SsoService.connecter("u1");
        const res = await request(auth)
          .post("/api/auth/refresh")
          .set("Cookie", `zup_refresh=${refreshToken}`)
          .set("Origin", origine);
        expect({ origine, statut: res.status }).toEqual({ origine, statut: 403 });
      }
    } finally {
      delete process.env.SSO_ORIGIN;
      delete process.env.ALLOWED_ORIGINS;
    }
  });

  it("logout par cookie : ferme la session, efface le cookie, CSRF contrôlé", async () => {
    const { refreshToken, accessToken, sid } = await SsoService.connecter("u1");

    const refuse = await request(auth)
      .post("/api/auth/logout")
      .set("Cookie", `zup_refresh=${refreshToken}`)
      .set("Origin", "https://evil.example");
    expect(refuse.status).toBe(403);
    expect(sessions.find((s) => s.id === sid)!.revokedAt).toBeNull();

    const ok = await request(auth)
      .post("/api/auth/logout")
      .set("Cookie", `zup_refresh=${refreshToken}`)
      .set("Origin", "https://zupone.com");
    expect(ok.status).toBe(200);
    expect(cookieDe(ok)).toMatch(/zup_refresh=;/);

    expect((await request(app).get("/protege").set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
    expect(await code(SsoService.renouveler(refreshToken))).toBe("SESSION_INVALIDE");
  });

  it("le mobile garde le refresh dans le corps (rotation comprise)", async () => {
    const { refreshToken } = await SsoService.connecter("u1");
    const res = await request(auth).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken);
    expect(cookieDe(res)).toBeUndefined();
  });
});


it("changement de mot de passe : ferme toutes les sessions, sans remettre de jetons", async () => {
  process.env.NODE_ENV = "test";
  const fixture = {
    id: "password-user", email: "password@example.test", status: "ACTIVE", emailVerified: true,
    passwordHash: await AuthService.hashPassword("AncienMotDePasse123!"),
    isSuperOwner: false, isSystemAdmin: false, accesEquipe: [], passwordChangedAt: null,
  };
  const original = db.user.findUnique.getMockImplementation();
  db.user.findUnique.mockImplementation(async () => fixture);
  try {
    const actuelle = await SsoService.connecter(fixture.id);
    const autre = await SsoService.connecter(fixture.id);
    const auth = express();
    auth.use(express.json());
    auth.use("/api/auth", (await import("../auth.routes")).default);
    auth.use("/api/auth", (await import("../auth.motdepasse.routes")).default);
    auth.use(errorHandler);
    const response = await request(auth).post("/api/auth/change-password")
      .set("Authorization", `Bearer ${actuelle.accessToken}`)
      .send({ currentPassword: "AncienMotDePasse123!", newPassword: "NouveauMotDePasse123!" });
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(db.$transaction).toHaveBeenCalled();
    expect(await SsoService.sessionActive(actuelle.sid)).toBe(false);
    expect(await SsoService.sessionActive(autre.sid)).toBe(false);
    expect((await request(app).get("/protege").set("Authorization", `Bearer ${actuelle.accessToken}`)).status).toBe(401);
    expect(await code(SsoService.renouveler(autre.refreshToken))).toBe("SESSION_INVALIDE");
  } finally { db.user.findUnique.mockImplementation(original); }
});
