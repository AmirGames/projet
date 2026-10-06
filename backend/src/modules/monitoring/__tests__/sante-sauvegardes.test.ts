import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  backup: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
  systemConfig: { findFirst: jest.fn() },
  orderDelivery: { count: jest.fn() },
  webhookDelivery: { count: jest.fn() },
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
