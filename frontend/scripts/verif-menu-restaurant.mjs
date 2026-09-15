/**
 * Le menu vu par le client, dans un vrai navigateur.
 *
 * Deux choses que le commerçant décide et que le client doit voir : l'ordre
 * des produits dans une catégorie, et les plats épuisés — signalés, non
 * masqués, et impossibles à mettre au panier.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-menu-restaurant.mjs
 */

import { chromium } from 'playwright';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

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
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
    },
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
  });

  return { statut: reponse.status, donnees: await reponse.json().catch(() => null) };
};

const uniq = Date.now().toString(36);

// ===== Le décor =====

await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` },
});

const commercant = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` },
});

const T = commercant.donnees.accessToken;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
    name: `Pizzeria ${uniq}`,
    slug: `pizzeria-${uniq}`,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    latitude: 45.764,
    longitude: 4.8357,
  },
});

const storeId = boutique.donnees.store?.id || boutique.donnees.id;

const creer = async (name, price) => {
  const reponse = await appeler('/api/products', {
    method: 'POST',
    jeton: T,
    corps: { storeId, name, price, status: 'ACTIVE' },
  });

  return reponse.donnees.product?.id || reponse.donnees.id;
};

// Noms choisis pour que l'alphabet donne Calzone, Margherita, Napolitaine :
// l'ordre du commerçant sera l'inverse, la différence se verra.
const margherita = await creer('Margherita', 12);
const calzone = await creer('Calzone', 14);
const napolitaine = await creer('Napolitaine', 13);

await appeler('/api/products/reorder', {
  method: 'POST',
  jeton: T,
  corps: {
    storeId,
    ordering: [
      { id: napolitaine, displayOrder: 0 },
      { id: margherita, displayOrder: 1 },
      { id: calzone, displayOrder: 2 },
    ],
  },
});

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

titre('Depuis la liste des restaurants');
await page.goto(`${SITE}/restaurants`);
await page.waitForTimeout(3000);

const liste = await page.locator('body').innerText();
check('la pizzeria est listée', liste.includes(`Pizzeria ${uniq}`), liste.slice(0, 300));

await page.goto(`${SITE}/restaurant/${storeId}`);
await page.waitForTimeout(3000);

titre('Ordre voulu par le commerçant');
const nomsAffiches = await page
  .locator('h3')
  .evaluateAll((titres) => titres.map((h) => h.textContent?.trim()));

const pizzas = nomsAffiches.filter((n) =>
  ['Margherita', 'Calzone', 'Napolitaine'].includes(n || '')
);

check(
  'les pizzas suivent l’ordre du commerçant',
  JSON.stringify(pizzas) === JSON.stringify(['Napolitaine', 'Margherita', 'Calzone']),
  JSON.stringify(pizzas)
);

titre('Un plat passé en épuisé');
await appeler(`/api/products/${margherita}/availability`, {
  method: 'PATCH',
  jeton: T,
  corps: { isAvailable: false },
});

await page.reload();
await page.waitForTimeout(3000);

const apres = await page.locator('body').innerText();
check('le plat reste affiché', apres.includes('Margherita'), apres.slice(0, 400));
check('une étiquette « Épuisé » apparaît', /Épuisé/i.test(apres), apres.slice(0, 400));

// La carte du plat épuisé, et son bouton d'ajout.
const carte = page.locator('div').filter({ hasText: /^Margherita/ }).last();
const boutons = await page.locator('button:disabled').count();
check('au moins un bouton d’ajout est désactivé', boutons >= 1, `n=${boutons}`);

titre('Impossible de le mettre au panier');
const avantPanier = await page.locator('body').innerText();

// Le bouton du plat épuisé : on tente le clic malgré tout.
const boutonEpuise = page.locator('button:disabled').first();
await boutonEpuise.click({ force: true, timeout: 5000 }).catch(() => undefined);
await page.waitForTimeout(1200);

const apresClic = await page.locator('body').innerText();
check(
  'le panier n’a pas bougé',
  apresClic.replace(/\s+/g, ' ') === avantPanier.replace(/\s+/g, ' '),
  'la page a changé après le clic'
);

titre('Les autres restent commandables');
const nomsRestants = await page
  .locator('h3')
  .evaluateAll((titres) => titres.map((h) => h.textContent?.trim()));

check('Calzone est toujours là', nomsRestants.includes('Calzone'), JSON.stringify(nomsRestants));
check(
  'l’ordre est inchangé après l’épuisement',
  JSON.stringify(
    nomsRestants.filter((n) => ['Margherita', 'Calzone', 'Napolitaine'].includes(n || ''))
  ) === JSON.stringify(['Napolitaine', 'Margherita', 'Calzone']),
  JSON.stringify(nomsRestants)
);

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|RSC payload/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
