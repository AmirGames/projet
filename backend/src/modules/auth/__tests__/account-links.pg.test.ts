import { afterAll, afterEach, describe, expect, it, jest } from "@jest/globals";
import { db } from "../../../services/db";
import { AuthMotDePasseService } from "../auth-motdepasse.service";
import { AuthConfirmationService } from "../auth-confirmation.service";
import { AuthService } from "../auth.service";
import { AccountTokenService } from "../account-token.service";
import { SecurityEventService } from "../security-event.service";

const pg = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.includes("test")
  ? describe : describe.skip;
const prefix = `liens-a10-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ids: string[] = [];

async function compte(nom: string, lien: "reset" | "email") {
  const token = AccountTokenService.emettre(60_000);
  const email = `${prefix}-${nom}@example.test`;
  const user = await db.user.create({
    data: {
      email, passwordHash: await AuthService.hashPassword("Ancien123!"), emailVerified: lien === "reset",
      ...(lien === "reset"
        ? { resetTokenHash: token.empreinte, resetTokenExpiresAt: token.expireLe }
        : { emailTokenHash: token.empreinte, emailTokenExpiresAt: token.expireLe }),
    },
  });
  ids.push(user.id);
  return { user, token };
}

pg("A10 — liens à usage unique sur PostgreSQL", () => {
  afterEach(() => { jest.restoreAllMocks(); });
  afterAll(async () => {
    await db.customer.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("deux resets concurrents : un seul mot de passe gagne, sessions révoquées", async () => {
    const { user, token } = await compte("reset-concurrent", "reset");
    await db.sessionConnexion.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
    jest.spyOn(SecurityEventService, "record").mockResolvedValue(undefined as never);
    const results = await Promise.allSettled([
      AuthMotDePasseService.reinitialiser(token.jeton, "Premier123!"),
      AuthMotDePasseService.reinitialiser(token.jeton, "Second123!"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const actuel = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    const gagnant = results[0].status === "fulfilled" ? "Premier123!" : "Second123!";
    expect(await AuthService.comparePassword(gagnant, actuel.passwordHash)).toBe(true);
    expect(actuel.resetTokenHash).toBeNull();
    expect(await db.sessionConnexion.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("deux confirmations concurrentes : un seul rattachement gagne", async () => {
    const { user, token } = await compte("confirm-concurrent", "email");
    const fiche = await db.customer.create({ data: { email: user.email, name: "Invité" } });
    const results = await Promise.allSettled([
      AuthConfirmationService.verifier(token.jeton), AuthConfirmationService.verifier(token.jeton),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await db.customer.findUniqueOrThrow({ where: { id: fiche.id } })).userId).toBe(user.id);
  });

  it("lien réémis et expiration au moment de l'écriture refusés", async () => {
    const { user, token } = await compte("reemis", "email");
    const neuf = AccountTokenService.emettre(60_000);
    await db.user.update({ where: { id: user.id }, data: { emailTokenHash: neuf.empreinte, emailTokenExpiresAt: neuf.expireLe } });
    await expect(AuthConfirmationService.verifier(token.jeton)).rejects.toMatchObject({ code: "INVALID_EMAIL_TOKEN" });
    await db.user.update({ where: { id: user.id }, data: { emailTokenExpiresAt: new Date(Date.now() - 1) } });
    await expect(AuthConfirmationService.verifier(neuf.jeton)).rejects.toMatchObject({ code: "EXPIRED_EMAIL_TOKEN" });
  });

  it("reset réémis ou expiré pendant le calcul du hash : aucune session révoquée", async () => {
    const { user, token } = await compte("reset-reemis", "reset");
    const neuf = AccountTokenService.emettre(60_000);
    await db.user.update({ where: { id: user.id }, data: { resetTokenHash: neuf.empreinte, resetTokenExpiresAt: neuf.expireLe } });
    await expect(AuthMotDePasseService.reinitialiser(token.jeton, "Premier123!"))
      .rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    const hashOriginal = AuthService.hashPassword;
    jest.spyOn(AuthService, "hashPassword").mockImplementationOnce(async (password) => {
      await db.user.update({ where: { id: user.id }, data: { resetTokenExpiresAt: new Date(Date.now() - 1) } });
      return hashOriginal(password);
    });
    await expect(AuthMotDePasseService.reinitialiser(neuf.jeton, "Second123!"))
      .rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    const actuel = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(actuel.resetTokenHash).toBe(neuf.empreinte);
    expect(await AuthService.comparePassword("Ancien123!", actuel.passwordHash)).toBe(true);
  });

  it("erreur après consommation : rollback, lien réutilisable et fiche non liée", async () => {
    const { user, token } = await compte("rollback", "email");
    const fiche = await db.customer.create({ data: { email: user.email, name: "Invité" } });
    // Une contrainte temporaire force une erreur PostgreSQL après la première
    // écriture (User), au moment de rattacher Customer dans la même transaction.
    await db.$executeRawUnsafe(`ALTER TABLE "Customer" ADD CONSTRAINT "a10_rollback_test" CHECK ("email" NOT LIKE '%-rollback@example.test' OR "userId" IS NULL)`);
    try {
      await expect(AuthConfirmationService.verifier(token.jeton)).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "Customer" DROP CONSTRAINT "a10_rollback_test"`);
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailTokenHash).toBe(token.empreinte);
    expect((await db.customer.findUniqueOrThrow({ where: { id: fiche.id } })).userId).toBeNull();
    await AuthConfirmationService.verifier(token.jeton);
    expect((await db.customer.findUniqueOrThrow({ where: { id: fiche.id } })).userId).toBe(user.id);
  });
});
