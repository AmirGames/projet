/**
 * Le catalogue, le support et l'espace plateforme suivent en direct.
 *
 * Ces écrans chargeaient leurs données une fois, à l'ouverture. Deux personnes
 * sur le même menu s'écrasaient sans le savoir, la vitrine gardait au panier
 * un plat retiré ou à l'ancien prix, une réponse du support n'arrivait qu'au
 * rechargement, et la file des livreurs à valider ne bougeait pas.
 *
 *   DATABASE_URL=... VERIF_SITE_URL=http://localhost:3000 \
 *   VERIF_API_URL=http://localhost:3001 node scripts/verif-catalogue-support-direct.mjs
 *
 * Sur une base vide : le premier compte inscrit doit être la plateforme.
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

/** Attend qu'une condition sur la page devienne vraie, ou abandonne. */
const attendre = async (page, condition, delaiMs = 6000) => {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (await condition()) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

// ===== Le décor =====

const plateforme = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `Plateforme ${uniq}` },
});
const TP = plateforme.donnees.accessToken;

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `Marchand ${uniq}` },
});
const T = commercant.donnees.accessToken;
const orgId = commercant.donnees.organization.id;

const slug = `bistrot-${uniq}`;
const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: { orgId, name: `Bistrot ${uniq}`, slug, phone: '0400000000' },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;
await ouvrirToutLeJour(appeler, storeId, T);
await base.store.update({ where: { id: storeId }, data: { isOpen: true } });

const categorie = await appeler('/api/categories', { method: 'POST', jeton: T, corps: { storeId, name: `Plats ${uniq}` } });
const categoryId = categorie.donnees.category?.id || categorie.donnees.id;

const creerPlat = async (nom, prix) => {
  const reponse = await appeler('/api/products', {
    method: 'POST',
    jeton: T,
    corps: { storeId, categoryId, name: nom, price: prix, status: 'ACTIVE' },
  });
  return reponse.donnees?.product?.id || reponse.donnees?.id;
};

const platA = `Lasagnes ${uniq}`;
const idA = await creerPlat(platA, 10);

const nav = await chromium.launch();

const ouvrir = async (jeton, chemin, panier = null) => {
  const page = await (await nav.newContext()).newPage();
  await page.addInitScript(
    ([t, s, p]) => {
      if (t) localStorage.setItem('accessToken', t);
      localStorage.setItem('storeId', s);
      if (p) localStorage.setItem('zupone-paniers', p);
    },
    [jeton, storeId, panier]
  );
  await page.goto(SITE + chemin, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return page;
};

const contient = (page, texte) => async () => (await page.locator('body').innerText()).includes(texte);

// ===== Le catalogue =====

titre('Le catalogue du commerçant');

const pProduits = await ouvrir(T, `/merchant/${orgId}/products`);
const pCategories = await ouvrir(T, `/merchant/${orgId}/categories`);

// Un visiteur anonyme, avec deux lasagnes au panier.
const panier = JSON.stringify({
  [storeId]: {
    storeId,
    storeName: `Bistrot ${uniq}`,
    lignes: [{ productId: idA, name: platA, price: 10, quantity: 2 }],
    majA: new Date().toISOString(),
  },
});
const pVitrine = await ouvrir(null, `/store/${slug}`, panier);
check('la vitrine affiche le plat', await contient(pVitrine, platA)());

const platB = `Tiramisu ${uniq}`;
await creerPlat(platB, 6);

check('un plat ajouté par un collègue apparaît chez le commerçant', await attendre(pProduits, contient(pProduits, platB)));
check('et sur la vitrine, pour le visiteur', await attendre(pVitrine, contient(pVitrine, platB)));

const nouvelleCategorie = `Desserts ${uniq}`;
await appeler('/api/categories', { method: 'POST', jeton: T, corps: { storeId, name: nouvelleCategorie } });
check('une catégorie ajoutée ailleurs apparaît', await attendre(pCategories, contient(pCategories, nouvelleCategorie)));

const lignesDuPanier = () =>
  pVitrine.evaluate((s) => JSON.parse(localStorage.getItem('zupone-paniers') || '{}')[s]?.lignes || [], storeId);

const miseAJour = await appeler(`/api/products/${idA}`, { method: 'PUT', jeton: T, corps: { price: 12 } });
check('le prix du plat est changé', miseAJour.statut < 400, JSON.stringify(miseAJour.donnees)?.slice(0, 200));
check(
  'le panier du visiteur prend le nouveau prix, quantité gardée',
  await attendre(pVitrine, async () => {
    const lignes = await lignesDuPanier();
    return lignes.length === 1 && Number(lignes[0].price) === 12 && lignes[0].quantity === 2;
  }),
  JSON.stringify(await lignesDuPanier())
);

await appeler(`/api/products/${idA}`, { method: 'DELETE', jeton: T });
check(
  'un plat supprimé sort du panier du visiteur',
  await attendre(pVitrine, async () => (await lignesDuPanier()).length === 0),
  JSON.stringify(await lignesDuPanier())
);
check(
  'et de la liste du commerçant',
  await attendre(pProduits, async () => !(await contient(pProduits, platA)()))
);

// ===== Le support =====

titre('Les tickets');

const creerTicket = async (sujet) => {
  const reponse = await appeler('/api/support/tickets', {
    method: 'POST',
    jeton: T,
    corps: { orgId, subject: sujet, description: 'Un souci à signaler', priority: 'MEDIUM' },
  });
  return reponse.donnees?.data?.id || reponse.donnees?.ticket?.id || reponse.donnees?.id;
};

const sujet1 = `Imprimante ${uniq}`;
const ticket1 = await creerTicket(sujet1);
check('le commerçant ouvre un ticket', Boolean(ticket1));

const pSupport = await ouvrir(T, `/merchant/${orgId}/support`);
const pTickets = await ouvrir(TP, '/superowner/support-tickets');

// La conversation du ticket, ouverte chez le commerçant.
await pSupport.getByText(sujet1).first().click();
await pSupport.waitForTimeout(1500);

const reponseSupport = `Nous regardons ${uniq}`;
const envoi = await appeler(`/api/superowner/support-tickets/${ticket1}/messages`, {
  method: 'POST',
  jeton: TP,
  corps: { body: reponseSupport },
});
check('la plateforme répond', envoi.statut < 400, JSON.stringify(envoi.donnees)?.slice(0, 200));
check(
  'la réponse apparaît dans la conversation ouverte du commerçant',
  await attendre(pSupport, contient(pSupport, reponseSupport))
);

const sujet2 = `Facture ${uniq}`;
await creerTicket(sujet2);
check('un nouveau ticket apparaît chez la plateforme', await attendre(pTickets, contient(pTickets, sujet2)));

// ===== L'espace plateforme =====

titre('La plateforme');

const pLivreurs = await ouvrir(TP, '/superowner/drivers');
const pOrganisations = await ouvrir(TP, '/superowner/organizations');

const livreur = `Livreur ${uniq}`;
const inscription = await appeler('/api/drivers/register', {
  method: 'POST',
  corps: { name: livreur, email: `l-${uniq}@t.fr`, password: MDP, phone: '0612345678', vehicleType: 'bike' },
});
check('un livreur s’inscrit', inscription.statut < 400, JSON.stringify(inscription.donnees)?.slice(0, 200));
check('il apparaît dans la file des livreurs', await attendre(pLivreurs, contient(pLivreurs, livreur)));

const nouveau = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `n-${uniq}@t.fr`, password: MDP, name: `Nouveau ${uniq}` },
});
const commerce = `Primeur ${uniq}`;
await appeler('/api/organizations', {
  method: 'POST',
  jeton: nouveau.donnees.accessToken,
  corps: { name: commerce, slug: `primeur-${uniq}` },
});
check('un commerce qui s’inscrit apparaît dans la liste', await attendre(pOrganisations, contient(pOrganisations, commerce)));

await nav.close();
await base.$disconnect();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
process.exit(echecs.length ? 1 : 0);
