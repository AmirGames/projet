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
  sessionConnexion: {
    create: jest.fn(async ({ data }: any) => {
      const s = { id: `sess-${++n}`, revokedAt: null, ...data };
      sessions.push(s);
      return s;
    }),
    findUnique: jest.fn(async ({ where }: any) => sessions.find((s) => s.id === where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const l = sessions.filter((s) => s.id === where.id && (where.revokedAt === null ? !s.revokedAt : true));
      l.forEach((s) => Object.assign(s, data));
      return { count: l.length };
    }),
  },
  jetonRafraichissement: {
    create: jest.fn(async ({ data }: any) => {
      jetons.push({ id: `jt-${++n}`, usedAt: null, ...data });
    }),
    findUnique: jest.fn(async ({ where }: any) => jetons.find((j) => j.jtiHash === where.jtiHash) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const l = jetons.filter((j) => j.id === where.id && !j.usedAt);
      l.forEach((j) => Object.assign(j, data));
      return { count: l.length };
    }),
    count: jest.fn(async ({ where }: any) => jetons.filter((j) => j.sessionId === where.sessionId).length),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  },
  user: {
    findUnique: jest.fn(async ({ where }: any) => ({
      id: where.id,
      isSuperOwner: false,
      isSystemAdmin: false,
      accesEquipe: [],
      passwordChangedAt: null,
    })),
  },
};

jest.mock("../db", () => ({ db }));
jest.mock("../../services/db", () => ({ db }));

import { SsoService } from "../sso.service";
import { AuthService } from "../auth.service";
import { authMiddleware } from "../../middleware/auth";
import { errorHandler } from "../../middleware/errorHandler";

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

  it("déconnexion : l'access token et le refresh cessent de valoir", async () => {
    const { accessToken, refreshToken, sid } = await SsoService.connecter("u1");
    const avant = await request(app).get("/protege").set("Authorization", `Bearer ${accessToken}`);
    expect(avant.status).toBe(200);

    await SsoService.fermer(sid);

    const apres = await request(app).get("/protege").set("Authorization", `Bearer ${accessToken}`);
    expect(apres.status).toBe(401);
    expect(await code(SsoService.renouveler(refreshToken))).toBe("SESSION_INVALIDE");
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
