/**
 * Suivi d'une livraison côté client, dans un vrai navigateur.
 *
 * Vérifie que le client voit où en est sa commande : distance restante, durée
 * estimée, avancement, livreur — et non plus des coordonnées GPS brutes.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-suivi-client.mjs
 */

import { chromium } from 'playwright';
import { validerLivreur, codeDeRemise } from './outils-livreur.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

// Lyon : la boutique place Bellecour, le client un peu plus loin.
const BOUTIQUE = { latitude: 45.764, longitude: 4.8357 };
const CLIENT = { latitude: 45.78, longitude: 4.86 };
const CLIENT_COORDS = { deliveryLat: CLIENT.latitude, deliveryLng: CLIENT.longitude };
const EN_ROUTE = { latitude: 45.772, longitude: 4.848 };

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
const motDePasse = 'Password123!';
const emailClient = `client-${uniq}@t.fr`;

// ===== Le décor =====

const plateforme = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: motDePasse, name: `P ${uniq}` },
});

const commercant = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: motDePasse, name: `M ${uniq}` },
});

const T = commercant.donnees.accessToken;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
    name: `Le Bistrot ${uniq}`,
    slug: `bistrot-${uniq}`,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    ...BOUTIQUE,
  },
});

const storeId = boutique.donnees.store?.id || boutique.donnees.id;

const produit = await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'Burger', price: 13, status: 'ACTIVE' },
});

const productId = produit.donnees.product?.id || produit.donnees.id;

// Le client doit avoir un compte pour suivre sa commande.
const client = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: emailClient, password: motDePasse, name: `Client ${uniq}` },
});

const commande = await appeler('/api/orders', {
  method: 'POST',
  corps: {
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: emailClient,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '12 avenue Thiers',
    deliveryCity: 'Lyon',
    deliveryPostal: '69006',
    ...CLIENT_COORDS,
    totalAmount: 13,
    items: [{ productId, quantity: 1, price: 13 }],
  },
});

const orderId = commande.donnees.order?.id || commande.donnees.id;

// Le livreur, en ligne et positionné près de la boutique.
const livreur = await appeler('/api/drivers/register', {
  method: 'POST',
  corps: {
    name: `Karim ${uniq}`,
    email: `d-${uniq}@t.fr`,
    password: motDePasse,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  },
});

const D = livreur.donnees.accessToken;

// Il ne peut se mettre en ligne qu'une fois son dossier validé.
await validerLivreur(API, D, plateforme.donnees.accessToken);

await appeler('/api/drivers/availability', { method: 'PATCH', jeton: D, corps: { isOnline: true } });
await appeler('/api/drivers/location', { method: 'PATCH', jeton: D, corps: BOUTIQUE });

const recherche = await appeler(`/api/orders/${orderId}/dispatch`, { method: 'POST', jeton: T });
check('une course est proposée', recherche.donnees?.data?.propose === true, JSON.stringify(recherche.donnees));

const propositions = await appeler('/api/drivers/offers', { jeton: D });
await appeler(`/api/drivers/offers/${propositions.donnees.data[0].id}/accept`, { method: 'POST', jeton: D });

// La destination du client est renseignée par le commerçant à la préparation.
await appeler(`/api/orders/${orderId}/dispatch`, { method: 'POST', jeton: T });

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

titre('Connexion du client');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailClient);
await page.fill('input[type="password"]', motDePasse);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

await page.goto(`${SITE}/client/orders/${orderId}`);
await page.waitForTimeout(3500);

const suivi = await page.locator('body').innerText();
check('la page de suivi s\'ouvre', suivi.includes('Suivi de la livraison'), suivi.slice(0, 300));

titre('Ce que le client comprend');
check('l\'état de la course est en français', /Livreur en route|Commande récupérée/i.test(suivi), suivi.slice(0, 400));
check('le commerce de départ est nommé', suivi.includes(`Le Bistrot ${uniq}`), suivi.slice(0, 400));
check('l\'adresse de livraison est rappelée', suivi.includes('12 avenue Thiers'), suivi.slice(0, 400));
check('le livreur est présenté', suivi.includes(`Karim ${uniq}`), suivi.slice(0, 400));

check(
  'plus aucune coordonnée GPS brute',
  !/\d{2}\.\d{4},\s*\d\.\d{4}/.test(suivi),
  (suivi.match(/\d{2}\.\d{4},\s*\d\.\d{4}/) || [''])[0]
);

titre('Le livreur avance');
await appeler('/api/drivers/location', { method: 'PATCH', jeton: D, corps: EN_ROUTE });
await page.reload();
await page.waitForTimeout(3500);

const enRoute = await page.locator('body').innerText();
check('une distance restante est affichée', /\d+([,.]\d+)?\s*(km|m)\b/.test(enRoute), enRoute.slice(0, 400));
check('une durée estimée est affichée', /\d+\s*min/.test(enRoute), enRoute.slice(0, 400));
check('la fraîcheur de la position est indiquée', /à l.instant|il y a/i.test(enRoute), enRoute.slice(0, 400));

// Le plan du trajet : trois repères, pas un fond de carte.
const plan = page.locator('svg[aria-label="Avancement du livreur"]');
check('le plan du trajet est dessiné', (await plan.count()) === 1, `n=${await plan.count()}`);

titre('Livraison terminée');
const course = await appeler('/api/drivers/deliveries?status=ACCEPTED', { jeton: D });
const deliveryId = course.donnees.data[0].id;

await appeler(`/api/drivers/deliveries/${deliveryId}`, { method: 'PATCH', jeton: D, corps: { status: 'PICKED_UP' } });
// La remise se prouve par le code du client, sans quoi la course reste ouverte.
await appeler(`/api/drivers/deliveries/${deliveryId}`, {
  method: 'PATCH',
  jeton: D,
  corps: { status: 'DELIVERED', code: await codeDeRemise(API, orderId) },
});

await page.reload();
await page.waitForTimeout(3500);

const livree = await page.locator('body').innerText();
check('la livraison est annoncée terminée', /Livrée/i.test(livree), livree.slice(0, 400));
check('plus de durée estimée une fois livrée', !/estimé/i.test(livree), livree.slice(0, 400));

const vraiesErreurs = erreurs.filter(
  (e) => e.startsWith('/client') && !/favicon|Failed to load resource|404|RSC payload/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
