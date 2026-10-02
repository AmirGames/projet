/**
 * Le tableau de bord et le catalogue du commerçant.
 *
 * Le tableau de bord montre les ventes du jour (une commande refusée n'en
 * est pas une), les commandes en cours et les plats épuisés, qu'on remet en
 * vente d'un clic. Le catalogue range les plats en lignes, avec un
 * interrupteur de disponibilité, et ouvre un panneau de modification qui
 * porte aussi les tailles et les suppléments.
 *
 *   DATABASE_URL=... VERIF_SITE_URL=http://localhost:3000 \
 *   VERIF_API_URL=http://localhost:3001 node scripts/verif-tableau-de-bord.mjs
 *
 * VERIF_CAPTURES=<dossier> enregistre en plus des captures des deux pages.
 */

import { chromium } from 'playwright';
import { inscriptionVia, ouvrirToutLeJour, baseDeDonnees, plateformeSiAucune } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';
const CAPTURES = process.env.VERIF_CAPTURES;

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
const MDP = 'Password123!';
const base = baseDeDonnees();

// ===== Le décor : une pizzeria et six commandes à différents stades =====

await plateformeSiAucune(
  await appeler('/api/auth/signup', { method: 'POST', corps: { conditionsAcceptees: true, email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` } })
);

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `Marchand ${uniq}` },
});
const T = commercant.donnees.accessToken;
const orgId = commercant.donnees.organization.id;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: { orgId, name: `Pizza ${uniq}`, slug: `pizza-${uniq}`, phone: '0400000000' },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;
await ouvrirToutLeJour(appeler, storeId, T);
await base.store.update({ where: { id: storeId }, data: { isOpen: true } });

const categorie = await appeler('/api/categories', { method: 'POST', jeton: T, corps: { storeId, name: 'Pizzas' } });
const categoryId = categorie.donnees.category?.id || categorie.donnees.id;

const creerProduit = async (name, price) => {
  const produit = await appeler('/api/products', {
    method: 'POST',
    jeton: T,
    corps: { storeId, categoryId, name, price, status: 'ACTIVE' },
  });
  return produit.donnees.product?.id || produit.donnees.id;
};

const margherita = await creerProduit('Margherita', 11.5);
const diavola = await creerProduit('Diavola', 13);
const tiramisu = await creerProduit('Tiramisu maison', 6);

const cliente = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { conditionsAcceptees: true, email: `c-${uniq}@t.fr`, password: MDP, name: `Cliente ${uniq}` },
});
const TC = cliente.donnees.accessToken;

const commander = async (customerName, items) => {
  const totalAmount = items.reduce((somme, ligne) => somme + ligne.price * ligne.quantity, 0);
  const reponse = await appeler('/api/orders', {
    method: 'POST',
    jeton: TC,
    corps: {
      conditionsAcceptees: true,
      storeId,
      customerName,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'PICKUP',
      totalAmount,
      items,
    },
  });
  return reponse.donnees?.order?.id || reponse.donnees?.id;
};

const accepter = (id, minutes) =>
  appeler(`/api/order-management/${storeId}/${id}/accept`, { method: 'POST', jeton: T, corps: { preparationMinutes: minutes } });
const passerA = (id, status) =>
  appeler(`/api/order-management/${storeId}/${id}/status`, { method: 'PATCH', jeton: T, corps: { status } });

const aRefuser = await commander('Léo P.', [{ productId: diavola, quantity: 1, price: 13 }]);
const aAccepter = await commander('Sarah M.', [
  { productId: margherita, quantity: 2, price: 11.5 },
  { productId: tiramisu, quantity: 1, price: 6 },
]);
const enPreparation = await commander('Nadia K.', [{ productId: diavola, quantity: 2, price: 13 }]);
const acceptee = await commander('Tom R.', [{ productId: margherita, quantity: 1, price: 11.5 }]);
const prete = await commander('Inès B.', [
  { productId: margherita, quantity: 1, price: 11.5 },
  { productId: tiramisu, quantity: 2, price: 6 },
]);
const terminee = await commander('Marc D.', [{ productId: diavola, quantity: 1, price: 13 }]);

check('six commandes passées', [aRefuser, aAccepter, enPreparation, acceptee, prete, terminee].every(Boolean));

await accepter(enPreparation, 20);
await passerA(enPreparation, 'PREPARING');
await accepter(acceptee, 15);
await accepter(prete, 10);
await passerA(prete, 'READY');
await accepter(terminee, 10);
await passerA(terminee, 'COMPLETED');

// Un plat épuisé, et une commande refusée qui ne doit pas compter comme vente.
await appeler(`/api/products/${tiramisu}/availability`, { method: 'PATCH', jeton: T, corps: { isAvailable: false, storeId } });
await appeler(`/api/order-management/${storeId}/${aRefuser}/reject`, { method: 'POST', jeton: T, corps: { motif: 'TOO_BUSY' } });

titre('Les ventes du jour, côté serveur');

const stats = await appeler(`/api/order-management/${storeId}/stats/overview?days=7`, { jeton: T });
const jours = stats.donnees?.parJour || [];
const auj = jours[jours.length - 1];
// Vendues : 23+6, 26, 11,5, 11,5+12, 13 = 103 €, en 5 commandes (la Diavola refusée n'y est pas).
check('sept jours, du plus ancien à aujourd’hui', jours.length === 7, JSON.stringify(jours).slice(0, 200));
check('aujourd’hui : 5 commandes vendues, la refusée exclue', auj?.commandes === 5, JSON.stringify(auj));
check('aujourd’hui : 103 € de ventes', Math.abs((auj?.chiffreAffaires ?? 0) - 103) < 0.001, JSON.stringify(auj));

const nav = await chromium.launch();
const page = await (await nav.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

// La session se connecte comme un vrai navigateur : le jeton de
// renouvellement devient un cookie httpOnly.
await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(
  async ([email, password, s]) => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Transport': 'cookie' },
      body: JSON.stringify({ email, password }),
      credentials: 'same-origin',
    });
    localStorage.setItem('sessionOuverte', '1');
    localStorage.setItem('storeId', s);
  },
  [`m-${uniq}@t.fr`, MDP, storeId]
);

titre('Le tableau de bord');

await page.goto(`${SITE}/merchant/${orgId}/dashboard`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'Ventes des 7 derniers jours' }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
const tableau = await page.locator('main').innerText();
check('les ventes du jour', /Ventes aujourd’hui\s*103,00\s€/.test(tableau), tableau.slice(0, 400));
check('les commandes du jour', /Commandes aujourd’hui\s*5\b/.test(tableau));
check('les commandes en cours sont listées', tableau.includes('Commandes en cours') && tableau.includes(`#${aAccepter.slice(-8).toUpperCase()}`));
check('le plat épuisé est signalé', /Plats épuisés[\s\S]*Tiramisu maison/.test(tableau));

if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/tableau-de-bord.png`, fullPage: true });

await page.getByRole('button', { name: 'Remettre en vente' }).click();
let dispo = false;
for (let i = 0; i < 20 && !dispo; i++) {
  await page.waitForTimeout(250);
  dispo = (await base.product.findUnique({ where: { id: tiramisu }, select: { isAvailable: true } })).isAvailable;
}
check('« Remettre en vente » le remet en vente en base', dispo);
check('et il quitte la carte', (await page.locator('main').innerText()).includes('Tout est en vente.'));

titre('Le catalogue');

await page.goto(`${SITE}/merchant/${orgId}/products`, { waitUntil: 'networkidle' });
await page.getByRole('switch', { name: /Margherita/ }).waitFor({ timeout: 30000 });
check('les catégories servent de sommaire', await page.getByRole('navigation', { name: 'Catégories' }).getByText('Pizzas').isVisible());

await page.getByRole('switch', { name: /Margherita/ }).click();
let epuise = false;
for (let i = 0; i < 20 && !epuise; i++) {
  await page.waitForTimeout(250);
  epuise = !(await base.product.findUnique({ where: { id: margherita }, select: { isAvailable: true } })).isAvailable;
}
check('l’interrupteur passe le plat en épuisé, en base', epuise);
await page.waitForTimeout(1000);
check('et l’interrupteur le montre', (await page.getByRole('switch', { name: /Margherita/ }).getAttribute('aria-checked')) === 'false');

await page.getByRole('button', { name: 'Modifier' }).first().click();
const panneau = page.getByRole('dialog');
await panneau.waitFor();
const textePanneau = await panneau.innerText();
check('le panneau de modification s’ouvre', textePanneau.length > 0);
check('avec les tailles et les suppléments du plat', /Déclinaisons/i.test(textePanneau) && /Suppléments/i.test(textePanneau), textePanneau.slice(0, 300));

if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/catalogue-panneau.png` });

await panneau.getByRole('button', { name: 'Annuler' }).first().click();
if (CAPTURES) {
  await page.screenshot({ path: `${CAPTURES}/catalogue.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${CAPTURES}/catalogue-mobile.png` });
  await page.goto(`${SITE}/merchant/${orgId}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${CAPTURES}/tableau-de-bord-mobile.png`, fullPage: true });
}

await nav.close();
await base.$disconnect();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
process.exit(echecs.length ? 1 : 0);
