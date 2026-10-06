import request from "supertest";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Inscription, connexion et confirmation d'adresse, route par route, sur une
 * base simulée en mémoire.
 *
 * Ce qui est vérifié ici : une fiche client née d'une commande sans compte ne
 * rejoint un compte qu'une fois l'adresse prouvée, et la connexion ne dit pas
 * si une adresse a un compte.
 */

type Fiche = { id: string; email: string; name: string; userId: string | null; deletedAt: Date | null };
type Compte = Record<string, any> & { id: string; email: string };

const users: Compte[] = [];
const customers: Fiche[] = [];
let suivant = 0;
const nouvelId = (prefixe: string) => `${prefixe}-${++suivant}`;

const correspond = (ligne: Record<string, any>, where: Record<string, any>) =>
  Object.entries(where).every(([cle, valeur]) => ligne[cle] === valeur);

const db: any = {
  user: {
    findUnique: jest.fn(async ({ where }: any) => users.find((u) => correspond(u, where)) ?? null),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => users.length),
    create: jest.fn(async ({ data }: any) => {
      const compte = { id: nouvelId("user"), emailVerified: false, passwordHash: null, ...data };
      users.push(compte);
      return compte;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const compte = users.find((u) => correspond(u, where))!;
      return Object.assign(compte, data);
    }),
  },
  customer: {
    findUnique: jest.fn(async ({ where }: any) => customers.find((c) => correspond(c, where)) ?? null),
    create: jest.fn(async ({ data }: any) => {
      if (customers.some((c) => c.email === data.email)) throw new Error("Unique constraint failed: email");
      const fiche = { id: nouvelId("customer"), userId: null, deletedAt: null, ...data };
      customers.push(fiche);
      return fiche;
    }),
    update: jest.fn(async ({ where, data }: any) => Object.assign(customers.find((c) => correspond(c, where))!, data)),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const lignes = customers.filter((c) => correspond(c, where));
      lignes.forEach((c) => Object.assign(c, data));
      return { count: lignes.length };
    }),
  },
};

const sendEmailVerification = jest.fn(async (..._args: any[]) => undefined);
const recordSecurityEvent = jest.fn(async (..._args: any[]) => undefined);

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../middleware/throttle", () => {
  const passer = (_req: any, _res: any, next: any) => next();
  return {
    limiterCadence: () => passer,
    limiterConnexions: Object.assign(passer, { reinitialiser: jest.fn(async () => undefined) }),
    limiterAuthParIp: passer,
    limiterCourrielsParIp: passer,
    limiterInscriptions: passer,
    parDestinataire: () => "",
  };
});
jest.mock("../sso.service", () => ({
  SsoService: {
    connecter: jest.fn(async () => ({ accessToken: "acces", refreshToken: "renouvellement" })),
    fermerToutes: jest.fn(async () => undefined),
    sessionActive: jest.fn(async () => true),
  },
}));
jest.mock("../security-event.service", () => ({
  SecurityEventService: { record: (...args: any[]) => recordSecurityEvent(...args) },
}));
jest.mock("../../notifications/email.service", () => ({
  EmailService: { sendEmailVerification: (...args: any[]) => sendEmailVerification(...args) },
}));
jest.mock("../../legal/acceptation-conditions.service", () => {
  const { z } = jest.requireActual("zod") as typeof import("zod");
  return {
    champAcceptation: { conditionsAcceptees: z.literal(true) },
    enregistrerAcceptation: jest.fn(async () => undefined),
  };
});
jest.mock("../compte-connecte", () => ({
  compteConnecte: jest.fn(async (userId: string) => ({ user: { id: userId } })),
}));

import authRouter, { confirmationExigee } from "../auth.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { AuthService } from "../auth.service";
import { ficheClientDuCompte } from "../../customers/fiche-client.service";

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.use(errorHandler);

const MOT_DE_PASSE = "MotDePasse123!";

const inscrire = (email: string) =>
  request(app)
    .post("/api/auth/signup")
    .send({ email, name: "Nouvel inscrit", password: MOT_DE_PASSE, conditionsAcceptees: true });

/** Le jeton du dernier lien de confirmation envoyé. */
async function jetonDeConfirmation() {
  // L'envoi part sans être attendu par la route.
  await new Promise((r) => setImmediate(r));
  const lien = String(sendEmailVerification.mock.calls.at(-1)?.[2]);
  return new URL(lien).searchParams.get("jeton")!;
}

const ficheInvite = (email: string): Fiche => {
  const fiche = { id: nouvelId("customer"), email, name: "Victime", userId: null, deletedAt: null };
  customers.push(fiche);
  return fiche;
};

const ancienEnv = { ...process.env };

beforeEach(() => {
  users.length = 0;
  customers.length = 0;
  jest.clearAllMocks();
  delete process.env.ENABLE_EMAIL_VERIFICATION;
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env = { ...ancienEnv };
});

describe("POST /auth/signup", () => {
  it("crée le compte et sa fiche client, sans dire ses droits d'administration", async () => {
    const res = await inscrire("nouveau@exemple.fr");

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: expect.any(String), email: "nouveau@exemple.fr", name: "Nouvel inscrit" });
    expect(res.body.user).not.toHaveProperty("isSuperOwner");
    expect(res.body.user).not.toHaveProperty("isSystemAdmin");
    expect(res.body).not.toHaveProperty("customer");
    expect(customers.find((c) => c.email === "nouveau@exemple.fr")?.userId).toBe(res.body.user.id);
  });

  it("ne rattache pas la fiche invité de même adresse, ni n'en crée une deuxième", async () => {
    const fiche = ficheInvite("victime@mail.com");

    const res = await inscrire("victime@mail.com");

    expect(res.status).toBe(201);
    expect(fiche.userId).toBeNull();
    expect(customers.filter((c) => c.email === "victime@mail.com")).toHaveLength(1);
    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });

  it("répond pareil qu'une fiche invité existe ou non à cette adresse", async () => {
    ficheInvite("victime@mail.com");
    const avecFiche = await inscrire("victime@mail.com");
    const sansFiche = await inscrire("inconnu@mail.com");

    const forme = (corps: any) => ({ ...corps, user: { ...corps.user, id: "", email: "" } });
    expect(forme(avecFiche.body)).toEqual(forme(sansFiche.body));
  });

  it("rattache la fiche invité une fois l'adresse confirmée", async () => {
    const fiche = ficheInvite("victime@mail.com");
    const res = await inscrire("victime@mail.com");
    const jeton = await jetonDeConfirmation();

    expect(fiche.userId).toBeNull();

    const confirmation = await request(app).post("/api/auth/verify-email").send({ jeton });

    expect(confirmation.status).toBe(200);
    expect(fiche.userId).toBe(res.body.user.id);
  });

  it("ne rattache pas une fiche invité avec un faux lien de confirmation", async () => {
    const fiche = ficheInvite("victime@mail.com");
    await inscrire("victime@mail.com");

    const confirmation = await request(app).post("/api/auth/verify-email").send({ jeton: "0".repeat(64) });

    expect(confirmation.status).toBe(400);
    expect(fiche.userId).toBeNull();
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    users.push({
      id: "user-existant",
      email: "client@exemple.fr",
      passwordHash: await AuthService.hashPassword(MOT_DE_PASSE),
      emailVerified: true,
      isSuperOwner: false,
      isSystemAdmin: false,
    });
  });

  const connecter = (email: string, password: string) =>
    request(app).post("/api/auth/login").send({ email, password });

  it("répond pareil pour une adresse inconnue et pour un mauvais mot de passe", async () => {
    const inconnue = await connecter("personne@exemple.fr", MOT_DE_PASSE);
    const mauvais = await connecter("client@exemple.fr", "MauvaisMotDePasse1!");

    expect(inconnue.status).toBe(401);
    expect(mauvais.status).toBe(401);
    expect(inconnue.body.code).toBe("INVALID_CREDENTIALS");
    expect(inconnue.body.code).toBe(mauvais.body.code);
    expect(inconnue.body.message ?? inconnue.body.error).toBe(mauvais.body.message ?? mauvais.body.error);
    expect(JSON.stringify(inconnue.body)).not.toContain("USER_NOT_FOUND");
  });

  it("compare quand même un mot de passe quand l'adresse n'a pas de compte", async () => {
    const comparer = jest.spyOn(AuthService, "comparePassword");

    await connecter("personne@exemple.fr", MOT_DE_PASSE);

    expect(comparer).toHaveBeenCalledTimes(1);
    expect(comparer.mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
    comparer.mockRestore();
  });

  it("connecte avec le bon mot de passe", async () => {
    const res = await connecter("client@exemple.fr", MOT_DE_PASSE);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("acces");
  });

  it("refuse un compte non confirmé en production, par défaut", async () => {
    users[0].emailVerified = false;
    process.env.NODE_ENV = "production";

    const res = await connecter("client@exemple.fr", MOT_DE_PASSE);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("confirmationExigee", () => {
  it("est exigée en production quand la variable n'est pas définie", () => {
    process.env.NODE_ENV = "production";
    expect(confirmationExigee()).toBe(true);
  });

  it("ne l'est pas en développement quand la variable n'est pas définie", () => {
    process.env.NODE_ENV = "development";
    expect(confirmationExigee()).toBe(false);
  });

  it("suit la variable quand elle est définie", () => {
    process.env.NODE_ENV = "production";
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    expect(confirmationExigee()).toBe(false);

    process.env.NODE_ENV = "development";
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    expect(confirmationExigee()).toBe(true);
  });
});

describe("Espace client : fiche du compte connecté", () => {
  const compte = (emailVerified: boolean) => {
    const c = { id: nouvelId("user"), email: "victime@mail.com", name: "Inscrit", emailVerified };
    users.push(c);
    return c;
  };

  it("refuse la fiche invité à un compte dont l'adresse n'est pas confirmée", async () => {
    const fiche = ficheInvite("victime@mail.com");
    const c = compte(false);

    await expect(ficheClientDuCompte(c.id, { creer: true })).rejects.toMatchObject({
      statusCode: 403,
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(fiche.userId).toBeNull();
  });

  it("rattache la fiche invité à un compte confirmé", async () => {
    const fiche = ficheInvite("victime@mail.com");
    const c = compte(true);

    const resultat = await ficheClientDuCompte(c.id, { creer: true });

    expect(resultat.id).toBe(fiche.id);
    expect(fiche.userId).toBe(c.id);
  });

  it("ne rend pas la fiche d'un autre compte à la même adresse", async () => {
    const fiche = ficheInvite("victime@mail.com");
    fiche.userId = "autre-compte";
    const c = compte(true);

    await expect(ficheClientDuCompte(c.id, { creer: true })).rejects.toMatchObject({ statusCode: 404 });
  });
});
