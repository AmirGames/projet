import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  backup: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
  systemConfig: { findFirst: jest.fn() },
  orderDelivery: { count: jest.fn() },
  webhookDelivery: { count: jest.fn() },
  outboxMessage: { count: jest.fn(), findFirst: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../backup.service", () => ({ PREFIXE_SAUVEGARDE_COMPLETE: "base-" }));

import { SystemHealthService } from "../system-health.service";

const JOUR = 24 * 60 * 60 * 1000;

async function controleSauvegardes() {
  const { controles } = await SystemHealthService.etat();
  return controles.find((c) => c.cle === "sauvegardes")!;
}

describe("contrôle de santé « Sauvegardes »", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    db.orderDelivery.count.mockResolvedValue(0);
    db.webhookDelivery.count.mockResolvedValue(0);
    db.outboxMessage.count.mockResolvedValue(0);
    db.outboxMessage.findFirst.mockResolvedValue(null);
  });

  it("ne cherche que les vraies sauvegardes, jamais l'export partiel", async () => {
    db.backup.findFirst.mockResolvedValue(null);

    const controle = await controleSauvegardes();

    expect(db.backup.findFirst.mock.calls[0][0].where).toEqual({ status: "COMPLETED", name: { startsWith: "base-" } });
    expect(controle.etat).toBe("PANNE");
    expect(controle.detail).toMatch(/complète/);
  });

  it("est au vert avec une sauvegarde complète de la nuit", async () => {
    db.backup.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 3600_000) });
    expect((await controleSauvegardes()).etat).toBe("OK");
  });

  it("se dégrade quand la sauvegarde nocturne ne passe plus", async () => {
    db.backup.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5 * JOUR) });
    const controle = await controleSauvegardes();
    expect(controle.etat).not.toBe("OK");
    expect(controle.remede).toMatch(/sauvegardes\.log/);
  });
});

describe("contrôle de santé « Notifications » (outbox)", () => {
  const MINUTE = 60_000;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    db.backup.findFirst.mockResolvedValue({ createdAt: new Date() });
    db.orderDelivery.count.mockResolvedValue(0);
    db.webhookDelivery.count.mockResolvedValue(0);
    db.outboxMessage.count.mockResolvedValue(0);
    db.outboxMessage.findFirst.mockResolvedValue(null);
  });

  async function notifications() {
    const { controles, score } = await SystemHealthService.etat();
    return { controle: controles.find((c) => c.cle === "notifications")!, score, controles };
  }

  it("est au vert quand rien n'attend ni n'a été abandonné", async () => {
    const { controle } = await notifications();
    expect(controle.etat).toBe("OK");
  });

  it("se dégrade quand un message attend depuis plus de cinq minutes", async () => {
    db.outboxMessage.findFirst.mockResolvedValue({ nextAttemptAt: new Date(Date.now() - 20 * MINUTE) });
    const { controle } = await notifications();
    expect(controle.score).toBe(0.5);
    expect(controle.detail).toMatch(/attend depuis/);
  });

  it("tombe à zéro après une heure de retard : le worker ne tourne plus", async () => {
    db.outboxMessage.findFirst.mockResolvedValue({ nextAttemptAt: new Date(Date.now() - 2 * 60 * MINUTE) });
    expect((await notifications()).controle.score).toBe(0);
  });

  it("signale un message abandonné même sans retard", async () => {
    // Premier count : en attente ; second : abandonnés des 7 derniers jours.
    db.outboxMessage.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(2);
    const { controle } = await notifications();
    expect(controle.score).toBeLessThanOrEqual(0.5);
    expect(controle.detail).toMatch(/abandonn/);
  });

  it("les poids des contrôles totalisent toujours 100", async () => {
    const { controles } = await notifications();
    expect(controles.reduce((somme, c) => somme + c.poids, 0)).toBe(100);
  });
});
