import type { Request } from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// Chaque test touche uniquement ses comptes et organisations, sur une base de test.
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../legal/pages-legales.service", () => ({
  PagesLegalesService: { versionsDe: jest.fn(async () => "cgu@v1 cgv@v1 confidentialite@v1 conditions-commercants@v1 conditions-livreurs@v1") },
}));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmailVerification: jest.fn() } }));

import { db } from "../../../services/db";
import { AuthInscriptionService } from "../auth-inscription.service";
import { AuthService } from "../auth.service";
import { SsoService } from "../sso.service";
import { DriverAccountService } from "../../drivers/driver-account.service";
import { StoreService } from "../../stores/store.service";
import { Outbox } from "../../jobs/outbox.service";

const decrire = new URL(process.env.DATABASE_URL!).pathname.toLowerCase().includes("test") ? describe : describe.skip;
const prefixe = `audit-inscr-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const req = { ip: "127.0.0.1", get: () => "audit-inscriptions" } as unknown as Request;
const ancienEnv = { ...process.env };
const erreur = new Error("Erreur injectée après écriture");
const commerce = (nom: string) => ({
  email: `${prefixe}-${nom}@example.test`, password: "MotDePasse123!", businessName: "Commerce test",
  storeName: "Boutique test", storeSlug: `${prefixe}-${nom}`, businessType: "restaurant", phone: "+32470000001",
  address: "1 rue test", postalCode: "5000", city: "Namur", description: "Test", latitude: 50.46, longitude: 4.86,
});
const client = (nom: string) => ({ email: `${prefixe}-${nom}@example.test`, name: "Client test", password: "MotDePasse123!" });
const livreur = (nom: string) => ({ ...client(nom), phone: "+32470000001", vehicleType: "bike" as const });

async function nettoyer() {
  const whereEmail = { email: { startsWith: prefixe } };
  const comptes = await db.user.findMany({ where: whereEmail, select: { id: true } });
  if (comptes.length) await db.outboxMessage.deleteMany({
    where: { type: "auth.confirmation_email", OR: comptes.map(({ id }) => ({ payload: { path: ["userId"], equals: id } })) },
  });
  await db.store.deleteMany({ where: { org: { slug: { startsWith: prefixe } } } });
  await db.organization.deleteMany({ where: { slug: { startsWith: prefixe } } });
  await db.courier.deleteMany({ where: whereEmail });
  await db.customer.deleteMany({ where: whereEmail });
  await db.acceptationConditions.deleteMany({ where: whereEmail });
  await db.user.deleteMany({ where: whereEmail });
}

decrire("A01/A02 — inscriptions atomiques sur PostgreSQL", () => {
  beforeEach(() => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.ENABLE_EMAIL_VERIFICATION = "true";
    jest.spyOn(SsoService, "connecter").mockResolvedValue({ accessToken: "interdit", refreshToken: "interdit" } as any);
    jest.spyOn(StoreService, "situer").mockResolvedValue({ latitude: 50.46, longitude: 4.86, countryCode: "BE" });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    process.env = { ...ancienEnv };
  });
  afterAll(async () => { await db.$disconnect(); });

  it.each(["client", "commercant", "livreur"] as const)("%s : compte, rôle, preuve et e-mail committés sans session", async (role) => {
    const body = commerce(role);
    const resultat = role === "client"
      ? await AuthInscriptionService.inscrireClient(req, client(role))
      : role === "commercant"
        ? await AuthInscriptionService.inscrireCommercant(req, body)
        : await DriverAccountService.inscrire(req, livreur(role));
    expect(resultat).toEqual({ aConfirmer: true });
    const compte = await db.user.findUniqueOrThrow({ where: { email: body.email } });
    expect(compte.emailVerified).toBe(false);
    expect(compte.isSuperOwner).toBe(false);
    expect(compte.isSystemAdmin).toBe(false);
    expect(await db.acceptationConditions.count({ where: { userId: compte.id } })).toBe(1);
    const message = await db.outboxMessage.findFirstOrThrow({ where: { payload: { path: ["userId"], equals: compte.id } } });
    expect(message.payload).toEqual({ userId: compte.id });
    expect(message.status).toBe("PENDING");
    expect(SsoService.connecter).not.toHaveBeenCalled();
    if (role === "client") expect(await db.customer.count({ where: { userId: compte.id } })).toBe(1);
    if (role === "livreur") expect(await db.courier.count({ where: { userId: compte.id } })).toBe(1);
    if (role === "commercant") {
      const org = await db.organization.findUniqueOrThrow({ where: { slug: body.storeSlug } });
      expect(org.approvedAt).toBeNull();
      expect(await db.membership.count({ where: { userId: compte.id, orgId: org.id } })).toBe(1);
      const boutique = await db.store.findFirstOrThrow({ where: { orgId: org.id } });
      expect(boutique.isOpen).toBe(false);
      expect(await db.taxSetting.count({ where: { storeId: boutique.id } })).toBe(3);
    }
  });

  it.each(["client", "commercant", "livreur"] as const)("%s : échec après l'outbox, aucune création partielle", async (role) => {
    const original = Outbox.enregistrer;
    let userId = "";
    jest.spyOn(Outbox, "enregistrer").mockImplementationOnce(async (...args) => {
      userId = (args[1] as { userId: string }).userId;
      await original.apply(Outbox, args);
      throw erreur;
    });
    const body = commerce(`echec-${role}`);
    const inscription = role === "client"
      ? AuthInscriptionService.inscrireClient(req, client(`echec-${role}`))
      : role === "commercant"
        ? AuthInscriptionService.inscrireCommercant(req, body)
        : DriverAccountService.inscrire(req, livreur(`echec-${role}`));
    await expect(inscription).rejects.toBe(erreur);
    expect(await db.user.count({ where: { email: body.email } })).toBe(0);
    expect(await db.acceptationConditions.count({ where: { email: body.email } })).toBe(0);
    expect(await db.customer.count({ where: { email: body.email } })).toBe(0);
    expect(await db.courier.count({ where: { email: body.email } })).toBe(0);
    expect(await db.organization.count({ where: { slug: body.storeSlug } })).toBe(0);
    expect(await db.outboxMessage.count({ where: { payload: { path: ["userId"], equals: userId } } })).toBe(0);
    expect(SsoService.connecter).not.toHaveBeenCalled();
  });

  it("échec après la boutique et ses taxes : rollback du compte, de l'organisation et des accès", async () => {
    const original = StoreService.create;
    jest.spyOn(StoreService, "create").mockImplementationOnce(async (...args) => {
      await original.apply(StoreService, args);
      throw erreur;
    });
    const body = commerce("boutique-echec");
    await expect(AuthInscriptionService.inscrireCommercant(req, body)).rejects.toBe(erreur);
    expect(await db.user.count({ where: { email: body.email } })).toBe(0);
    expect(await db.organization.count({ where: { slug: body.storeSlug } })).toBe(0);
    expect(await db.store.count({ where: { slug: body.storeSlug } })).toBe(0);
  });

  it("un compte existant ouvrant un commerce conserve son compte, sans organisation partielle", async () => {
    const body = commerce("devenir-echec");
    const compte = await db.user.create({ data: { email: body.email, emailVerified: true, passwordHash: await AuthService.hashPassword(body.password) } });
    const original = StoreService.create;
    jest.spyOn(StoreService, "create").mockImplementationOnce(async (...args) => {
      await original.apply(StoreService, args);
      throw erreur;
    });
    await expect(AuthInscriptionService.devenirCommercant(compte.id, body)).rejects.toBe(erreur);
    expect(await db.user.count({ where: { id: compte.id } })).toBe(1);
    expect(await db.organization.count({ where: { slug: body.storeSlug } })).toBe(0);
    expect(await db.membership.count({ where: { userId: compte.id } })).toBe(0);
  });

  it.each(["client", "commercant", "livreur"] as const)("%s : deux demandes simultanées, un seul compte et un seul rôle", async (role) => {
    const nom = `concurrent-${role}`;
    const inscrire = () => role === "client"
      ? AuthInscriptionService.inscrireClient(req, client(nom))
      : role === "commercant"
        ? AuthInscriptionService.inscrireCommercant(req, commerce(nom))
        : DriverAccountService.inscrire(req, livreur(nom));
    expect(await Promise.all([inscrire(), inscrire()])).toEqual([{ aConfirmer: true }, { aConfirmer: true }]);
    const email = client(nom).email;
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect(await db.acceptationConditions.count({ where: { email } })).toBe(1);
    if (role === "client") expect(await db.customer.count({ where: { email } })).toBe(1);
    if (role === "livreur") expect(await db.courier.count({ where: { email } })).toBe(1);
    if (role === "commercant") expect(await db.organization.count({ where: { slug: commerce(nom).storeSlug } })).toBe(1);
  });
});
