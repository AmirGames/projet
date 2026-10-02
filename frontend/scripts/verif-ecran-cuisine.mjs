/**
 * L'écran des commandes du commerçant, en colonnes.
 *
 * Les commandes en cours se rangent dans la bonne colonne (à accepter, en
 * préparation, prêtes), et chaque bouton fait avancer la commande en base :
 * accepter avec un temps de préparation, lancer la préparation, marquer
 * prête, remettre au client, refuser avec un motif. L'API n'accepte comme
 * filtre que des statuts connus.
 *
 *   DATABASE_URL=... VERIF_SITE_URL=http://localhost:3000 \
 *   VERIF_API_URL=http://localhost:3001 node scripts/verif-ecran-cuisine.mjs
 *
 * VERIF_CAPTURES=<dossier> enregistre en plus des captures de l'écran.
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

// ===== Le filtre de l'API =====

titre('L’API filtre sur plusieurs statuts, et seulement des statuts connus');

const filtre = await appeler(`/api/order-management/${storeId}?status=PENDING,ACCEPTED,PREPARING,READY`, { jeton: T });
const statutsRecus = (filtre.donnees?.data || []).map((c) => c.status).sort();
check(
  'les cinq commandes en cours, sans la terminée',
  filtre.statut === 200 && statutsRecus.join(',') === 'ACCEPTED,PENDING,PENDING,PREPARING,READY',
  `${filtre.statut} ${statutsRecus.join(',')}`
);

const unSeul = await appeler(`/api/order-management/${storeId}?status=COMPLETED`, { jeton: T });
check('un seul statut marche comme avant', unSeul.statut === 200 && unSeul.donnees?.total === 1, `${unSeul.statut} ${unSeul.donnees?.total}`);

const inconnu = await appeler(`/api/order-management/${storeId}?status=PENDING,PAYE`, { jeton: T });
check('un statut inconnu est refusé (400)', inconnu.statut === 400, `${inconnu.statut}`);

// Un autre commerçant ne lit pas ces commandes en changeant l'identifiant.
const autre = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m2-${uniq}@t.fr`, password: MDP, name: `Autre ${uniq}` },
});
const intrus = await appeler(`/api/order-management/${storeId}?status=PENDING,READY`, { jeton: autre.donnees.accessToken });
check('un autre commerçant est refusé', intrus.statut === 403 || intrus.statut === 404, `${intrus.statut}`);

// ===== L'écran =====

titre('Chaque commande est dans sa colonne');

const nav = await chromium.launch();
const page = await (await nav.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
// La session se connecte comme un vrai navigateur : le jeton de
// renouvellement devient un cookie httpOnly, et l'appli en tire son jeton
// d'accès. Poser un jeton dans localStorage ne suffit plus.
await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded' });
const connexion = await page.evaluate(
  async ([email, password, s]) => {
    const reponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Transport': 'cookie' },
      body: JSON.stringify({ email, password }),
      credentials: 'same-origin',
    });
    localStorage.setItem('sessionOuverte', '1');
    localStorage.setItem('storeId', s);
    return reponse.status;
  },
  [`m-${uniq}@t.fr`, MDP, storeId]
);
check('le commerçant se connecte dans le navigateur', connexion === 200, `${connexion}`);
await page.goto(`${SITE}/merchant/${orgId}/orders`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'À accepter' }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

const colonne = (nom) => page.locator('section', { has: page.getByRole('heading', { name: nom, exact: true }) });
const numero = (id) => `#${id.slice(-8).toUpperCase()}`;
const contient = async (nom, id) => (await colonne(nom).innerText()).includes(numero(id));

check('à accepter : les deux nouvelles', (await contient('À accepter', aAccepter)) && (await contient('À accepter', aRefuser)));
check('en préparation : l’acceptée et celle en cours', (await contient('En préparation', enPreparation)) && (await contient('En préparation', acceptee)));
check('prêtes : la prête', await contient('Prêtes', prete));
check('la terminée n’est dans aucune colonne', !(await page.locator('main').innerText()).includes(numero(terminee)));
check('le total des terminées du jour', /Terminées aujourd’hui\s*1 ·/.test(await colonne('Prêtes').innerText()), await colonne('Prêtes').innerText());

if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/cuisine-desktop.png`, fullPage: true });

const statutEnBase = async (id) => (await base.order.findUnique({ where: { id }, select: { status: true } })).status;
const attendreStatut = async (id, attendu) => {
  for (let i = 0; i < 20; i++) {
    if ((await statutEnBase(id)) === attendu) return attendu;
    await page.waitForTimeout(250);
  }
  return statutEnBase(id);
};
const carte = (id) => page.locator('article', { hasText: numero(id) });

titre('Accepter avec un temps de préparation');

await carte(aAccepter).getByRole('button', { name: '30 minutes' }).click();
await carte(aAccepter).getByRole('button', { name: 'Accepter · 30 min' }).click();
check('la commande est acceptée en base', (await attendreStatut(aAccepter, 'ACCEPTED')) === 'ACCEPTED');
const fiche = await base.order.findUnique({ where: { id: aAccepter }, select: { preparationMinutes: true } });
check('avec les 30 minutes choisies', fiche?.preparationMinutes === 30, `${fiche?.preparationMinutes}`);
await page.waitForTimeout(1500);
check('elle passe dans « En préparation »', await contient('En préparation', aAccepter));

titre('Faire avancer jusqu’à la remise');

await carte(aAccepter).getByRole('button', { name: 'Lancer la préparation' }).click();
check('lancée', (await attendreStatut(aAccepter, 'PREPARING')) === 'PREPARING');
await page.waitForTimeout(1000);
await carte(aAccepter).getByRole('button', { name: 'Marquer prête' }).click();
check('prête', (await attendreStatut(aAccepter, 'READY')) === 'READY');
await page.waitForTimeout(1500);
check('elle passe dans « Prêtes »', await contient('Prêtes', aAccepter));
await carte(aAccepter).getByRole('button', { name: 'Client servi' }).click();
check('remise', (await attendreStatut(aAccepter, 'COMPLETED')) === 'COMPLETED');
await page.waitForTimeout(1500);
check('elle quitte l’écran', !(await page.locator('main').innerText()).includes(numero(aAccepter)));

titre('Refuser avec un motif');

await carte(aRefuser).getByRole('button', { name: 'Refuser' }).click();
const confirmer = carte(aRefuser).getByRole('button', { name: 'Confirmer le refus' });
check('sans motif, le refus attend', await confirmer.isDisabled());
await carte(aRefuser).getByRole('button', { name: 'Trop occupé' }).click();
await confirmer.click();
check('refusée en base', (await attendreStatut(aRefuser, 'REJECTED')) === 'REJECTED');
const refus = await base.order.findUnique({ where: { id: aRefuser }, select: { rejectionReason: true } });
check('avec le motif choisi', refus?.rejectionReason === 'TOO_BUSY', `${refus?.rejectionReason}`);

titre('L’historique');

await page.getByRole('tab', { name: 'Historique' }).click();
await page.waitForTimeout(2000);
const historique = await page.locator('main').innerText();
check('les commandes terminées et refusées y sont', historique.includes(numero(terminee)) && historique.includes(numero(aRefuser)));
check('le motif du refus est rappelé', historique.includes('Trop occupé'));

if (CAPTURES) {
  await page.screenshot({ path: `${CAPTURES}/cuisine-historique.png`, fullPage: true });
  await page.getByRole('tab', { name: 'En cours' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${CAPTURES}/cuisine-mobile.png`, fullPage: true });
}

await nav.close();
await base.$disconnect();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
process.exit(echecs.length ? 1 : 0);
