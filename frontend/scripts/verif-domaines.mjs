/**
 * Vérifie la répartition des pages entre les domaines.
 *
 * Les en-têtes Host sont forgés à la main : pas besoin de toucher au fichier
 * hosts ni de résoudre quoi que ce soit, on interroge directement le serveur
 * en lui annonçant le domaine voulu.
 *
 *   cd frontend
 *   NEXT_PUBLIC_DOMAINE_PUBLIC=monsite.local \
 *   NEXT_PUBLIC_DOMAINE_PRO=commercant.monsite.local \
 *   NEXT_PUBLIC_DOMAINE_LIVREUR=livreur.monsite.local \
 *   npm run dev
 *
 *   # puis, dans un autre terminal
 *   npm run verif:domaines
 *
 * Les domaines doivent être les mêmes des deux côtés : le middleware les lit
 * au démarrage du serveur, ce script les relit ici.
 */

import { request } from "node:http";

const SITE = process.env.VERIF_SITE_URL || "http://127.0.0.1:3000";
const PORT = new URL(SITE).port ? `:${new URL(SITE).port}` : "";

const PUBLIC = process.env.NEXT_PUBLIC_DOMAINE_PUBLIC || "monsite.local";
const PRO = process.env.NEXT_PUBLIC_DOMAINE_PRO || "commercant.monsite.local";
const LIVREUR = process.env.NEXT_PUBLIC_DOMAINE_LIVREUR || "livreur.monsite.local";

let reussites = 0;
const echecs = [];

function check(nom, condition, detail = "") {
  if (condition) {
    reussites++;
    console.log(`  OK    ${nom}`);
  } else {
    echecs.push(nom);
    console.log(`  ECHEC ${nom}${detail ? ` — ${detail}` : ""}`);
  }
}

function titre(texte) {
  console.log(`\n[${texte}]`);
}

/**
 * Appel avec un en-tête Host forgé.
 *
 * fetch() refuse de laisser fixer cet en-tête — c'est précisément ce dont on a
 * besoin ici pour interroger le serveur en lui annonçant un autre domaine, sans
 * rien résoudre. Le module http, lui, l'autorise.
 */
function appeler(hote, chemin) {
  const cible = new URL(SITE);

  return new Promise((resoudre, rejeter) => {
    const requete = request(
      {
        hostname: cible.hostname,
        port: cible.port || 80,
        path: chemin,
        method: "GET",
        headers: { Host: hote },
      },
      (reponse) => {
        let corps = "";
        reponse.setEncoding("utf-8");
        reponse.on("data", (bloc) => (corps += bloc));
        reponse.on("end", () =>
          resoudre({
            statut: reponse.statusCode,
            destination: reponse.headers.location || "",
            corps,
          })
        );
      }
    );

    requete.on("error", rejeter);
    requete.end();
  });
}

/** La page reste sur ce domaine et s'affiche. */
async function servie(nom, hote, chemin, contenu = "") {
  const r = await appeler(hote, chemin);

  if (r.statut !== 200) {
    check(nom, false, `statut ${r.statut}${r.destination ? ` vers ${r.destination}` : ""}`);
    return;
  }

  check(nom, !contenu || r.corps.includes(contenu), contenu && "contenu attendu absent");
}

/** La page est renvoyée vers le domaine indiqué, chemin conservé. */
async function renvoyee(nom, hote, chemin, versDomaine, versChemin = chemin) {
  const r = await appeler(hote, chemin);

  if (r.statut < 300 || r.statut >= 400) {
    check(nom, false, `statut ${r.statut} (redirection attendue)`);
    return;
  }

  const attendu = `${versDomaine}${PORT}${versChemin}`;
  check(nom, r.destination.includes(attendu), `destination ${r.destination}`);
}

// ===== Accueil propre à chaque domaine =====
titre("Accueil");
await servie("le domaine pro montre l'offre commerçant", PRO, "/", "Digitalisez votre commerce");
await servie("le domaine public montre les commerces", PUBLIC, "/", "Commandes en Ligne");
check(
  "les deux accueils diffèrent",
  !(await appeler(PRO, "/")).corps.includes("Commandes en Ligne")
);

// ===== Pages professionnelles =====
titre("Pages commerçant appelées d'ailleurs");
for (const chemin of ["/merchant", "/superowner", "/super-admin", "/admin", "/dashboard", "/signup"]) {
  await renvoyee(`${chemin} depuis le public`, PUBLIC, chemin, PRO);
}
await renvoyee("/store/new depuis le public", PUBLIC, "/store/new", PRO);
await renvoyee("/merchant depuis le livreur", LIVREUR, "/merchant", PRO);

// ===== Pages publiques =====
titre("Pages clients appelées d'ailleurs");
for (const chemin of ["/client", "/restaurants", "/track", "/checkout", "/store/une-boutique"]) {
  await renvoyee(`${chemin} depuis le pro`, PRO, chemin, PUBLIC);
}
await renvoyee("/client depuis le livreur", LIVREUR, "/client", PUBLIC);

// ===== Pages livreur =====
titre("Espace livreur");
await servie("le domaine livreur sert /driver", LIVREUR, "/driver");
await servie("le domaine livreur sert /driver/earnings", LIVREUR, "/driver/earnings");
await renvoyee("/driver depuis le pro", PRO, "/driver", LIVREUR);
await renvoyee("/driver/signup depuis le public", PUBLIC, "/driver/signup", LIVREUR);

// ===== Pages communes =====
titre("Pages communes");
for (const [nom, hote] of [["pro", PRO], ["public", PUBLIC], ["livreur", LIVREUR]]) {
  await servie(`/login servi par le domaine ${nom}`, hote, "/login");
}

// ===== Paramètres et domaine inconnu =====
titre("Détails qui comptent");
const avecParametres = await appeler(PUBLIC, "/merchant?orgId=abc&onglet=2");
check(
  "les paramètres d'URL survivent à la redirection",
  avecParametres.destination.includes("orgId=abc") && avecParametres.destination.includes("onglet=2"),
  avecParametres.destination
);

const hoteInconnu = new URL(SITE).host;
for (const chemin of ["/merchant", "/client", "/driver"]) {
  const r = await appeler(hoteInconnu, chemin);
  check(`${chemin} intact sur un hôte non reconnu`, r.statut === 200, `statut ${r.statut}`);
}

console.log(`\n=== ${reussites} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join("\n"));

process.exit(echecs.length === 0 ? 0 : 1);
