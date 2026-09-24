/**
 * Proposition d'une course au livreur, dans un vrai navigateur.
 *
 * Le navigateur est placé à une position fixe : la géolocalisation réelle
 * n'existe pas dans un environnement de test, et c'est la position qui décide
 * à qui la course est proposée.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-courses-livreur.mjs
 */

import { chromium } from 'playwright';
import { validerLivreur } from './outils-livreur.mjs';
import { inscriptionVia, ouvrirToutLeJour } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

// Lyon, place Bellecour : la boutique et le livreur au même endroit.
const POSITION = { latitude: 45.764, longitude: 4.8357 };

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

// ===== Le décor, monté par l'API =====

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` },
});

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` },
});

const T = commercant.donnees.accessToken;
const orgId = commercant.donnees.organization.id;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId,
    name: `Sushi ${uniq}`,
    slug: `sushi-${uniq}`,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    ...POSITION,
  },
});

const storeId = boutique.donnees.store?.id || boutique.donnees.id;
await ouvrirToutLeJour(appeler, storeId, T);

const produit = await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'California', price: 14, status: 'ACTIVE' },
});

const productId = produit.donnees.product?.id || produit.donnees.id;

const motDePasse = 'Password123!';
const emailLivreur = `livreur-${uniq}@t.fr`;

const livreur = await appeler('/api/drivers/register', {
  method: 'POST',
  corps: {
    name: `Livreur ${uniq}`,
    email: emailLivreur,
    password: motDePasse,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  },
});

// Sans validation de la plateforme, l'écran des courses resterait sur le
// dossier en attente : aucune course ne lui serait proposée.
await validerLivreur(API, livreur.donnees.accessToken, plateforme.donnees.accessToken);

// ===== Le navigateur =====

const nav = await chromium.launch();
const contexte = await nav.newContext({
  permissions: ['geolocation'],
  geolocation: { latitude: POSITION.latitude, longitude: POSITION.longitude },
});

const page = await contexte.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

titre('Connexion du livreur');
await page.goto(`${SITE}/driver/login`);
await page.fill('input[type="email"]', emailLivreur);
await page.fill('input[type="password"]', motDePasse);
await page.click('button[type="submit"]');
await page.waitForURL('**/driver', { timeout: 15000 });
check('le livreur arrive sur son espace', page.url().endsWith('/driver'), page.url());

await page.waitForTimeout(3000);

titre('Passage en ligne');
// Un livreur qui vient de s'inscrire est hors ligne : c'est lui qui décide de
// prendre des courses.
const horsLigne = await page.locator('body').innerText();
check('il démarre hors ligne', /Hors ligne/.test(horsLigne), horsLigne.slice(0, 400));

await page.locator('button', { hasText: 'Hors ligne' }).first().click();
await page.waitForTimeout(2500);

const enLigne = await page.locator('body').innerText();
check('le bouton le met en ligne', /En ligne/.test(enLigne), enLigne.slice(0, 400));

const corps = enLigne;
check('le bloc des courses proposées est présent', corps.includes('Courses proposées'), corps.slice(0, 200));
check('il annonce l\'attente', /En attente d'une course/i.test(corps), corps.slice(0, 300));

titre('La position part toute seule');
// Le navigateur est autorisé et positionné : le composant doit l'avoir envoyée.
await page.waitForTimeout(2500);

const connexion = await appeler('/api/auth/login', {
  method: 'POST',
  corps: { email: emailLivreur, password: motDePasse },
});
const jetonLivreur = connexion.donnees.accessToken;

const profil = await appeler('/api/drivers/me', { jeton: jetonLivreur });
const position = profil.donnees?.data;

check(
  'la position du livreur est connue du serveur',
  Math.abs(Number(position?.latitude) - POSITION.latitude) < 0.01,
  `latitude=${position?.latitude}`
);

titre('Une commande cherche un livreur');
const commande = await appeler('/api/orders', {
  method: 'POST',
  corps: {
    storeId,
    customerName: 'Client Test',
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '20 rue de la Ré',
    deliveryCity: 'Lyon',
    deliveryPostal: '69002',
    totalAmount: 14,
    items: [{ productId, quantity: 1, price: 14 }],
  },
});

const orderId = commande.donnees.order?.id || commande.donnees.id;

const recherche = await appeler(`/api/orders/${orderId}/dispatch`, { method: 'POST', jeton: T });
check('la course est proposée', recherche.donnees?.data?.propose === true, JSON.stringify(recherche.donnees));

titre('La proposition apparaît à l\'écran');
// Le relevé périodique tourne toutes les dix secondes.
await page.waitForTimeout(11000);

const avecCourse = await page.locator('body').innerText();
check('la boutique est affichée', avecCourse.includes(`Sushi ${uniq}`), avecCourse.slice(0, 400));
check('l\'adresse de livraison est affichée', avecCourse.includes('20 rue de la Ré'), avecCourse.slice(0, 400));
check('une rémunération est affichée', /\d+[,.]\d{2}\s*€/.test(avecCourse), avecCourse.slice(0, 400));
check('un compte à rebours tourne', /\d+s/.test(avecCourse), avecCourse.slice(0, 400));

const accepter = page.getByRole('button', { name: /^(✓ )?Accepter$/ });
const refuser = page.getByRole('button', { name: 'Refuser', exact: true });
check(
  'les deux réponses sont proposées',
  (await accepter.count()) === 1 && (await refuser.count()) === 1,
  `accepter=${await accepter.count()} refuser=${await refuser.count()}`
);

titre('Acceptation depuis l\'écran');
await accepter.first().click();
await page.waitForTimeout(3000);

const course = await appeler(`/api/drivers/deliveries?status=ACCEPTED`, { jeton: jetonLivreur });
const acceptee = (course.donnees?.data || [])[0];
check('la course est attribuée au livreur', !!acceptee, JSON.stringify(course.donnees)?.slice(0, 200));

check(
  'la proposition disparaît de l\'écran',
  (await page.getByRole('button', { name: /^(✓ )?Accepter$/ }).count()) === 0
);

// La course acceptée ne doit plus traîner dans la liste des courses libres.
const libres = await appeler('/api/drivers/deliveries?status=PENDING', { jeton: jetonLivreur });
check(
  'elle quitte les courses à prendre',
  (libres.donnees?.data || []).length === 0,
  `n=${libres.donnees?.data?.length}`
);

const vraiesErreurs = erreurs.filter((e) => !/favicon|Failed to load resource|404/i.test(e));
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
