import { createServer } from "node:http";

/**
 * Faux service de recherche d'adresses.
 *
 * Les fournisseurs réels sont sur Internet : les appeler depuis une
 * vérification la rendrait lente, dépendante d'un tiers, et impossible à
 * jouer hors ligne. Ce serveur rend les deux formats attendus — celui de la
 * Base Adresse Nationale et celui de Photon — pour vérifier que chacun est
 * correctement interprété.
 */

/** Réponse au format Base Adresse Nationale : France, libellé tout fait. */
const REPONSE_BAN = {
  features: [
    {
      properties: {
        label: "20 Rue de la République 69002 Lyon",
        name: "20 Rue de la République",
        city: "Lyon",
        postcode: "69002",
      },
      geometry: { coordinates: [4.8357, 45.764] },
    },
  ],
};

/** Réponse au format Photon : numéro séparé de la voie, pays fourni. */
const REPONSE_PHOTON = {
  features: [
    {
      properties: {
        housenumber: "12",
        street: "Rue Neuve",
        city: "Bruxelles",
        postcode: "1000",
        country: "Belgique",
        countrycode: "BE",
      },
      geometry: { coordinates: [4.3517, 50.8503] },
    },
    {
      properties: {
        housenumber: "5",
        street: "Bahnhofstrasse",
        city: "Zurich",
        postcode: "8001",
        country: "Suisse",
        countrycode: "CH",
      },
      geometry: { coordinates: [8.5417, 47.3769] },
    },
    {
      properties: {
        housenumber: "1",
        street: "Rue de Rivoli",
        city: "Paris",
        postcode: "75001",
        country: "France",
        countrycode: "FR",
      },
      geometry: { coordinates: [2.3522, 48.8566] },
    },
  ],
};

export async function ouvrirFauxServiceAdresses(port = 4599) {
  const appels = [];
  let enPanne = false;

  const serveur = createServer((requete, reponse) => {
    appels.push(requete.url || "");

    if (enPanne) {
      reponse.writeHead(503).end("Service indisponible");
      return;
    }

    const format = (requete.url || "").includes("/photon") ? REPONSE_PHOTON : REPONSE_BAN;

    reponse.writeHead(200, { "Content-Type": "application/json" });
    reponse.end(JSON.stringify(format));
  });

  await new Promise((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(port, "127.0.0.1", resoudre);
  });

  return {
    urlBan: `http://127.0.0.1:${port}/ban/`,
    urlPhoton: `http://127.0.0.1:${port}/photon/`,
    appels,

    /** Simule une panne du fournisseur, pour vérifier le repli. */
    tomberEnPanne(valeur = true) {
      enPanne = valeur;
    },

    vider() {
      appels.length = 0;
    },

    async fermer() {
      await new Promise((resoudre) => serveur.close(resoudre));
    },
  };
}
