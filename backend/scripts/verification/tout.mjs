/**
 * Enchaîne toutes les vérifications et rend un bilan unique.
 *
 * Chaque script est lancé dans son propre processus : un plantage n'arrête
 * pas les suivants, et on voit d'un coup d'œil ce qui a lâché.
 *
 *   npm run verif
 *
 * Suppose une API démarrée (VERIF_API_URL, sinon http://localhost:3001) et
 * une base accessible via DATABASE_URL.
 */

import { spawn } from "child_process";
import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { reinitialiser } from "./reinitialiser.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));

const OUTILLAGE = [
  "outils.mjs",
  "tout.mjs",
  "reinitialiser.mjs",
  "boite-aux-lettres.mjs",
  "faux-service-adresses.mjs",
];

const scripts = readdirSync(ICI)
  .filter((nom) => nom.endsWith(".mjs") && !OUTILLAGE.includes(nom))
  .sort();

// Le filtre passé en argument permet de rejouer une seule suite :
//   npm run verif -- formules
const filtre = process.argv[2];
const aJouer = filtre ? scripts.filter((nom) => nom.includes(filtre)) : scripts;

if (aJouer.length === 0) {
  console.error(`Aucun script ne correspond à « ${filtre} ».`);
  console.error(`Disponibles : ${scripts.join(", ")}`);
  process.exit(1);
}

function lancer(nom) {
  return new Promise((resoudre) => {
    const debut = Date.now();
    const enfant = spawn(process.execPath, [join(ICI, nom)], { stdio: ["ignore", "pipe", "pipe"] });

    let sortie = "";
    enfant.stdout.on("data", (bloc) => (sortie += bloc));
    enfant.stderr.on("data", (bloc) => (sortie += bloc));

    enfant.on("close", (code) => {
      const bilan = sortie.match(/=== (\d+) réussites, (\d+) échecs ===/);

      resoudre({
        nom,
        code,
        sortie,
        reussites: bilan ? Number(bilan[1]) : 0,
        echecs: bilan ? Number(bilan[2]) : 0,
        secondes: ((Date.now() - debut) / 1000).toFixed(1),
      });
    });
  });
}

const resultats = [];

for (const nom of aJouer) {
  // Avant chaque script, pas une fois pour toutes : chacun suppose être le
  // premier à s'inscrire, puisque le premier compte devient la plateforme.
  try {
    await reinitialiser();
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`\n──────── ${nom}\n`);
  const resultat = await lancer(nom);
  resultats.push(resultat);

  // En cas d'échec, la sortie complète est la seule chose utile.
  if (resultat.code !== 0) {
    console.log(resultat.sortie);
  } else {
    console.log(`  ${resultat.reussites} contrôles, ${resultat.secondes} s`);
  }
}

const totalReussites = resultats.reduce((somme, r) => somme + r.reussites, 0);
const totalEchecs = resultats.reduce((somme, r) => somme + r.echecs, 0);
const plantes = resultats.filter((r) => r.code !== 0 && r.echecs === 0);

console.log(`\n${"═".repeat(52)}`);
for (const r of resultats) {
  const etat = r.code === 0 ? "OK   " : "ECHEC";
  console.log(`  ${etat} ${r.nom.padEnd(30)} ${String(r.reussites).padStart(3)} contrôles`);
}
console.log(`${"═".repeat(52)}`);
console.log(`  ${totalReussites} contrôles réussis, ${totalEchecs} échoués`);

if (plantes.length > 0) {
  console.log(`  ${plantes.length} script(s) interrompus avant le bilan : ${plantes.map((r) => r.nom).join(", ")}`);
}

process.exit(totalEchecs === 0 && plantes.length === 0 ? 0 : 1);
