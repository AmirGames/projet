import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// Accès générique à la base : seules les lectures de compte et de rôles comptent ici.
const tables: Record<string, Record<string, any>> = {};
const db: any = new Proxy({}, {
  get(_cible, table: string) {
    if (!tables[table]) {
      const methodes: Record<string, any> = {};
      tables[table] = new Proxy(methodes, {
        get(_m, methode: string) {
          if (!methodes[methode]) methodes[methode] = jest.fn(async () => (methode === "findMany" ? [] : methode === "count" ? 0 : null));
          return methodes[methode];
        },
      }) as any;
    }
    return tables[table];
  },
});
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/sso.service", () => ({ SsoService: { sessionActive: async () => true } }));
jest.mock("../../auth/auth.service", () => ({ AuthService: {
  verifyAccessToken: (jeton: string) => {
    if (!["client", "support"].includes(jeton)) {
      const { ApiError } = jest.requireActual("../../../middleware/errorHandler") as any;
      throw new ApiError(401, "Jeton invalide", "INVALID_TOKEN");
    }
    return { userId: jeton, sid: `session-${jeton}` };
  },
} }));

import superownerRouter from "../superowner.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { PERMISSIONS_PAR_DEFAUT } from "../../auth/permissions-plateforme.service";

/** Toutes les routes réellement enregistrées par le routeur, relevées dans sa pile Express. */
function routesDe(pile: any[], prefixe = ""): { methode: string; chemin: string }[] {
  return pile.flatMap((couche) => {
    if (couche.route) {
      return Object.keys(couche.route.methods).map((methode) => ({ methode, chemin: prefixe + couche.route.path }));
    }
    if (couche.name === "router" && couche.handle?.stack) return routesDe(couche.handle.stack, prefixe);
    return [];
  });
}

const ROUTES = routesDe((superownerRouter as any).stack).filter(({ chemin }) => typeof chemin === "string");
/** Un chemin Express devient une URL appelable : « :orgId » → un identifiant plausible. */
const url = (chemin: string) => `/api/superowner${chemin.replace(/:[A-Za-z]+(\([^)]*\))?\??/g, "identifiant1")}`;

const app = express();
app.use(express.json());
app.use("/api/superowner", superownerRouter);
app.use(errorHandler);

const COMPTES: Record<string, any> = {
  client: { isSuperOwner: false, isSystemAdmin: false, accesEquipe: [] },
  support: { isSuperOwner: false, isSystemAdmin: true, accesEquipe: [{ plateforme: "EAT", role: "SUPPORT" }] },
};

beforeEach(() => {
  db.user.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, status: "ACTIVE", passwordChangedAt: null, ...COMPTES[where.id] }));
  db.platformRole.findMany.mockResolvedValue(Object.entries(PERMISSIONS_PAR_DEFAUT).map(([code, permissions]) => ({ code, label: code, permissions })));
});

describe("routeur superowner : aucune route ne reste ouverte", () => {
  it("relève bien les routes de tous les sous-routeurs", () => {
    expect(ROUTES.length).toBeGreaterThan(80);
    const chemins = ROUTES.map(r => r.chemin);
    for (const attendu of ["/dashboard", "/admins", "/webhooks", "/organizations/:orgId/suspend"]) expect(chemins).toContain(attendu);
  });

  it.each(ROUTES.map(r => [r.methode.toUpperCase(), r.chemin]))("%s %s sans jeton → 401", async (methode, chemin) => {
    const r = await (request(app) as any)[methode.toLowerCase()](url(chemin)).send({});
    expect(r.status).toBe(401);
  });

  it.each(ROUTES.map(r => [r.methode.toUpperCase(), r.chemin]))("%s %s avec un compte sans rôle d'équipe → 403", async (methode, chemin) => {
    const r = await (request(app) as any)[methode.toLowerCase()](url(chemin)).set("Authorization", "Bearer client").send({});
    expect(r.status).toBe(403);
  });

  it("une route sans section reste réservée au superowner : le rôle Support n'y entre pas en modification", async () => {
    // La gestion de l'équipe et des rôles n'appartient à aucune section.
    for (const [methode, chemin] of [["post", "/admins"], ["patch", "/admins/identifiant1/role"], ["delete", "/admins/identifiant1"], ["post", "/roles"]]) {
      const r = await (request(app) as any)[methode](`/api/superowner${chemin}`).set("Authorization", "Bearer support").send({});
      expect(r.status).toBe(403);
    }
  });
});
