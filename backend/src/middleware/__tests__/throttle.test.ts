import { describe, expect, it, jest } from "@jest/globals";
import { limiterCadence, limiterAuthParIp, limiterCourrielsParIp } from "../throttle";
import { StockageRedis } from "../throttle-stockage";

const passer = async (mw: any, ip = "1.1.1.1") => {
  const next = jest.fn();
  await mw({ ip, body: {} } as any, {} as any, next);
  return next.mock.calls[0]?.[0] as any;
};

describe("limiterCadence", () => {
  it.each([[limiterAuthParIp, 50], [limiterCourrielsParIp, 20]] as const)(
    'changer de destinataire ne contourne pas le budget IP (limite %s)', async (limiteur, max) => {
      const ip = `audit-${max}`;
      for (let i = 0; i < max; i++) {
        const next = jest.fn();
        await limiteur({ ip, body: { email: `adresse-${i}@example.invalid` } } as any, {} as any, next);
        expect(next.mock.calls[0]?.[0]).toBeUndefined();
      }
      expect((await passer(limiteur, ip)).statusCode).toBe(429);
      expect(await passer(limiteur, `${ip}-autre`)).toBeUndefined();
    });
  it("bloque au-delà du maximum (stockage mémoire)", async () => {
    const mw = limiterCadence({ max: 2, fenetreMs: 60000, cle: (r) => r.ip! });
    expect(await passer(mw)).toBeUndefined();
    expect(await passer(mw)).toBeUndefined();
    expect((await passer(mw)).statusCode).toBe(429);
    expect(await passer(mw, "2.2.2.2")).toBeUndefined();
  });

  it("compte dans le stockage partagé (Redis simulé)", async () => {
    const valeurs = new Map<string, number>();
    const client: any = {
      incr: jest.fn(async (k: string) => valeurs.set(k, (valeurs.get(k) ?? 0) + 1).get(k)),
      pExpire: jest.fn(async () => true),
      pTTL: jest.fn(async () => 30000),
    };
    const stockage = new StockageRedis(client);
    const a = limiterCadence({ max: 1, fenetreMs: 60000, cle: (r) => r.ip!, stockage });
    const b = limiterCadence({ max: 1, fenetreMs: 60000, cle: (r) => r.ip!, stockage });
    expect(await passer(a)).toBeUndefined();
    expect((await passer(a)).statusCode).toBe(429);
    // Un autre limiteur ne partage pas ce compteur.
    expect(await passer(b)).toBeUndefined();
    expect(client.pExpire).toHaveBeenCalledTimes(2);
  });

  it("retombe sur la mémoire si le stockage échoue", async () => {
    const stockage = { incrementer: jest.fn(async () => { throw new Error("down"); }) };
    const mw = limiterCadence({ max: 1, fenetreMs: 60000, cle: (r) => r.ip!, stockage: stockage as any });
    expect(await passer(mw)).toBeUndefined();
    expect((await passer(mw)).statusCode).toBe(429);
  });
});
