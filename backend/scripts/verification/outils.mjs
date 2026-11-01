/**
 * Boîte à outils commune aux scripts de vérification.
 *
 * Ces scripts interrogent une vraie API branchée sur une vraie base : ils
 * attrapent ce qu'une relecture laisse passer (un champ mal nommé, une route
 * qui répond 200 en ne faisant rien, un montant divisé par cent).
 *
 * Adresse de l'API : VERIF_API_URL, sinon http://localhost:3001.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createDecipheriv } from "node:crypto";

export const API = process.env.VERIF_API_URL || "http://localhost:3001";

/** Suffixe unique : les scripts peuvent tourner plusieurs fois de suite. */
export const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let reussites = 0;
let echecs = 0;
const manques = [];

/** Un contrôle. Le détail n'est affiché qu'en cas d'échec. */
export function check(nom, condition, detail = "") {
  if (condition) {
    reussites++;
    console.log(`  OK    ${nom}`);
  } else {
    echecs++;
    manques.push(nom);
    console.log(`  ECHEC ${nom}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Intertitre, pour se repérer dans une longue sortie. */
export function titre(texte) {
  console.log(`\n[${texte}]`);
}

/**
 * Bilan final. Le code de sortie permet d'enchaîner les scripts et de faire
 * échouer une intégration continue.
 */
export function bilan() {
  console.log(`\n=== ${reussites} réussites, ${echecs} échecs ===`);

  if (echecs > 0) {
    console.log(manques.map((nom) => `  - ${nom}`).join("\n"));
  }

  return echecs === 0;
}

/** Bilan puis sortie du processus. */
export async function terminer() {
  const succes = bilan();
  await fermerBase();
  process.exit(succes ? 0 : 1);
}

/** Corps JSON d'une réponse, ou null si ce n'en est pas. */
export const j = async (reponse) => {
  try {
    return await reponse.json();
  } catch {
    return null;
  }
};

const INSCRIPTIONS = new Set(["/api/auth/signup", "/api/auth/merchant-register"]);

const requete =
  (methode) =>
  async (chemin, corps, jeton) => {
    // BCE de test valide (jamais vérifié) : les scénarios métier qui ont besoin
    // d'un livreur doivent passer la nouvelle validation d'inscription. Les
    // tests du refus d'un BCE invalide l'envoient explicitement.
    const corpsEffectif = methode === "POST" && chemin === "/api/drivers/register" &&
      corps && typeof corps === "object" && !Object.hasOwn(corps, "bceNumber")
      ? { ...corps, bceNumber: "0123.456.749" }
      : corps;
    const reponse = await fetch(API + chemin, {
      method: methode,
      headers: {
        "Content-Type": "application/json",
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      },
      ...(corpsEffectif ? { body: JSON.stringify(corpsEffectif) } : {}),
    });

    if (methode === "POST" && chemin === "/api/orders") await retenirJetonDeSuivi(reponse);

    return methode === "POST" && INSCRIPTIONS.has(chemin) ? plateformeSiAucune(reponse) : reponse;
  };

/**
 * Le suivi d'une commande, lu comme le client le lit.
 *
 * Le suivi (`GET /api/orders/:id`) demande le jeton remis à la commande : la
 * réponse de `POST /api/orders` le donne une fois (`order.trackingToken`), et
 * le site le garde dans le navigateur du client (lib/suivi-commande.ts). On
 * fait de même : chaque commande passée ici retient son jeton, que `lireSuivi()`
 * présente ensuite en `?t=`. Sans jeton, la route répond 404 — comme à un
 * inconnu qui devinerait l'identifiant.
 */
const jetonsDeSuivi = new Map();

async function retenirJetonDeSuivi(reponse) {
  if (!reponse.ok) return;
  const commande = (await j(reponse.clone()))?.order;
  if (commande?.id && commande.trackingToken) jetonsDeSuivi.set(commande.id, commande.trackingToken);
}

/** Le jeton de suivi d'une commande passée par `post("/api/orders")`. */
export function jetonDeSuivi(orderId) {
  const jeton = jetonsDeSuivi.get(orderId);
  if (!jeton) throw new Error(`Aucun jeton de suivi connu pour la commande ${orderId}`);
  return jeton;
}

/** `GET /api/orders/:id` (ou `:id` + `suite`), avec le jeton de suivi du client. */
export const lireSuivi = (orderId, suite = "") =>
  get(`/api/orders/${orderId}${suite}?t=${encodeURIComponent(jetonDeSuivi(orderId))}`);

export const post = requete("POST");
export const put = requete("PUT");
export const patch = requete("PATCH");
export const del = requete("DELETE");

export const get = (chemin, jeton) =>
  fetch(API + chemin, { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} });

/** Dépose un vrai fichier PDF de test par le même endpoint que l'application. */
export async function deposerDocumentLivreur(type, jeton, options = {}) {
  const formulaire = new FormData();
  formulaire.set("type", type);
  if (options.expiryDate) formulaire.set("expiryDate", options.expiryDate);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
  formulaire.set("file", new Blob([pdf], { type: "application/pdf" }), `${type}.pdf`);
  return fetch(`${API}/api/drivers/documents/upload`, {
    method: "POST",
    headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
    body: formulaire,
  });
}

/** Dépose une photo de livraison réelle dans le stockage privé. */
export async function deposerPhotoLivreur(deliveryId, jeton) {
  const formulaire = new FormData();
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  formulaire.set("photo", new Blob([pixel], { type: "image/png" }), "depot.png");
  return fetch(`${API}/api/drivers/deliveries/${deliveryId}/photo`, {
    method: "POST",
    headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
    body: formulaire,
  });
}

// ===== Accès direct à la base =====
// Certains contrôles doivent regarder derrière l'API : vérifier qu'un mot de
// passe est bien haché, simuler une perte de données que l'application ne
// permet pas de provoquer.

let prisma = null;

function base() {
  if (!prisma) prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  return prisma;
}

/** Première colonne de la première ligne, en texte ; '' si aucune ligne. */
export async function sqlScalaire(requeteSql, contexteChiffrement) {
  const lignes = await base().$queryRawUnsafe(requeteSql);
  if (!lignes || lignes.length === 0) return "";

  const valeur = Object.values(lignes[0])[0];
  if (valeur === null || valeur === undefined) return "";
  if (contexteChiffrement && typeof valeur === "string" && valeur.startsWith("zupenc:v1:")) {
    const [id, nonce, tag, corps] = valeur.slice("zupenc:v1:".length).split(":");
    const encoded = JSON.parse(process.env.DATA_ENCRYPTION_KEYS || "{}")[id];
    if (!encoded || !nonce || !tag || !corps) throw new Error(`Clé ou enveloppe manquante pour ${contexteChiffrement}`);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(encoded, "base64"), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(`zupone:v1:${contexteChiffrement}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(corps, "base64url")), decipher.final()]).toString("utf8"));
  }
  return String(valeur);
}

/** Exécute une requête qui ne renvoie rien (INSERT, UPDATE, DELETE). */
/**
 * Rend une boutique prête à livrer : organisation validée, ouverte, située.
 *
 * Le serveur refuse une commande en livraison d'une boutique qui n'a pas situé
 * son adresse ou que la plateforme n'a pas validée ; les suites qui ne testent
 * pas ces verrous-là passent par ici.
 */
export async function ouvrirBoutiqueLivrante(storeId, orgId, position = { latitude: 45.764, longitude: 4.8357 }) {
  await sqlExec(`UPDATE "Organization" SET "approvedAt" = NOW(), tier = 'FREE' WHERE id = '${orgId}'`);
  const jours = Object.fromEntries(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((jour) =>
    [jour, { closed: false, plages: [{ open: "00:00", close: "23:59" }] }]
  ));
  const horaires = JSON.stringify(jours).replace(/'/g, "''");
  await sqlExec(
    `UPDATE "Store" SET "isOpen" = true, "operatingHours" = '${horaires}'::jsonb,
       "acceptsDelivery" = true, "minDeliveryAmount" = 0,
       latitude = ${position.latitude}, longitude = ${position.longitude} WHERE id = '${storeId}'`
  );
}

export async function sqlExec(requeteSql) {
  return base().$executeRawUnsafe(requeteSql);
}

/**
 * Fait passer les six minutes d'attente du client injoignable : la photo du
 * dépôt n'est acceptée qu'à leur terme, et une vérification ne les attend pas.
 */
export async function attenteClientEcoulee(courseId) {
  return sqlExec(
    `UPDATE "OrderDelivery" SET "customerWaitStartedAt" = NOW() - INTERVAL '7 minutes' WHERE id = '${courseId}'`
  );
}

/**
 * Le premier compte inscrit devient la plateforme — dans les vérifications
 * seulement.
 *
 * L'API ne donne plus aucun droit à l'inscription (SEC-03) : le superowner se
 * crée avec `npm run create-superowner`. Les suites, elles, ont toutes été
 * écrites pour un premier inscrit qui est la plateforme, sur une base vidée
 * avant chaque script. On le promeut donc ici, en base, et on corrige la
 * réponse d'inscription pour qu'elle le dise.
 */
async function plateformeSiAucune(reponse) {
  if (reponse.status !== 201) return reponse;

  const donnees = await reponse.json();
  const userId = donnees?.user?.id;

  if (userId) {
    const promu = await base()
      .$executeRaw`UPDATE "User" SET "isSuperOwner" = true, "isSystemAdmin" = true
        WHERE id = ${userId} AND NOT EXISTS (SELECT 1 FROM "User" WHERE "isSuperOwner" = true)`
      // Deux inscriptions simultanées : l'index unique garde la première.
      .catch(() => 0);

    if (promu === 1) donnees.user = { ...donnees.user, isSuperOwner: true, isSystemAdmin: true };
  }

  return new Response(JSON.stringify(donnees), { status: reponse.status, headers: reponse.headers });
}

export async function fermerBase() {
  if (prisma) await prisma.$disconnect();
}

// ===== Raccourcis métier =====

let numeroOrganisation = 0;

/**
 * Inscription telle que les vérifications ont été écrites : un compte, et une
 * organisation sans boutique dont il est administrateur.
 *
 * Avant la refonte d'identité, /auth/signup créait lui-même cette
 * organisation ; il ne crée plus que le compte et sa fiche client, et le
 * produit passe ensuite par /auth/me/become-merchant — qui ouvre aussi une
 * boutique. Les suites créent leurs boutiques elles-mêmes, avec les
 * coordonnées, horaires et formules qu'elles vérifient : une boutique
 * imposée fausserait leurs comptes et mangerait le quota de la formule.
 *
 * Les deux passent par la vraie API : /auth/signup, puis /organizations, qui
 * crée l'organisation au nom de l'appelant exactement comme le faisait
 * l'ancienne inscription. La réponse garde le statut et le corps de
 * l'inscription, augmentés de `organization` : `.status` et `j()` s'en
 * servent comme avant.
 */
export async function inscription(corps) {
  const reponse = await post("/api/auth/signup", { conditionsAcceptees: true, ...corps });
  const donnees = await j(reponse);

  if (!reponse.ok || !donnees?.accessToken) {
    return new Response(JSON.stringify(donnees), { status: reponse.status });
  }

  const nom = corps.name?.length >= 2 ? corps.name : `Organisation ${uniq}`;
  const creation = await post(
    "/api/organizations",
    { name: nom, slug: `org-${uniq}-${++numeroOrganisation}` },
    donnees.accessToken
  );
  const org = (await j(creation))?.org;

  if (!org?.id) {
    throw new Error(`Organisation non créée pour ${corps.email} : statut ${creation.status}`);
  }

  // Un commerce attend désormais la validation de la plateforme avant de
  // vendre. Les suites ont été écrites pour un commerce qui vend : il est
  // validé d'office, comme la migration l'a fait pour les commerces existants.
  // La validation elle-même se vérifie dans verif-validation-commerce.
  await base().organization.update({ where: { id: org.id }, data: { approvedAt: new Date() } });

  const corpsAugmente = {
    ...donnees,
    organization: { id: org.id, name: org.name, slug: org.slug },
  };

  return new Response(JSON.stringify(corpsAugmente), { status: reponse.status });
}

/** Crée un compte et renvoie sa réponse d'inscription complète. */
export async function inscrire(prefixe) {
  return j(
    await inscription({
      email: `${prefixe}-${uniq}@test.fr`,
      password: "Password123!",
      name: `${prefixe} ${uniq}`,
    })
  );
}

/**
 * Le premier compte inscrit devient la plateforme (voir plateformeSiAucune) :
 * plusieurs scripts ont besoin qu'il existe avant de créer leur propre
 * commerçant.
 */
export async function inscrirePlateforme() {
  return inscrire("plateforme");
}

/**
 * Le code de remise d'une course.
 *
 * Il appartient au client : le livreur ne le voit jamais, et aucune route ne le
 * lui donne. Un script qui clôt une course joue le rôle du client, et le lit
 * donc en base.
 */
export async function codeDeRemise(deliveryId) {
  const orderId = await sqlScalaire(`SELECT "orderId" FROM "OrderDelivery" WHERE id = '${deliveryId}'`);
  if (!orderId) return "";
  const suivi = await j(await lireSuivi(orderId));
  return typeof suivi?.codeRemise === "string" ? suivi.codeRemise : "";
}

/**
 * Fait passer un livreur par la validation de la plateforme.
 *
 * Un livreur s'inscrit désormais en `PENDING` et ne reçoit aucune course tant
 * que son dossier n'est pas validé. Les scripts qui vérifient autre chose —
 * l'attribution, le suivi client — ont besoin d'un livreur en état de rouler :
 * ils passent par ici plutôt que de forcer l'état en base, pour que le chemin
 * réel reste celui qu'on emprunte.
 */
export async function validerLivreur(jetonLivreur, jetonPlateforme) {
  const moi = await j(await get("/api/drivers/me", jetonLivreur));
  const driverId = moi?.data?.id;

  if (driverId && moi?.data?.bceNumber) {
    await patch(`/api/superowner/drivers/${driverId}/bce`, { status: "VERIFIED" }, jetonPlateforme);
  }

  for (const type of moi?.data?.piecesAttendues || []) {
    await deposerDocumentLivreur(type, jetonLivreur);
  }

  const dossier = await j(await get("/api/drivers/documents", jetonLivreur));

  for (const piece of dossier?.data?.documents || []) {
    await patch(
      `/api/superowner/drivers/${driverId}/documents/${piece.id}`,
      { approuve: true },
      jetonPlateforme
    );
  }

  await post(`/api/superowner/drivers/${driverId}/approve`, {}, jetonPlateforme);

  return driverId;
}

/**
 * Le commerçant accepte la commande, la prépare et la déclare prête.
 *
 * Le livreur ne peut emporter qu'une commande prête : les scripts qui
 * vérifient la suite de la course passent par le vrai chemin du commerçant
 * avant le retrait, plutôt que de forcer l'état en base.
 */
export async function declarerPrete(storeId, orderId, jetonCommercant) {
  await post(
    `/api/order-management/${storeId}/${orderId}/accept`,
    { preparationMinutes: 15 },
    jetonCommercant
  );

  for (const status of ["PREPARING", "READY"]) {
    await patch(`/api/order-management/${storeId}/${orderId}/status`, { status }, jetonCommercant);
  }
}
