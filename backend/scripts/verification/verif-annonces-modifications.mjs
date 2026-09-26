/**
 * Le site en temps réel : chaque écriture réussie est annoncée aux écrans
 * concernés, et à eux seuls.
 *
 * Les écrans chargeaient leurs données une fois, à l'ouverture. Désormais,
 * après chaque écriture, le serveur pousse `donnees-modifiees` : à l'équipe du
 * commerçant, à la plateforme, aux visiteurs de la vitrine pour ce qui y est
 * public. Jamais à un autre commerçant.
 *
 * Avec plusieurs instances reliées par Redis, l'annonce doit traverser :
 * donner l'adresse d'une seconde instance dans VERIF_API_URL_2 fait écrire
 * sur la première et écouter sur la seconde.
 *
 *   DATABASE_URL=... VERIF_API_URL=http://localhost:3099 \
 *   [VERIF_API_URL_2=http://localhost:3098] \
 *     node scripts/verification/verif-annonces-modifications.mjs
 */

import { io } from "socket.io-client";

import { inscription, titre, check, j, uniq, post, del, terminer, API } from "./outils.mjs";

/** L'instance où l'on écoute : une autre que celle où l'on écrit, si on l'a. */
const ECOUTE = process.env.VERIF_API_URL_2 || API;

const pause = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));

/** Ouvre une connexion qui garde tout ce qu'elle reçoit. */
function brancher(jeton) {
  return new Promise((resoudre, rejeter) => {
    const socket = io(ECOUTE, {
      auth: jeton ? { token: jeton } : {},
      transports: ["websocket"],
      timeout: 5000,
    });

    socket.recus = [];
    socket.on("donnees-modifiees", (evenement) => socket.recus.push(evenement));
    socket.on("connect", () => resoudre(socket));
    socket.on("connect_error", (err) => rejeter(err));
  });
}

const derniere = (socket) => socket.recus.at(-1);

// ===== Le décor =====

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: "Password123!", name: `P ${uniq}` })
);
const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: "Password123!", name: `M ${uniq}` })
);
const voisin = await j(
  await inscription({ email: `v-${uniq}@t.fr`, password: "Password123!", name: `V ${uniq}` })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    "/api/stores",
    { orgId: commercant.organization.id, name: `Bistrot ${uniq}`, slug: `bistrot-${uniq}`, phone: "0400000000" },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const categorie = await j(await post("/api/categories", { storeId, name: `Plats ${uniq}` }, T));
const categorieId = categorie.category?.id || categorie.id;

// Le compte de la plateforme n'est superowner que s'il a été inscrit en
// premier sur une base vide.
const [cCommercant, cPlateforme, cVoisin, cVisiteur] = await Promise.all([
  brancher(T),
  brancher(plateforme.accessToken),
  brancher(voisin.accessToken),
  brancher(null),
]);
cVisiteur.emit("join-store", storeId);

// Le serveur range chaque connexion dans ses salons juste après la poignée
// de main.
await pause(800);

// ===== Une création =====

titre("Un plat est créé");

const creation = await post(
  "/api/products",
  { storeId, categoryId: categorieId, name: `Lasagnes ${uniq}`, price: 20, status: "ACTIVE" },
  T
);
const produit = await j(creation);
const productId = produit.product?.id || produit.id;
check("le plat est créé", creation.ok, creation.status);

await pause(800);

check(
  "l'équipe du commerçant est prévenue",
  derniere(cCommercant)?.ressource === "products" &&
    derniere(cCommercant)?.action === "creation" &&
    derniere(cCommercant)?.storeId === storeId,
  JSON.stringify(cCommercant.recus)
);
check("une seule annonce par écriture", cCommercant.recus.length === 1, cCommercant.recus.length);
check(
  "la plateforme est prévenue",
  derniere(cPlateforme)?.ressource === "products",
  JSON.stringify(cPlateforme.recus)
);
check(
  "le visiteur de la vitrine est prévenu",
  derniere(cVisiteur)?.ressource === "products" && derniere(cVisiteur)?.storeId === storeId,
  JSON.stringify(cVisiteur.recus)
);
check(
  "la vitrine ne reçoit ni l'organisation ni l'identifiant",
  derniere(cVisiteur) && !("orgId" in derniere(cVisiteur)) && !("id" in derniere(cVisiteur)),
  JSON.stringify(derniere(cVisiteur))
);
check("un autre commerçant n'en sait rien", cVoisin.recus.length === 0, JSON.stringify(cVoisin.recus));

// ===== Une suppression =====

titre("Le plat est supprimé");

cCommercant.recus = [];
const suppression = await del(`/api/products/${productId}`, null, T);
await pause(800);

check(
  "la suppression est annoncée, bien que la ressource n'existe plus",
  suppression.ok &&
    derniere(cCommercant)?.action === "suppression" &&
    derniere(cCommercant)?.storeId === storeId,
  `${suppression.status} ${JSON.stringify(cCommercant.recus)}`
);

// ===== Une écriture refusée =====

titre("Une écriture refusée");

cCommercant.recus = [];
const refus = await post("/api/products", { storeId, name: "Intrus", price: 1 }, voisin.accessToken);
await pause(800);

check(
  "rien n'est annoncé",
  !refus.ok && cCommercant.recus.length === 0,
  `${refus.status} ${JSON.stringify(cCommercant.recus)}`
);

for (const socket of [cCommercant, cPlateforme, cVoisin, cVisiteur]) socket.disconnect();

await terminer();
