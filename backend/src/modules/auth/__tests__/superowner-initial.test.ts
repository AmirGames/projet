import request from "supertest";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "@jest/globals";

import { createApp } from "../../../app";
import { db } from "../../../services/db";
import {
  ConfigurationSuperownerInvalide,
  creerSuperownerInitial,
} from "../superowner-initial.service";

/**
 * SEC-03 : le premier inscrit ne devient plus superowner.
 *
 * Ces tests vident la base : ils ne tournent que sur une base dont le nom
 * contient « test », comme scripts/verification/reinitialiser.mjs.
 */
const nomDeBase = ((process.env.DATABASE_URL || "").split("?")[0].split("/").pop() || "").toLowerCase();
const decrire = nomDeBase.includes("test") ? describe : describe.skip;

const MOT_DE_PASSE = "Password123!";

async function viderLaBase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
      AND tablename <> 'PrivacyAuditEvent'
  `;
  if (tables.length === 0) return;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
}

const superowners = () => db.user.count({ where: { isSuperOwner: true } });

decrire("SEC-03 — superowner initial", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(viderLaBase);

  afterAll(async () => {
    await viderLaBase();
    await db.$disconnect();
  });

  describe("inscriptions", () => {
    it("deux inscriptions simultanées sur une base vide ne créent aucun superowner", async () => {
      const reponses = await Promise.all(
        ["un", "deux"].map((nom) =>
          request(app)
            .post("/api/auth/signup")
            .send({ email: `${nom}@exemple.fr`, name: `Compte ${nom}`, password: MOT_DE_PASSE, conditionsAcceptees: true })
        )
      );

      for (const reponse of reponses) {
        expect(reponse.status).toBe(201);
        // La réponse ne dit rien des droits d'administration : /auth/me les donne.
        expect(reponse.body.user.isSuperOwner).toBeUndefined();
        expect(reponse.body.user.isSystemAdmin).toBeUndefined();
      }
      expect(await superowners()).toBe(0);
      expect(await db.user.count({ where: { isSystemAdmin: true } })).toBe(0);
    });

    it("deux inscriptions commerçant simultanées ne créent ni superowner ni commerce validé", async () => {
      const reponses = await Promise.all(
        ["un", "deux"].map((nom) =>
          request(app).post("/api/auth/merchant-register").send({
            email: `commerce-${nom}@exemple.fr`,
            password: MOT_DE_PASSE,
            businessName: `Restaurant ${nom}`,
            businessType: "restaurant",
            address: "1 rue de la Paix",
            city: "Paris",
            postalCode: "75001",
            phone: "0600000000",
            description: "Cuisine maison",
            storeName: `Restaurant ${nom}`,
            storeSlug: `restaurant-${nom}`,
            conditionsAcceptees: true,
          })
        )
      );

      for (const reponse of reponses) {
        expect(reponse.status).toBe(201);
        expect(reponse.body.user.isSuperOwner).toBe(false);
        expect(reponse.body.user.isSystemAdmin).toBe(false);
      }
      expect(await superowners()).toBe(0);
      // La plateforme validait d'office le commerce du premier inscrit.
      expect(await db.organization.count({ where: { approvedAt: { not: null } } })).toBe(0);
    });
  });

  describe("create-superowner", () => {
    it("crée exactement un superowner, et se rejoue sans effet", async () => {
      const premier = await creerSuperownerInitial({ email: "Boss@Exemple.fr", password: "Solide123" });
      expect(premier.statut).toBe("cree");
      expect(premier.email).toBe("boss@exemple.fr");

      const compte = await db.user.findUnique({ where: { email: "boss@exemple.fr" }, include: { customer: true } });
      expect(compte?.isSuperOwner).toBe(true);
      expect(compte?.isSystemAdmin).toBe(true);
      expect(compte?.customer).not.toBeNull();

      const second = await creerSuperownerInitial({ email: "boss@exemple.fr", password: "Solide123" });
      expect(second).toEqual({ statut: "existant", userId: premier.userId, email: "boss@exemple.fr" });

      // Même avec une autre adresse : un superowner existe, rien ne bouge.
      const autre = await creerSuperownerInitial({ email: "autre@exemple.fr", password: "Solide123" });
      expect(autre.statut).toBe("existant");
      expect(await db.user.findUnique({ where: { email: "autre@exemple.fr" } })).toBeNull();

      expect(await superowners()).toBe(1);
      expect(await db.user.count()).toBe(1);
    });

    it("des exécutions simultanées ne créent qu'un superowner", async () => {
      const resultats = await Promise.all(
        [1, 2, 3, 4].map((n) => creerSuperownerInitial({ email: `boss${n}@exemple.fr`, password: "Solide123" }))
      );

      expect(await superowners()).toBe(1);
      const gagnant = await db.user.findFirst({ where: { isSuperOwner: true } });
      for (const r of resultats) expect(r.userId).toBe(gagnant?.id);
    });

    it("promeut un compte déjà inscrit sans toucher à son mot de passe", async () => {
      await request(app)
        .post("/api/auth/signup")
        .send({ email: "boss@exemple.fr", name: "Boss", password: MOT_DE_PASSE, conditionsAcceptees: true });
      const avant = await db.user.findUniqueOrThrow({ where: { email: "boss@exemple.fr" } });

      const resultat = await creerSuperownerInitial({ email: "boss@exemple.fr", password: "Autre1234" });

      expect(resultat.statut).toBe("promu");
      const apres = await db.user.findUniqueOrThrow({ where: { email: "boss@exemple.fr" } });
      expect(apres.isSuperOwner).toBe(true);
      expect(apres.emailVerified).toBe(true);
      expect(apres.passwordHash).toBe(avant.passwordHash);
    });

    it("accepte une empreinte bcrypt plutôt qu'un mot de passe", async () => {
      const passwordHash = "$2b$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz01234";
      await creerSuperownerInitial({ email: "boss@exemple.fr", passwordHash });

      const compte = await db.user.findUniqueOrThrow({ where: { email: "boss@exemple.fr" } });
      expect(compte.passwordHash).toBe(passwordHash);
    });

    it("refuse une configuration incomplète ou faible, sans rien créer", async () => {
      await expect(creerSuperownerInitial({})).rejects.toBeInstanceOf(ConfigurationSuperownerInvalide);
      await expect(creerSuperownerInitial({ email: "boss@exemple.fr" })).rejects.toBeInstanceOf(
        ConfigurationSuperownerInvalide
      );
      await expect(creerSuperownerInitial({ email: "boss@exemple.fr", password: "faible" })).rejects.toBeInstanceOf(
        ConfigurationSuperownerInvalide
      );
      await expect(
        creerSuperownerInitial({ email: "boss@exemple.fr", passwordHash: "pas-une-empreinte" })
      ).rejects.toBeInstanceOf(ConfigurationSuperownerInvalide);
      await expect(
        creerSuperownerInitial({ email: "boss@exemple.fr", password: "Solide123", passwordHash: "$2b$10$x" })
      ).rejects.toBeInstanceOf(ConfigurationSuperownerInvalide);

      expect(await db.user.count()).toBe(0);
    });

    it("la base refuse un second superowner", async () => {
      await creerSuperownerInitial({ email: "boss@exemple.fr", password: "Solide123" });
      await request(app)
        .post("/api/auth/signup")
        .send({ email: "autre@exemple.fr", name: "Autre", password: MOT_DE_PASSE, conditionsAcceptees: true });

      await expect(
        db.user.update({ where: { email: "autre@exemple.fr" }, data: { isSuperOwner: true } })
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });
  describe("invitation par lien", () => {
    it("crée le compte sans mot de passe connu et le lien permet d'en choisir un", async () => {
      const resultat = await creerSuperownerInitial({ email: "noreply@zupone.com", invitation: true });
      expect(resultat.statut).toBe("cree");
      const jeton = resultat.statut === "cree" ? resultat.jeton : undefined;
      expect(jeton).toBeDefined();

      const reponse = await request(app)
        .post("/api/auth/reset-password")
        .send({ jeton, password: MOT_DE_PASSE });
      expect(reponse.status).toBe(200);

      const connexion = await request(app)
        .post("/api/auth/login")
        .send({ email: "noreply@zupone.com", password: MOT_DE_PASSE });
      expect(connexion.status).toBe(200);
      expect(await superowners()).toBe(1);
    });

    it("ne réémet rien quand un superowner existe déjà", async () => {
      await creerSuperownerInitial({ email: "noreply@zupone.com", invitation: true });
      const encore = await creerSuperownerInitial({ email: "noreply@zupone.com", invitation: true });
      expect(encore.statut).toBe("existant");
    });
  });
});
