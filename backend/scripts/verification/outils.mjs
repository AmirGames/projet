/**
 * Boîte à outils commune aux scripts de vérification.
 *
 * Ces scripts interrogent une vraie API branchée sur une vraie base : ils
 * attrapent ce qu'une relecture laisse passer (un champ mal nommé, une route
 * qui répond 200 en ne faisant rien, un montant divisé par cent).
 *
 * Adresse de l'API : VERIF_API_URL, sinon http://localhost:3001.
 */

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
  if (!prisma) prisma = new PrismaClient();
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

export async function fermerBase() {
  if (prisma) await prisma.$disconnect();
}

// ===== Raccourcis métier =====

/** Crée un compte et renvoie sa réponse d'inscription complète. */
export async function inscrire(prefixe) {
  return j(
    await post("/api/auth/signup", {
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
