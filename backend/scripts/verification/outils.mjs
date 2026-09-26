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

const requete =
  (methode) =>
  (chemin, corps, jeton) =>
    fetch(API + chemin, {
      method: methode,
      headers: {
        "Content-Type": "application/json",
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });

export const post = requete("POST");
export const put = requete("PUT");
export const patch = requete("PATCH");
export const del = requete("DELETE");

export const get = (chemin, jeton) =>
  fetch(API + chemin, { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} });

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
export async function sqlScalaire(requeteSql) {
  const lignes = await base().$queryRawUnsafe(requeteSql);
  if (!lignes || lignes.length === 0) return "";

  const valeur = Object.values(lignes[0])[0];
  return valeur === null || valeur === undefined ? "" : String(valeur);
}

/** Exécute une requête qui ne renvoie rien (INSERT, UPDATE, DELETE). */
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
 * Le premier compte inscrit devient la plateforme : plusieurs scripts ont
 * besoin qu'il existe avant de créer leur propre commerçant.
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
  return sqlScalaire(`SELECT "deliveryCode" FROM "OrderDelivery" WHERE id = '${deliveryId}'`);
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

  for (const type of moi?.data?.piecesAttendues || []) {
    await post(
      "/api/drivers/documents",
      { type, documentUrl: `https://exemple.fr/${type}.pdf` },
      jetonLivreur
    );
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
