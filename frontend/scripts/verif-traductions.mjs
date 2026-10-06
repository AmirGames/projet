/**
 * Les traductions : messages/fr.json et messages/en.json.
 *
 * Vérifie que les deux fichiers ont exactement les mêmes clés, et que chaque
 * texte est un message ICU valide (accolades, pluriels, balises de t.rich).
 * Un message invalide plante la page qui l'affiche ; une clé absente d'une
 * langue y affiche la clé brute.
 *
 * Usage (depuis frontend/) : node scripts/verif-traductions.mjs
 * Sans serveur ni base : il ne lit que les deux fichiers.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { IntlMessageFormat } = createRequire(path.join(racine, 'package.json'))('intl-messageformat');

// Les tableaux (contenus lus avec t.raw, comme devenirContenus) sont aplatis
// par indice : « devenirContenus.livreur.avantages.0.titre ».
const aplatir = (noeud, prefixe = '') =>
  Object.entries(noeud).flatMap(([cle, valeur]) =>
    valeur && typeof valeur === 'object' ? aplatir(valeur, `${prefixe}${cle}.`) : [[`${prefixe}${cle}`, valeur]],
  );

const lire = (langue) =>
  Object.fromEntries(aplatir(JSON.parse(fs.readFileSync(path.join(racine, 'messages', `${langue}.json`), 'utf8'))));

const langues = { fr: lire('fr'), en: lire('en') };
const problemes = [];

for (const [langue, autre] of [['fr', 'en'], ['en', 'fr']]) {
  for (const cle of Object.keys(langues[langue])) {
    if (!(cle in langues[autre])) problemes.push(`absente de ${autre}.json : ${cle}`);
  }
}

for (const [langue, messages] of Object.entries(langues)) {
  for (const [cle, texte] of Object.entries(messages)) {
    if (typeof texte !== 'string') {
      problemes.push(`${langue}.json ${cle} : pas un texte (${typeof texte})`);
      continue;
    }
    try {
      new IntlMessageFormat(texte, langue);
    } catch (erreur) {
      problemes.push(`${langue}.json ${cle} : message ICU invalide (${erreur.message})`);
    }
  }
}

for (const probleme of problemes) console.log(`  ECHEC ${probleme}`);
console.log(`${Object.keys(langues.fr).length} clés, ${problemes.length} problème(s)`);
process.exit(problemes.length ? 1 : 0);
