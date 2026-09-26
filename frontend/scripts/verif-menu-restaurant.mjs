/**
 * Le menu vu par le client, dans un vrai navigateur.
 *
 * Trois choses que le commerçant décide et que le client doit voir : ses
 * catégories, l'ordre des produits à l'intérieur, et les plats épuisés —
 * signalés, non masqués, et impossibles à mettre au panier.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-menu-restaurant.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia, ouvrirToutLeJour } from './inscription.mjs';

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
// La vitrine se visite par son adresse lisible : c'est la seule qui reste.
const slug = `pizzeria-${uniq}`;

// ===== Le décor =====

await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` },
});

const commercant = await inscriptionVia(appeler, {
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

const creerCategorie = async (name, displayOrder) => {
  const reponse = await appeler('/api/categories', {
    method: 'POST',
    jeton: T,
    corps: { storeId, name, displayOrder },
  });

  return reponse.donnees.category?.id || reponse.donnees.data?.id || reponse.donnees.id;
};

// « Pâtes » est créée en premier mais passe en second : c'est l'ordre du
// commerçant qui compte, pas celui de la création ni l'alphabet.
const catPates = await creerCategorie('Pâtes', 1);
const catPizzas = await creerCategorie('Pizzas', 0);

const creer = async (name, price, categoryId) => {
  const reponse = await appeler('/api/products', {
    method: 'POST',
    jeton: T,
    corps: { storeId, name, price, status: 'ACTIVE', ...(categoryId ? { categoryId } : {}) },
  });

  return reponse.donnees.product?.id || reponse.donnees.id;
};

// Noms choisis pour que l'alphabet donne Calzone, Margherita, Napolitaine :
// l'ordre du commerçant sera l'inverse, la différence se verra.
const margherita = await creer('Margherita', 12, catPizzas);
const calzone = await creer('Calzone', 14, catPizzas);
const napolitaine = await creer('Napolitaine', 13, catPizzas);
const carbonara = await creer('Carbonara', 15, catPates);

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

await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(3000);

titre('Les catégories du commerçant');
// Le menu arrivait en une seule liste à plat : les catégories créées côté
// commerçant n'apparaissaient nulle part.
// La vitrine qui reste titre ses catégories en h2 et ses plats en h3 : c'est
// l'enchaînement correct sous le nom du commerce. Seuls les niveaux changent,
// le comportement vérifié est le même.
const categories = await page
  .locator('h2')
  .evaluateAll((titres) => titres.map((h) => h.textContent?.trim()));

check('la catégorie Pizzas est un titre', categories.includes('Pizzas'), JSON.stringify(categories));
check('la catégorie Pâtes est un titre', categories.includes('Pâtes'), JSON.stringify(categories));
check(
  'les catégories suivent l’ordre du commerçant',
  categories.indexOf('Pizzas') < categories.indexOf('Pâtes'),
  JSON.stringify(categories)
);

// Chaque plat doit être sous sa propre catégorie, pas seulement présent.
const parSection = await page.locator('section').evaluateAll((sections) =>
  sections.map((s) => ({
    titre: s.querySelector('h2')?.textContent?.trim(),
    plats: [...s.querySelectorAll('h3')].map((h) => h.textContent?.trim()),
  }))
);

const sectionPizzas = parSection.find((s) => s.titre === 'Pizzas');
const sectionPates = parSection.find((s) => s.titre === 'Pâtes');

check(
  'les trois pizzas sont sous « Pizzas »',
  ['Margherita', 'Calzone', 'Napolitaine'].every((n) => sectionPizzas?.plats.includes(n)),
  JSON.stringify(sectionPizzas)
);
check(
  'la carbonara est sous « Pâtes »',
  sectionPates?.plats.includes('Carbonara'),
  JSON.stringify(sectionPates)
);
check(
  'aucune pizza ne se glisse dans les pâtes',
  !sectionPates?.plats.some((n) => ['Margherita', 'Calzone', 'Napolitaine'].includes(n || '')),
  JSON.stringify(sectionPates)
);

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

titre('En direct, sans recharger');
// On met d'abord la Margherita au panier, puis on la passe en épuisé sans
// toucher au navigateur : le client doit le voir immédiatement.
const boutonMargherita = page
  .locator('div')
  .filter({ hasText: /^Margherita/ })
  .last()
  .locator('button');

await boutonMargherita.first().click().catch(() => undefined);
await page.waitForTimeout(800);

await appeler(`/api/products/${margherita}/availability`, {
  method: 'PATCH',
  jeton: T,
  corps: { isAvailable: false, storeId },
});

// Aucun rechargement : seul le direct peut mettre la page à jour.
await page.waitForTimeout(3000);

const enDirect = await page.locator('body').innerText();
check(
  'l\u2019étiquette apparaît sans recharger',
  /Épuisé/i.test(enDirect),
  enDirect.slice(0, 400)
);
check(
  'le bouton se désactive sans recharger',
  (await page.locator('button:disabled').count()) >= 1,
  `n=${await page.locator('button:disabled').count()}`
);

titre('Retour en disponible, en direct');
await appeler(`/api/products/${margherita}/availability`, {
  method: 'PATCH',
  jeton: T,
  corps: { isAvailable: true, storeId },
});
await page.waitForTimeout(3000);

check(
  'l\u2019étiquette disparaît sans recharger',
  !/Épuisé/i.test(await page.locator('body').innerText()),
  (await page.locator('body').innerText()).slice(0, 400)
);

titre('Un plat passé en épuisé');
await appeler(`/api/products/${margherita}/availability`, {
  method: 'PATCH',
  jeton: T,
  corps: { isAvailable: false, storeId },
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
