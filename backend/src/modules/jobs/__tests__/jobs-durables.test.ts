import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from "../../../services/db";
import { prendreLeBail, rendreLeBail } from "../leader.service";
import { Outbox, delaiAvantRelance } from "../outbox.service";

/**
 * Contre la vraie base : l'atomicité (deux instances, deux workers) ne se
 * prouve pas avec des mocks.
 */

const MINUTE = 60_000;

describe("bail du leader des tâches de fond", () => {
  beforeEach(async () => {
    await db.jobLease.deleteMany();
  });

  it("deux instances qui se présentent en même temps : une seule devient leader", async () => {
    const resultats = await Promise.all(["A", "B", "C", "D"].map((nom) => prendreLeBail(nom, 30_000)));
    expect(resultats.filter(Boolean)).toHaveLength(1);
  });

  it("le leader renouvelle son bail, les autres attendent", async () => {
    expect(await prendreLeBail("A")).toBe(true);
    expect(await prendreLeBail("B")).toBe(false);
    expect(await prendreLeBail("A")).toBe(true);
  });

  it("un bail expiré (instance morte) est repris par une autre", async () => {
    const maintenant = new Date();
    expect(await prendreLeBail("A", 30_000, maintenant)).toBe(true);
    expect(await prendreLeBail("B", 30_000, new Date(maintenant.getTime() + 29_000))).toBe(false);
    expect(await prendreLeBail("B", 30_000, new Date(maintenant.getTime() + 31_000))).toBe(true);
    // L'ancien leader ne reprend pas la main tant que le bail de B est vivant.
    expect(await prendreLeBail("A", 30_000, new Date(maintenant.getTime() + 32_000))).toBe(false);
  });

  it("un arrêt propre rend le bail : une autre instance reprend sans attendre", async () => {
    await prendreLeBail("A");
    await rendreLeBail("A");
    expect(await prendreLeBail("B")).toBe(true);
  });

  it("rendre un bail qu'on ne détient pas ne retire rien au leader", async () => {
    await prendreLeBail("A");
    await rendreLeBail("B");
    expect(await prendreLeBail("B")).toBe(false);
  });
});

describe("outbox", () => {
  beforeEach(async () => {
    await db.outboxMessage.deleteMany({ where: { type: { startsWith: "test." } } });
  });
  afterAll(async () => {
    await db.outboxMessage.deleteMany({ where: { type: { startsWith: "test." } } });
  });

  const lire = (id: string) => db.outboxMessage.findUniqueOrThrow({ where: { id } });

  it("la même clé de dédoublonnage n'enregistre qu'un message", async () => {
    const premier = await Outbox.enregistrer("test.mail", { a: 1 }, { dedupeKey: "test-cle-1" });
    const second = await Outbox.enregistrer("test.mail", { a: 1 }, { dedupeKey: "test-cle-1" });
    expect(premier).not.toBeNull();
    expect(second).toBeNull();
    await db.outboxMessage.deleteMany({ where: { dedupeKey: "test-cle-1" } });
  });

  it("envoie un message dû et le marque terminé", async () => {
    const recu: unknown[] = [];
    Outbox.declarer("test.mail", async (payload) => { recu.push(payload); });
    const msg = await Outbox.enregistrer("test.mail", { to: "a@x.be" });

    await Outbox.traiterLesDus();

    expect(recu).toContainEqual({ to: "a@x.be" });
    const apres = await lire(msg!.id);
    expect(apres.status).toBe("DONE");
    expect(apres.attempts).toBe(1);
  });

  it("un échec est rejoué plus tard, avec un délai croissant, puis réussit", async () => {
    let appels = 0;
    Outbox.declarer("test.mail", async () => {
      appels += 1;
      if (appels === 1) throw new Error("SMTP indisponible");
    });
    const msg = await Outbox.enregistrer("test.mail", {});
    const t0 = new Date();

    await Outbox.traiterLesDus(20, () => t0);
    const apresEchec = await lire(msg!.id);
    expect(apresEchec.status).toBe("PENDING");
    expect(apresEchec.lastError).toBe("SMTP indisponible");
    expect(apresEchec.nextAttemptAt.getTime()).toBeGreaterThan(t0.getTime());

    // Pas encore dû : rien ne repart.
    await Outbox.traiterLesDus(20, () => t0);
    expect(appels).toBe(1);

    // Une fois le délai passé, le message repart et aboutit.
    await Outbox.traiterLesDus(20, () => new Date(t0.getTime() + 2 * MINUTE));
    expect(appels).toBe(2);
    expect((await lire(msg!.id)).status).toBe("DONE");
  });

  it("abandonne après le nombre maximal de tentatives, et le garde visible", async () => {
    Outbox.declarer("test.mail", async () => { throw new Error("toujours en panne"); });
    const msg = await Outbox.enregistrer("test.mail", {}, { maxAttempts: 2 });
    let t = new Date();

    await Outbox.traiterLesDus(20, () => t);
    t = new Date(t.getTime() + 10 * MINUTE);
    await Outbox.traiterLesDus(20, () => t);

    const final = await lire(msg!.id);
    expect(final.status).toBe("FAILED");
    expect(final.attempts).toBe(2);
    expect((await Outbox.etat()).echecs).toBeGreaterThanOrEqual(1);
  });

  it("un type sans gestionnaire est abandonné, pas rejoué à l'infini", async () => {
    const msg = await Outbox.enregistrer("test.inconnu", {});
    await Outbox.traiterLesDus();
    expect((await lire(msg!.id)).status).toBe("FAILED");
  });

  it("deux workers en même temps n'envoient le message qu'une fois", async () => {
    let envois = 0;
    Outbox.declarer("test.mail", async () => {
      envois += 1;
      await new Promise((r) => setTimeout(r, 50));
    });
    await Outbox.enregistrer("test.mail", { n: 1 });

    await Promise.all([Outbox.traiterLesDus(), Outbox.traiterLesDus(), Outbox.traiterLesDus()]);

    expect(envois).toBe(1);
  });

  it("reprend le message d'un worker disparu en cours de traitement", async () => {
    const recu: unknown[] = [];
    Outbox.declarer("test.mail", async (p) => { recu.push(p); });
    const msg = await Outbox.enregistrer("test.mail", { reprise: true });
    // Le worker a pris le message puis est mort : bail de traitement dépassé.
    await db.outboxMessage.update({
      where: { id: msg!.id },
      data: { status: "PROCESSING", attempts: 1, lockedUntil: new Date(Date.now() - MINUTE) },
    });

    await Outbox.traiterLesDus();

    expect(recu).toContainEqual({ reprise: true });
    expect((await lire(msg!.id)).status).toBe("DONE");
  });

  it("un message en cours de traitement par un worker vivant n'est pas repris", async () => {
    const recu: unknown[] = [];
    Outbox.declarer("test.mail", async (p) => { recu.push(p); });
    const msg = await Outbox.enregistrer("test.mail", {});
    await db.outboxMessage.update({
      where: { id: msg!.id },
      data: { status: "PROCESSING", attempts: 1, lockedUntil: new Date(Date.now() + MINUTE) },
    });

    await Outbox.traiterLesDus();

    expect(recu).toHaveLength(0);
    expect((await lire(msg!.id)).status).toBe("PROCESSING");
  });

  it("le délai de relance double puis plafonne à une heure", () => {
    expect(delaiAvantRelance(1)).toBe(30_000);
    expect(delaiAvantRelance(2)).toBe(60_000);
    expect(delaiAvantRelance(3)).toBe(120_000);
    expect(delaiAvantRelance(20)).toBe(60 * MINUTE);
  });

  it("la purge supprime les messages terminés anciens, jamais les échecs", async () => {
    const vieux = new Date(Date.now() - 10 * 24 * 60 * MINUTE);
    const termine = await db.outboxMessage.create({ data: { type: "test.mail", payload: {}, status: "DONE", processedAt: vieux } });
    const echec = await db.outboxMessage.create({ data: { type: "test.mail", payload: {}, status: "FAILED", processedAt: vieux } });

    await Outbox.purger();

    expect(await db.outboxMessage.findUnique({ where: { id: termine.id } })).toBeNull();
    expect(await db.outboxMessage.findUnique({ where: { id: echec.id } })).not.toBeNull();
  });
});
