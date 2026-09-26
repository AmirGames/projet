/**
 * Les écrans de commandes suivent en direct, sans recharger.
 *
 * Chaque écran chargeait ses commandes une fois, à l'ouverture : la cliente ne
 * voyait pas sa commande acceptée, le commerçant ne voyait pas le refus
 * automatique d'une commande restée sans réponse. Le serveur annonce
 * désormais toute écriture sur une commande — y compris celles des tâches de
 * fond, qui ne passent par aucune requête — et les écrans se relisent.
 *
 *   DATABASE_URL=... VERIF_SITE_URL=http://localhost:3000 \
 *   VERIF_API_URL=http://localhost:3001 node scripts/verif-commandes-direct.mjs
 *
 * La tâche de fond passe toutes les trente secondes : compter une minute.
 */

import { chromium } from 'playwright';
import { inscriptionVia, ouvrirToutLeJour, baseDeDonnees } from './inscription.mjs';

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
const MDP = 'Password123!';
const base = baseDeDonnees();

// ===== Le décor =====

await appeler('/api/auth/signup', { method: 'POST', corps: { conditionsAcceptees: true, email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` } });

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `Marchand ${uniq}` },
});
const T = commercant.donnees.accessToken;
const orgId = commercant.donnees.organization.id;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: { orgId, name: `Bistrot ${uniq}`, slug: `bistrot-${uniq}`, phone: '0400000000' },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;
await ouvrirToutLeJour(appeler, storeId, T);
await base.store.update({ where: { id: storeId }, data: { isOpen: true } });

const categorie = await appeler('/api/categories', { method: 'POST', jeton: T, corps: { storeId, name: `Plats ${uniq}` } });
const produit = await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: {
    storeId,
    categoryId: categorie.donnees.category?.id || categorie.donnees.id,
    name: `Plat ${uniq}`,
    price: 10,
    status: 'ACTIVE',
  },
});
const productId = produit.donnees.product?.id || produit.donnees.id;

const cliente = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { conditionsAcceptees: true, email: `c-${uniq}@t.fr`, password: MDP, name: `Cliente ${uniq}` },
});
const TC = cliente.donnees.accessToken;

const commander = async () => {
  const reponse = await appeler('/api/orders', {
    method: 'POST',
    jeton: TC,
    corps: { conditionsAcceptees: true,
      storeId,
      customerName: 'Cliente',
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'PICKUP',
      totalAmount: 10,
      items: [{ productId, quantity: 1, price: 10 }],
    },
  });
  return reponse.donnees?.order?.id || reponse.donnees?.id;
};

const acceptee = await commander();
const oubliee = await commander();
check('deux commandes passées', Boolean(acceptee && oubliee));

// ===== Les écrans ouverts =====

const nav = await chromium.launch();

const ouvrir = async (jeton, chemin) => {
  const page = await (await nav.newContext()).newPage();
  await page.addInitScript(
    ([t, s]) => {
      localStorage.setItem('accessToken', t);
      localStorage.setItem('storeId', s);
    },
    [jeton, storeId]
  );
  await page.goto(SITE + chemin, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  return page;
};

const texte = (page) => page.locator('body').innerText();
const enAttente = async (page) => ((await texte(page)).match(/En attente/g) || []).length;

const pCliente = await ouvrir(TC, '/client/orders');
const pFiche = await ouvrir(T, `/merchant/${orgId}/orders/${oubliee}`);
const pListe = await ouvrir(T, `/merchant/${orgId}/orders`);

const depart = await enAttente(pCliente);
check('la cliente voit ses deux commandes en attente', depart === 2, `${depart}`);

titre('Le commerçant accepte, depuis un autre appareil');

const acceptation = await appeler(`/api/order-management/${storeId}/${acceptee}/accept`, {
  method: 'POST',
  jeton: T,
  corps: { preparationMinutes: 15 },
});
check('la commande est acceptée', acceptation.statut < 400, JSON.stringify(acceptation.donnees)?.slice(0, 200));

await pCliente.waitForTimeout(2000);
check('la liste de la cliente suit, sans recharger', (await enAttente(pCliente)) === 1, `${await enAttente(pCliente)}`);

titre('Une commande restée sans réponse est refusée par la tâche de fond');

// Vieillie en base : la tâche de fond la refuse à son prochain passage. Elle
// compte depuis l'envoi de la commande (submittedAt), pas depuis sa création.
const ilYaDeuxHeures = new Date(Date.now() - 2 * 60 * 60 * 1000);
await base.order.update({
  where: { id: oubliee },
  data: { createdAt: ilYaDeuxHeures, submittedAt: ilYaDeuxHeures },
});

const ficheAvant = await texte(pFiche);
let statut = 'PENDING';
for (let seconde = 0; seconde < 45 && statut === 'PENDING'; seconde++) {
  await pFiche.waitForTimeout(1000);
  statut = (await base.order.findUnique({ where: { id: oubliee }, select: { status: true } })).status;
}
check('la tâche de fond l’a refusée', statut !== 'PENDING', statut);

await pFiche.waitForTimeout(2000);
check('la fiche du commerçant a changé d’elle-même', (await texte(pFiche)) !== ficheAvant);
check('la cliente n’a plus rien en attente', (await enAttente(pCliente)) === 0, `${await enAttente(pCliente)}`);
check(
  'la liste du commerçant n’annonce plus de commande à accepter',
  !(await texte(pListe)).includes('à accepter'),
  (await texte(pListe)).slice(0, 200)
);

await nav.close();
await base.$disconnect();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
process.exit(echecs.length ? 1 : 0);
