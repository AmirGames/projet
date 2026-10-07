import { describe, expect, it, jest } from "@jest/globals";
import { arretGracieux } from "../arret-gracieux";

function serveur() {
  let fin: (() => void) | undefined;
  return {
    close: jest.fn((cb?: () => void) => { fin = cb; }),
    closeIdleConnections: jest.fn(),
    closeAllConnections: jest.fn(),
    /** Simule la fin de la dernière requête en cours. */
    terminerLesRequetes: () => fin?.(),
  };
}

const journal = { info: jest.fn(), warn: jest.fn() };

describe("arrêt gracieux", () => {
  it("attend la fin des requêtes en cours avant de rendre le bail et de couper la base", async () => {
    const ordre: string[] = [];
    const srv = serveur();
    const arret = arretGracieux({
      serveur: srv as any,
      arreterLesTaches: () => ordre.push("taches"),
      arreterLeader: async () => { ordre.push("leader"); },
      deconnecterBase: async () => { ordre.push("base"); },
      journal,
      delaiMaxMs: 5_000,
    });

    // Une requête est encore en cours : ni le bail ni la base ne sont touchés.
    await new Promise((r) => setTimeout(r, 20));
    expect(ordre).toEqual(["taches"]);
    expect(srv.closeIdleConnections).toHaveBeenCalled();

    srv.terminerLesRequetes();
    expect(await arret).toEqual({ delaiDepasse: false });
    expect(ordre).toEqual(["taches", "leader", "base"]);
    expect(srv.closeAllConnections).not.toHaveBeenCalled();
  });

  it("passé le délai, ferme les connexions restantes puis termine quand même", async () => {
    const srv = serveur();
    const base = jest.fn(async () => undefined);
    const resultat = await arretGracieux({
      serveur: srv as any,
      arreterLesTaches: () => undefined,
      arreterLeader: async () => undefined,
      deconnecterBase: base,
      journal,
      delaiMaxMs: 30,
    });
    expect(resultat.delaiDepasse).toBe(true);
    expect(srv.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("une fermeture du temps réel qui échoue ne bloque pas l'arrêt", async () => {
    const srv = serveur();
    const promesse = arretGracieux({
      serveur: srv as any,
      fermerTempsReel: async () => { throw new Error("socket"); },
      arreterLesTaches: () => undefined,
      arreterLeader: async () => undefined,
      deconnecterBase: async () => undefined,
      journal,
      delaiMaxMs: 5_000,
    });
    setTimeout(() => srv.terminerLesRequetes(), 20);
    await expect(promesse).resolves.toEqual({ delaiDepasse: false });
    expect(journal.warn).toHaveBeenCalled();
  });
});
