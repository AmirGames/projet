import crypto from "crypto";
import { afterAll, describe, expect, it, jest } from "@jest/globals";
import { db } from "../../../services/db";
import { AuthService } from "../auth.service";
import { SsoService } from "../sso.service";

const pg = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.toLowerCase().includes("test")
  ? describe : describe.skip;
const prefix = `a09-refresh-${Date.now()}-${Math.random().toString(36).slice(2)}`;

pg("A09 — rotation atomique PostgreSQL", () => {
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("deux rotations identiques produisent un seul successeur et la reprise réseau le restitue", async () => {
    const user = await db.user.create({ data: { email: `${prefix}@example.test`, passwordHash: await AuthService.hashPassword("TestPass123!") } });
    const { sid, refreshToken } = await SsoService.connecter(user.id);
    const results = await Promise.all([
      SsoService.renouveler(refreshToken, "a09-requete-idempotente-0001"),
      SsoService.renouveler(refreshToken, "a09-requete-idempotente-0001"),
    ]);
    expect(results[0].refreshToken).toBe(results[1].refreshToken);
    expect(await db.jetonRafraichissement.count({ where: { sessionId: sid, usedAt: null } })).toBe(1);
    expect((await SsoService.renouveler(refreshToken, "a09-requete-idempotente-0001")).refreshToken).toBe(results[0].refreshToken);
    await expect(SsoService.renouveler(refreshToken, "a09-autre-cle-00000000001")).rejects.toMatchObject({ code: "SESSION_INVALIDE" });
  });

  it("une erreur à la création du successeur restaure la consommation du parent", async () => {
    const user = await db.user.create({ data: { email: `${prefix}-rollback@example.test`, passwordHash: await AuthService.hashPassword("TestPass123!") } });
    const { sid, refreshToken } = await SsoService.connecter(user.id);
    const parent = await db.jetonRafraichissement.findUniqueOrThrow({ where: { jtiHash: crypto.createHash("sha256").update(AuthService.verifyRefreshToken(refreshToken).jti!).digest("hex") } });
    const transaction = db.$transaction.bind(db);
    const transactionSpy = jest.spyOn(db, "$transaction").mockImplementationOnce(async (operation: any, options: any) =>
      transaction((tx: any) => operation(Object.assign(Object.create(tx), {
        jetonRafraichissement: Object.assign(Object.create(tx.jetonRafraichissement), {
          create: async () => { throw new Error("A09_FAIL_AFTER_CONSUME"); },
        }),
      })), options)
    );
    await expect(SsoService.renouveler(refreshToken, "a09-requete-rollback-0001")).rejects.toThrow("A09_FAIL_AFTER_CONSUME");
    transactionSpy.mockRestore();
    const apres = await db.jetonRafraichissement.findUniqueOrThrow({ where: { id: parent.id } });
    expect(apres.usedAt).toBeNull();
    expect(apres.successeurJti).toBeNull();
    expect(await db.jetonRafraichissement.count({ where: { sessionId: sid, usedAt: null } })).toBe(1);
  });
});
