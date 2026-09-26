/**
 * Une seule vitrine, et les anciennes adresses qui y mènent.
 *
 * Le site en portait trois pour la même chose — `/restaurant/<id>`,
 * `/client/restaurant/<id>`, `/store/<slug>` — plus une maquette `/store` à
 * l'identifiant écrit en dur, vers laquelle la page d'accueil pointait. Elles
 * partageaient l'API mais pas leur habillage, et divergeaient à chaque
 * correction.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-vitrine-unique.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia, ouvrirToutLeJour } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';

let ok = 0;
const echecs = [];

const check = (nom, condition, detail = '') => {
  if (condition) {
    ok++;
    console.log(`  OK    ${nom}`);
  } else {
    echecs.push(nom);
    console.log(`  ECHEC ${nom}${detail ? ` — ${detail}` : ''}`);
  }
};

const titre = (texte) => console.log(`\n[${texte}]`);

const appeler = async (chemin, options = {}) => {
  const reponse = await fetch(API + chemin, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
    },
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
  });

  return { statut: reponse.status, donnees: await reponse.json().catch(() => null) };
};

// ===== Le décor =====

await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `Plateforme ${uniq}` },
});

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` },
});
const T = commercant.donnees.accessToken;

const slug = `trattoria-${uniq}`;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
    name: `Trattoria ${uniq}`,
    slug,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    latitude: 45.764,
    longitude: 4.8357,
  },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;
await ouvrirToutLeJour(appeler, storeId, T);

await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: `Lasagnes ${uniq}`, price: 14, status: 'ACTIVE' },
});

// ===== Le navigateur =====

const nav = await chromium.launch();
const contexte = await nav.newContext();
const page = await contexte.newPage();

const erreurs = [];
page.on('console', (m) => {
  // Le script demande exprès un identifiant inconnu et l'ancienne maquette :
  // les 404 qui en résultent sont ce qu'on vérifie, pas un défaut de la page.
  // « RSC payload » : un préchargement de Next interrompu par le changement
  // de page — le navigateur retombe sur une navigation normale.
  if (m.type() === 'error' && !/404|RSC payload/.test(m.text())) {
    erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
  }
});

const texte = () => page.locator('body').innerText();

// ===== La vitrine qui reste =====

titre('La vitrine par adresse lisible sert le menu');
await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(3000);

const vitrine = await texte();
check('le commerce est nommé', vitrine.includes(`Trattoria ${uniq}`), vitrine.slice(0, 400));
check('son menu est servi', vitrine.includes(`Lasagnes ${uniq}`), vitrine.slice(0, 600));

// ===== Les anciennes adresses =====

titre('L’ancienne vitrine par identifiant redirige');
await page.goto(`${SITE}/restaurant/${storeId}`);
await page.waitForURL(`**/store/${slug}`, { timeout: 15000 });
check('elle mène à la vitrine unique', page.url().endsWith(`/store/${slug}`), page.url());

// La redirection arrive avant le menu : lui laisser le temps d'être servi.
await page.waitForTimeout(3000);
const apresRedirection = await texte();
check('le menu y est bien', apresRedirection.includes(`Lasagnes ${uniq}`), apresRedirection.slice(0, 600));

titre('La troisième vitrine aussi');
await page.goto(`${SITE}/client/restaurant/${storeId}`);
await page.waitForURL(`**/store/${slug}`, { timeout: 15000 });
check('elle mène à la vitrine unique', page.url().endsWith(`/store/${slug}`), page.url());

titre('Un identifiant inconnu ne laisse pas sur une page blanche');
await page.goto(`${SITE}/restaurant/inexistant-${uniq}`);
await page.waitForTimeout(3500);

const inconnu = await texte();
check(
  'on le dit, ou on ramène à la liste',
  /introuvable/i.test(inconnu) || page.url().includes('/restaurants'),
  `${page.url()} — ${inconnu.slice(0, 300)}`
);

titre('L’ancien tunnel de commande redirige');
// Il envoyait un panier réparti sur plusieurs commerces, dans un format que
// l'API refuse : la commande ne partait jamais.
await page.goto(`${SITE}/client/checkout`);
// « **/checkout** » matcherait aussi /client/checkout : on attend le chemin
// exact, sans quoi l'attente rendrait la main avant la redirection.
await page.waitForURL((url) => url.pathname === '/checkout', { timeout: 15000 });
check('il mène au tunnel à jour', new URL(page.url()).pathname === '/checkout', page.url());

titre('La maquette à l’identifiant écrit en dur a disparu');
const maquette = await page.goto(`${SITE}/store`);
check('la page ne répond plus', maquette?.status() === 404, `statut ${maquette?.status()}`);

// ===== Plus aucun lien vers les doublons =====

titre('L’accueil ne pointe plus vers la maquette');
await page.goto(SITE);
await page.waitForTimeout(2500);

// Les liens publics portent la région du visiteur (/fr-fr/restaurants) :
// on la retire pour comparer les pages elles-mêmes.
const sansRegion = (lien) => lien?.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/|$)/, '') || lien;

const liens = (await page.locator('a[href]').evaluateAll((a) => a.map((l) => l.getAttribute('href')))).map(
  sansRegion
);
check('aucun lien vers /store nu', !liens.includes('/store'), JSON.stringify(liens.filter((l) => l?.startsWith('/store'))));
check('il mène à la liste des commerces', liens.includes('/restaurants'), JSON.stringify(liens));

titre('La liste des commerces mène à la vitrine unique');
await page.goto(`${SITE}/restaurants`);
await page.waitForTimeout(3000);

const liensListe = (
  await page.locator('a[href]').evaluateAll((a) => a.map((l) => l.getAttribute('href')))
).map(sansRegion);

check(
  'elle pointe par adresse lisible',
  liensListe.some((l) => l === `/store/${slug}`),
  JSON.stringify(liensListe.filter((l) => l?.includes('store') || l?.includes('restaurant')))
);
check(
  'et plus par identifiant',
  !liensListe.some((l) => l?.startsWith('/restaurant/')),
  JSON.stringify(liensListe.filter((l) => l?.startsWith('/restaurant/')))
);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
