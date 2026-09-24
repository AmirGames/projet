/**
 * Le parcours du livreur et la preuve de la remise, des deux côtés de l'écran.
 *
 * Côté livreur : la prise en charge qui ne se déverrouille qu'au commerce et
 * se valide en glissant, le GPS qui part vers le client, le code qui se
 * vérifie seul au quatrième chiffre, et la photo du dépôt prise avec
 * l'appareil quand le client est absent.
 *
 * Côté client : le code à quatre chiffres qu'il donne à la porte, l'annonce
 * « bientôt là » à 300 m, et la photo du dépôt.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-preuve-livraison.mjs
 */

import { chromium } from 'playwright';
import { validerLivreur, codeDeRemise } from './outils-livreur.mjs';
import { inscriptionVia, ouvrirToutLeJour } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';
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

const emailPlateforme = `p-${uniq}@t.fr`;
const emailLivreur = `livreur-${uniq}@t.fr`;

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailPlateforme, password: MDP, name: `Plateforme ${uniq}` },
});
const TP = plateforme.donnees?.accessToken;

if (!TP) {
  console.error(`Inscription de la plateforme impossible : ${JSON.stringify(plateforme.donnees)}`);
  process.exit(1);
}

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

const inscription = await appeler('/api/drivers/register', {
  method: 'POST',
  corps: {
    name: `Karim ${uniq}`,
    email: emailLivreur,
    password: MDP,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  },
});
const D = inscription.donnees.accessToken;

await validerLivreur(API, D, TP);
await appeler('/api/drivers/availability', { method: 'PATCH', jeton: D, corps: { isOnline: true } });
await appeler('/api/drivers/location', { method: 'PATCH', jeton: D, corps: POSITION });

/** Une course acceptée et récupérée : le livreur est au seuil. */
async function courseAuSeuil({ recuperee = true } = {}) {
  const commande = await appeler('/api/orders', {
    method: 'POST',
    corps: {
      storeId,
      customerName: `Client ${uniq}`,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'DELIVERY',
      deliveryAddress: '12 avenue Thiers',
      deliveryCity: 'Lyon',
      deliveryLat: 45.78,
      deliveryLng: 4.86,
      totalAmount: 14,
      feesAmount: 3,
      items: [{ productId, quantity: 1, price: 14 }],
    },
  });

  const orderId = commande.donnees.order?.id || commande.donnees.id;
  const attribution = await appeler(`/api/orders/${orderId}/dispatch`, { method: 'POST', jeton: T });
  const courseId = attribution.donnees?.data?.deliveryId;

  await appeler(`/api/drivers/deliveries/${courseId}/accept`, { method: 'PATCH', jeton: D });
  if (recuperee) {
    await appeler(`/api/drivers/deliveries/${courseId}`, {
      method: 'PATCH',
      jeton: D,
      corps: { status: 'PICKED_UP' },
    });
  }

  return { orderId, courseId };
}

// La première course s'arrête à l'acceptation : le livreur doit encore
// rejoindre le commerce.
const premiere = await courseAuSeuil({ recuperee: false });
const code = await codeDeRemise(API, premiere.orderId);

// ===== Côté client : le code =====

const nav = await chromium.launch();
// L'écran du livreur envoie sa position en continu : sans autorisation, il
// journalise une erreur de géolocalisation à chaque essai.
const contexte = await nav.newContext({
  permissions: ['geolocation'],
  geolocation: POSITION,
});

const pageClient = await contexte.newPage();
const erreursClient = [];
// Les tuiles de la carte viennent d'OpenStreetMap : hors réseau, leur échec
// de chargement n'est pas une erreur de la page.
const HORS_RESEAU = /tile\.openstreetmap|net::ERR_/;
pageClient.on('console', (m) => {
  if (m.type() === 'error' && !HORS_RESEAU.test(m.text())) erreursClient.push(m.text());
});

titre('Le client lit son code de remise');
await pageClient.goto(`${SITE}/track?commande=${premiere.orderId}`);
await pageClient.waitForTimeout(3000);

const suivi = await pageClient.locator('body').innerText();
check('le code est annoncé', /code de remise/i.test(suivi), suivi.slice(0, 900));
check('et affiché', code && suivi.includes(code), `code=${code}`);
check(
  'avec la consigne de ne le donner qu’au livreur',
  /à personne d’autre|à personne d&apos;autre|à personne d'autre/i.test(suivi),
  suivi.slice(0, 900)
);

// ===== Côté livreur : la saisie =====

const page = await contexte.newPage();
const erreurs = [];
page.on('console', (m) => {
  // Un code refusé provoque un 400 attendu : c'est le comportement vérifié,
  // pas une erreur de la page.
  if (m.type() === 'error' && !/400/.test(m.text()) && !HORS_RESEAU.test(m.text())) erreurs.push(m.text());
});

titre('Loin du commerce, la prise en charge reste verrouillée');
// Un kilomètre au nord du commerce.
await contexte.setGeolocation({ latitude: POSITION.latitude + 0.009, longitude: POSITION.longitude });

await page.goto(`${SITE}/driver/login`);
await page.fill('input[type="email"]', emailLivreur);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL('**/driver', { timeout: 15000 });
// Laisser l'espace livreur finir ses appels : naviguer pendant qu'un fetch est
// en vol l'interrompt, et la page journalise l'interruption comme une erreur.
await page.waitForTimeout(3000);

await page.goto(`${SITE}/driver/deliveries/${premiere.courseId}`);
await page.waitForTimeout(3000);

const enRoute = await page.locator('body').innerText();
check('la distance au commerce est dite', /Encore \d/.test(enRoute), enRoute.slice(0, 900));
check(
  'le curseur est verrouillé',
  (await page.locator('[role="button"][aria-label="Arrivez au commerce pour déverrouiller"]').getAttribute('aria-disabled')) === 'true'
);
check('pas de prise en charge possible', !/Glisser pour prendre en charge/.test(enRoute), enRoute.slice(0, 900));

titre('Au commerce, elle se déverrouille');
await contexte.setGeolocation(POSITION);
await page.waitForTimeout(3000);

const arrive = await page.locator('body').innerText();
check('l’arrivée est reconnue', /Vous êtes arrivé/.test(arrive), arrive.slice(0, 900));

titre('Glisser prend en charge et lance le GPS vers le client');
const curseur = page.locator('[role="button"][aria-label="Glisser pour prendre en charge"]');
// La page descend d'elle-même jusqu'au curseur à l'arrivée.
await curseur.scrollIntoViewIfNeeded();
check('le curseur est à l’écran', await curseur.isVisible());
const boite = await curseur.boundingBox();
const piste = await curseur.locator('..').boundingBox();
// Hors réseau, la carte de Google ne répond pas : on lui répond à sa place,
// seule l'adresse demandée compte ici.
await contexte.route('https://www.google.com/**', (route) => route.fulfill({ body: 'GPS' }));
const fenetreGps = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);

await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
await page.mouse.down();
await page.mouse.move(piste.x + piste.width - 10, boite.y + boite.height / 2, { steps: 15 });
await page.mouse.up();
await page.waitForTimeout(3000);

const priseEnCharge = await appeler(`/api/drivers/deliveries/${premiere.courseId}`, { jeton: D });
check('la course est prise en charge', priseEnCharge.donnees?.data?.status === 'PICKED_UP', priseEnCharge.donnees?.data?.status);

const gps = await fenetreGps;
check('une fenêtre de navigation s’ouvre', Boolean(gps));
check(
  'vers le client',
  /google\.com\/maps\/dir.*destination=45\.78,4\.86/.test(gps?.url() || ''),
  gps?.url()
);
await gps?.close();

const versClient = await page.locator('body').innerText();
check('la page passe à la route du client', /Allez chez le client/.test(versClient), versClient.slice(0, 900));
check('la preuve de la remise est demandée', /Preuve de la remise/.test(versClient), versClient.slice(0, 900));
// Le code appartient au client : un livreur qui le lit n'a plus rien à prouver.
check('le code n’est pas affiché au livreur', !versClient.includes(code), `code=${code}`);

titre('À 300 m, le client est invité à descendre');
await appeler(`/api/drivers/deliveries/${premiere.courseId}/location`, {
  method: 'PATCH',
  jeton: D,
  corps: { latitude: 45.778, longitude: 4.86 },
});
await pageClient.reload();
await pageClient.waitForTimeout(3000);
const proche = await pageClient.locator('body').innerText();
check('le client lit « bientôt là »', /Votre livreur est bientôt là/.test(proche), proche.slice(0, 900));
check('et qu’il peut descendre', /descendre devant la porte/.test(proche), proche.slice(0, 900));

titre('Un code faux se vérifie seul, et dit pourquoi');
check('plus de bouton « Étape suivante »', (await page.locator('button:has-text("Étape suivante")').count()) === 0);
await page.fill('#code-remise', code === '0000' ? '1111' : '0000');
await page.waitForTimeout(3000);

const refuse = await page.locator('body').innerText();
check('le refus est affiché', /Code incorrect/i.test(refuse), refuse.slice(0, 900));
check('avec les essais restants', /essais restants/i.test(refuse), refuse.slice(0, 900));
check('le champ est vidé pour réessayer', (await page.inputValue('#code-remise')) === '');

const apresFaux = await appeler(`/api/drivers/deliveries/${premiere.courseId}`, { jeton: D });
check('la course reste ouverte', apresFaux.donnees?.data?.status === 'PICKED_UP', apresFaux.donnees?.data?.status);
check('un essai a été consommé', apresFaux.donnees?.data?.essaisRestants === 4, `${apresFaux.donnees?.data?.essaisRestants}`);

titre('Le bon code clôt la course sans autre geste');
await page.fill('#code-remise', code);
await page.waitForTimeout(3000);

const close = await appeler(`/api/drivers/deliveries/${premiere.courseId}`, { jeton: D });
check('la course est livrée', close.donnees?.data?.status === 'DELIVERED', close.donnees?.data?.status);
check('prouvée par le code', close.donnees?.data?.preuve === 'CODE', close.donnees?.data?.preuve);

titre('Le client voit comment sa commande a été remise');
await pageClient.reload();
await pageClient.waitForTimeout(3000);

const apresRemise = await pageClient.locator('body').innerText();
check('la remise est confirmée', /Remise confirmée par votre code/.test(apresRemise), apresRemise.slice(0, 1200));
// Le code n'a plus d'objet : le laisser à l'écran laisserait croire qu'il sert
// encore.
check('le code a disparu', !apresRemise.includes(code), `code=${code}`);

// ===== Le dépôt sans contact =====

titre('Client absent : le livreur photographie le dépôt');
const seconde = await courseAuSeuil();

await page.goto(`${SITE}/driver/deliveries/${seconde.courseId}`);
await page.waitForTimeout(3000);
await page.click('button:has-text("Le client est absent")');
await page.waitForTimeout(800);

check('l’appareil photo est proposé', /Photographier le dépôt/.test(await page.locator('body').innerText()));
check(
  'le champ ouvre l’appareil du téléphone',
  (await page.locator('#photo-depot').getAttribute('capture')) === 'environment'
);
check('et celui du lieu de dépôt', (await page.locator('#note-depot').count()) === 1, 'absent');
check('on ne confirme pas sans photo', await page.locator('button:has-text("Confirmer le dépôt")').isDisabled());

// Un pixel PNG, comme sorti de l'appareil.
await page.setInputFiles('#photo-depot', {
  name: 'depot.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  ),
});
await page.waitForTimeout(3000);
// Chargée pour de bon, et pas seulement posée dans la page : la photo vient
// de l'API, sur une autre origine que le site.
const chargee = (localisateur) =>
  localisateur.evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
check('la photo s’affiche', await chargee(page.locator('img[alt="Photo du dépôt"]')));

await page.fill('#note-depot', 'Devant la porte');
await page.click('button:has-text("Confirmer le dépôt")');
await page.waitForTimeout(3000);

const depot = await appeler(`/api/drivers/deliveries/${seconde.courseId}`, { jeton: D });
check('la course est livrée', depot.donnees?.data?.status === 'DELIVERED', depot.donnees?.data?.status);
check('prouvée par la photo', depot.donnees?.data?.preuve === 'PHOTO', depot.donnees?.data?.preuve);
check(
  'la photo est gardée chez nous',
  (depot.donnees?.data?.photo || '').startsWith(`${API}/uploads/deliveries/`),
  depot.donnees?.data?.photo
);

titre('Le client sait que c’est un dépôt');
await pageClient.goto(`${SITE}/track?commande=${seconde.orderId}`);
await pageClient.waitForTimeout(3000);

const vuDepot = await pageClient.locator('body').innerText();
check(
  'le dépôt en son absence lui est dit',
  /Dépôt confirmé par photo/.test(vuDepot),
  vuDepot.slice(0, 1200)
);
check('et il voit la photo', await chargee(pageClient.locator('img[alt="Photo du dépôt de votre commande"]')));
check('avec le lieu du dépôt', /Devant la porte/.test(vuDepot), vuDepot.slice(0, 1200));

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript côté livreur', erreurs.length === 0, erreurs.join(' | '));
check('aucune erreur JavaScript côté client', erreursClient.length === 0, erreursClient.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
