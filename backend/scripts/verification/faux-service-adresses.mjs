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

/**
 * Réponse au format Google Places (New) : adresse découpée en composants
 * typés, coordonnées à part, et un masque de champs qu'on ignore ici.
 */
const REPONSE_GOOGLE = {
  places: [
    {
      formattedAddress: "20 Rue de la République, 69002 Lyon, France",
      displayName: { text: "20 Rue de la République" },
      location: { latitude: 45.764, longitude: 4.8357 },
      addressComponents: [
        { longText: "20", types: ["street_number"] },
        { longText: "Rue de la République", types: ["route"] },
        { longText: "Lyon", types: ["locality"] },
        { longText: "69002", types: ["postal_code"] },
        { longText: "France", types: ["country"] },
      ],
    },
    {
      formattedAddress: "12 Rue Neuve, 1000 Bruxelles, Belgique",
      displayName: { text: "12 Rue Neuve" },
      location: { latitude: 50.8503, longitude: 4.3517 },
      addressComponents: [
        { longText: "12", types: ["street_number"] },
        { longText: "Rue Neuve", types: ["route"] },
        { longText: "Bruxelles", types: ["locality"] },
        { longText: "1000", types: ["postal_code"] },
        { longText: "Belgique", types: ["country"] },
      ],
    },
    {
      formattedAddress: "5 Bahnhofstrasse, 8001 Zurich, Suisse",
      displayName: { text: "5 Bahnhofstrasse" },
      location: { latitude: 47.3769, longitude: 8.5417 },
      addressComponents: [
        { longText: "5", types: ["street_number"] },
        { longText: "Bahnhofstrasse", types: ["route"] },
        { longText: "Zurich", types: ["locality"] },
        { longText: "8001", types: ["postal_code"] },
        { longText: "Suisse", types: ["country"] },
      ],
    },
  ],
};

export async function ouvrirFauxServiceAdresses(port = 4599) {
  const appels = [];
  const clesRecues = [];
  let enPanne = false;

  const serveur = createServer((requete, reponse) => {
    const chemin = requete.url || "";
    appels.push(chemin);

    if (enPanne) {
      reponse.writeHead(503).end("Service indisponible");
      return;
    }

    // Google refuse une requête sans clé : le faux service le fait aussi, sans
    // quoi on ne saurait pas si la clé est bien transmise.
    if (chemin.includes("/google")) {
      if (!requete.headers["x-goog-api-key"]) {
        reponse.writeHead(403).end(JSON.stringify({ error: { message: "API key manquante" } }));
        return;
      }

      clesRecues.push(String(requete.headers["x-goog-api-key"]));

      reponse.writeHead(200, { "Content-Type": "application/json" });
      reponse.end(JSON.stringify(REPONSE_GOOGLE));
      return;
    }

    const format = chemin.includes("/photon") ? REPONSE_PHOTON : REPONSE_BAN;

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
    urlGoogle: `http://127.0.0.1:${port}/google`,
    appels,
    /** Les clés reçues : de quoi vérifier qu'elle part bien, et laquelle. */
    clesRecues,

    /** Simule une panne du fournisseur, pour vérifier le repli. */
    tomberEnPanne(valeur = true) {
      enPanne = valeur;
    },

    vider() {
      appels.length = 0;
      clesRecues.length = 0;
    },

    async fermer() {
      await new Promise((resoudre) => serveur.close(resoudre));
    },
  };
}

/**
 * Lancé directement, il reste en écoute : les vérifications navigateur ont
 * besoin d'un vrai serveur, l'API tournant dans un autre processus.
 *
 *   node scripts/verification/faux-service-adresses.mjs &
 *   ADDRESS_API_URL=http://127.0.0.1:4599/ban/ npm run dev
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = await ouvrirFauxServiceAdresses(Number(process.env.PORT_ADRESSES) || 4599);
  console.log(`Faux service d'adresses : ${service.urlBan}`);
}
