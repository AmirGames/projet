/**
 * Le fond de carte du suivi de livraison.
 *
 * Le trajet se lisait sur un plan dessiné à la main : un trait, trois repères,
 * et une pastille qui glissait de l'un à l'autre. Un livreur « aux deux tiers »
 * pouvait aussi bien être dans la rue d'à côté qu'à l'autre bout de la ville :
 * le trait était le même.
 *
 * On vérifie ici que le client voit une vraie carte dès que le commerce et son
 * adresse sont situés, que les trois points y sont, que la pastille du livreur
 * bouge quand il avance — sans recharger la page, la position arrive par la
 * socket —, qu'elle disparaît une fois la course remise, et qu'une commande
 * dont l'adresse n'a pas pu être située garde son plan dessiné plutôt qu'un
 * fond vide.
 *
 * Les tuiles d'OpenStreetMap ne sont pas contrôlées : elles appartiennent au
 * fournisseur, et un bac à sable sans accès à Internet ne doit pas faire
 * échouer la suite. Ce qui est contrôlé, c'est ce que le navigateur dessine.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-carte-suivi.mjs
 */

import { chromium } from 'playwright';
import { validerLivreur, codeDeRemise } from './outils-livreur.mjs';
import { inscriptionVia, ouvrirToutLeJour } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

// Lyon : la boutique place Bellecour, le client aux Brotteaux.
const BOUTIQUE = { latitude: 45.764, longitude: 4.8357 };
const CLIENT = { latitude: 45.78, longitude: 4.86 };
const EN_ROUTE = { latitude: 45.7695, longitude: 4.8425 };
const PRESQUE = { latitude: 45.7785, longitude: 4.8585 };

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

const uniq = Date.now().toString(36);
const MDP = 'Password123!';
const emailClient = `client-${uniq}@t.fr`;

// ===== Le décor =====

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` },
});

if (!plateforme.donnees?.accessToken) {
  console.error(`Inscription impossible : ${JSON.stringify(plateforme.donnees)}`);
  console.error('La base doit être vierge : le premier compte inscrit devient la plateforme.');
  process.exit(1);
}

const P = plateforme.donnees.accessToken;

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` },
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
await ouvrirToutLeJour(appeler, storeId, T);

const produit = await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'Burger', price: 13, status: 'ACTIVE' },
});
const productId = produit.donnees.product?.id || produit.donnees.id;

await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailClient, password: MDP, name: `Client ${uniq}` },
});

/** Une commande en livraison, située ou non, confiée à un livreur à elle. */
const courseEnCours = async (suffixe, coordonneesClient) => {
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
      ...(coordonneesClient
        ? { deliveryLat: coordonneesClient.latitude, deliveryLng: coordonneesClient.longitude }
        : {}),
      totalAmount: 13,
      items: [{ productId, quantity: 1, price: 13 }],
    },
  });

  const orderId = commande.donnees.order?.id || commande.donnees.id;

  const livreur = await appeler('/api/drivers/register', {
    method: 'POST',
    corps: {
      name: `Karim ${suffixe}`,
      email: `d-${suffixe}-${uniq}@t.fr`,
      password: MDP,
      phone: '0611111111',
      vehicleType: 'scooter',
      vehiclePlate: 'AB-123-CD',
    },
  });
  const D = livreur.donnees.accessToken;

  await validerLivreur(API, D, P);
  await appeler('/api/drivers/availability', { method: 'PATCH', jeton: D, corps: { isOnline: true } });
  await appeler('/api/drivers/location', { method: 'PATCH', jeton: D, corps: BOUTIQUE });

  await appeler(`/api/orders/${orderId}/dispatch`, { method: 'POST', jeton: T });

  const propositions = await appeler('/api/drivers/offers', { jeton: D });
  const offre = propositions.donnees?.data?.[0];

  if (!offre) {
    console.error(`Aucune course proposée pour ${suffixe} : le décor est incomplet.`);
    process.exit(1);
  }

  await appeler(`/api/drivers/offers/${offre.id}/accept`, { method: 'POST', jeton: D });

  // La position envoyée avant l'acceptation ne se pose que sur le livreur : la
  // course, qui n'existait pas encore, n'en garde rien. C'est celle-ci que le
  // client voit.
  await appeler('/api/drivers/location', { method: 'PATCH', jeton: D, corps: BOUTIQUE });

  return { orderId, D };
};

const situee = await courseEnCours('situee', CLIENT);
// Une adresse que le service n'a pas su situer : la commande part quand même.
const aveugle = await courseEnCours('aveugle', null);

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();

const erreurs = [];
page.on('console', (m) => {
  // Les tuiles d'OpenStreetMap sont hors du projet : un bac à sable sans accès
  // à Internet les refuse, et ce n'est pas un défaut de la page.
  const texte = m.text();
  const dehors = /tile\.openstreetmap|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|net::ERR_|favicon|Failed to load resource|404|RSC payload/i.test(texte);

  if (m.type() === 'error' && !dehors) erreurs.push(texte.slice(0, 200));
});

titre('Le client ouvre le suivi de sa commande');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailClient);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

await page.goto(`${SITE}/client/orders/${situee.orderId}`);
await page.waitForTimeout(5000);

const carte = page.locator('[data-carte-trajet].leaflet-container');
check('le trajet est posé sur une vraie carte', (await carte.count()) === 1, `n=${await carte.count()}`);
check(
  'et non plus sur le plan dessiné',
  (await page.locator('svg[aria-label="Avancement du livreur"]').count()) === 0,
  'le plan est resté'
);

const pastille = (nom) => page.locator(`.leaflet-marker-icon[title="${nom}"]`);

check('le commerce y est situé', (await pastille('Le commerce').count()) === 1);
check('l’adresse du client aussi', (await pastille('Votre adresse').count()) === 1);
check('le livreur également', (await pastille('Le livreur').count()) === 1);

// Deux traits : ce qui est parcouru, et ce qui reste.
const traits = await page.locator('[data-carte-trajet] .leaflet-overlay-pane path').count();
check('le trajet est tracé en deux temps', traits === 2, `n=${traits}`);

titre('Le livreur avance, la carte suit sans recharger');
const avant = await pastille('Le livreur').boundingBox();

await appeler('/api/drivers/location', { method: 'PATCH', jeton: situee.D, corps: EN_ROUTE });
await page.waitForTimeout(3000);

const apres = await pastille('Le livreur').boundingBox();
check(
  'la pastille du livreur s’est déplacée',
  Math.abs(apres.x - avant.x) > 2 || Math.abs(apres.y - avant.y) > 2,
  `${avant.x},${avant.y} → ${apres.x},${apres.y}`
);

// Le cadrage ne se refait pas à chaque position : sinon la carte sauterait
// sous les doigts du client qui vient de la déplacer.
const commerce = await pastille('Le commerce').boundingBox();
await appeler('/api/drivers/location', { method: 'PATCH', jeton: situee.D, corps: PRESQUE });
await page.waitForTimeout(3000);

const commerceApres = await pastille('Le commerce').boundingBox();
check(
  'la carte ne se recadre pas sous les doigts',
  Math.abs(commerceApres.x - commerce.x) < 2 && Math.abs(commerceApres.y - commerce.y) < 2,
  `${commerce.x},${commerce.y} → ${commerceApres.x},${commerceApres.y}`
);

titre('Une fois remise, le livreur quitte la carte');
const course = await appeler('/api/drivers/deliveries?status=ACCEPTED', { jeton: situee.D });
const deliveryId = course.donnees.data[0].id;

await appeler(`/api/drivers/deliveries/${deliveryId}`, {
  method: 'PATCH',
  jeton: situee.D,
  corps: { status: 'PICKED_UP' },
});
await appeler(`/api/drivers/deliveries/${deliveryId}`, {
  method: 'PATCH',
  jeton: situee.D,
  corps: { status: 'DELIVERED', code: await codeDeRemise(API, situee.orderId) },
});

await page.reload();
await page.waitForTimeout(5000);

check('la carte reste affichée', (await carte.count()) === 1, `n=${await carte.count()}`);
check(
  'la pastille du livreur a disparu',
  (await pastille('Le livreur').count()) === 0,
  'le livreur est encore en route sur la carte'
);
check('les deux extrémités restent', (await pastille('Votre adresse').count()) === 1);

titre('Une adresse non située garde son plan dessiné');
await page.goto(`${SITE}/client/orders/${aveugle.orderId}`);
await page.waitForTimeout(5000);

const texteAveugle = await page.locator('body').innerText();
check('le suivi s’affiche quand même', texteAveugle.includes('Suivi de la livraison'), texteAveugle.slice(0, 300));
check(
  'le plan dessiné prend le relais',
  (await page.locator('svg[aria-label="Avancement du livreur"]').count()) === 1,
  'plan absent'
);
check(
  'et aucune carte vide ne s’affiche',
  (await page.locator('[data-carte-trajet]').count()) === 0,
  'une carte sans points est affichée'
);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
