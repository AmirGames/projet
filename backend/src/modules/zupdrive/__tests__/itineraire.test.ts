import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

/**
 * ZupDrive — l'itinéraire d'un devis : OSRM quand il répond, l'estimation
 * sinon. Un faux serveur OSRM local joue les réponses.
 */

jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { calculerItineraire, estimer, DELAI_FOURNISSEUR_MS } from "../itineraire.service";

const DEPART = { latitude: 50.4632, longitude: 4.8665 };
const ARRIVEE = { latitude: 50.4555, longitude: 4.8759 };

let reponse: { statut: number; corps: unknown; delaiMs?: number } = { statut: 200, corps: {} };
let derniereUrl = "";
let serveur: Server;

beforeAll(async () => {
  serveur = createServer((req, res) => {
    derniereUrl = req.url || "";
    setTimeout(() => {
      res.writeHead(reponse.statut, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reponse.corps));
    }, reponse.delaiMs ?? 0);
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  process.env.OSRM_API_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  serveur.closeAllConnections();
  await new Promise((ok) => serveur.close(ok));
});

afterEach(() => {
  delete process.env.ROUTING_PROVIDER;
});

const routeOsrm = {
  code: "Ok",
  routes: [
    {
      distance: 1834.6,
      duration: 312.4,
      geometry: { coordinates: [[4.8665, 50.4632], [4.87, 50.46], [4.8759, 50.4555]] },
    },
  ],
};

describe("itinéraire", () => {
  it("estime par défaut, sans service externe", async () => {
    const itineraire = await calculerItineraire(DEPART, ARRIVEE);
    expect(itineraire).toEqual(estimer(DEPART, ARRIVEE));
    expect(itineraire.source).toBe("estimation");
  });

  it("prend la route d'OSRM : distance, durée, tracé en [latitude, longitude]", async () => {
    process.env.ROUTING_PROVIDER = "osrm";
    reponse = { statut: 200, corps: routeOsrm };
    const itineraire = await calculerItineraire(DEPART, ARRIVEE);

    expect(derniereUrl).toBe("/route/v1/driving/4.8665,50.4632;4.8759,50.4555?overview=simplified&geometries=geojson");
    expect(itineraire).toEqual({
      distanceMetres: 1835,
      dureeSecondes: 312,
      trace: [[50.4632, 4.8665], [50.46, 4.87], [50.4555, 4.8759]],
      source: "osrm",
    });
  });

  it("revient à l'estimation si OSRM répond en erreur ou sans itinéraire", async () => {
    process.env.ROUTING_PROVIDER = "osrm";
    reponse = { statut: 500, corps: { message: "panne" } };
    expect((await calculerItineraire(DEPART, ARRIVEE)).source).toBe("estimation");

    reponse = { statut: 200, corps: { code: "NoRoute", routes: [] } };
    expect((await calculerItineraire(DEPART, ARRIVEE)).source).toBe("estimation");
  });

  it(
    "revient à l'estimation si OSRM tarde trop",
    async () => {
      process.env.ROUTING_PROVIDER = "osrm";
      reponse = { statut: 200, corps: routeOsrm, delaiMs: DELAI_FOURNISSEUR_MS + 500 };
      const debut = Date.now();
      const itineraire = await calculerItineraire(DEPART, ARRIVEE);
      expect(itineraire.source).toBe("estimation");
      expect(Date.now() - debut).toBeLessThan(DELAI_FOURNISSEUR_MS + 400);
    },
    DELAI_FOURNISSEUR_MS + 5000
  );
});
