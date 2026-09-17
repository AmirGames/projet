/**
 * La note du livreur.
 *
 * `Driver.rating` valait 5,00 pour tout le monde : c'était la valeur par défaut
 * de la colonne, et aucune route ne l'écrivait. Le livreur lisait « 5 » sur son
 * tableau de bord le jour de son inscription, la plateforme classait ses
 * livreurs sur un chiffre identique pour tous, et le client qui avait attendu
 * une heure n'avait nulle part où le dire.
 *
 * On vérifie ici qu'un livreur jamais noté n'a pas de note, que le client note
 * son livreur depuis le suivi de sa commande, que la moyenne bouge vraiment,
 * et surtout ce qui est refusé : noter avant la remise, noter deux fois, noter
 * la course d'un autre, ou donner une note hors barème.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-note-livreur.mjs
 */

import { chromium } from 'playwright';
import { validerLivreur, codeDeRemise } from './outils-livreur.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const BOUTIQUE = { latitude: 45.764, longitude: 4.8357 };
const CLIENT = { latitude: 45.78, longitude: 4.86 };

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

const plateforme = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` },
});

if (!plateforme.donnees?.accessToken) {
  console.error(`Inscription impossible : ${JSON.stringify(plateforme.donnees)}`);
  console.error('La base doit être vierge : le premier compte inscrit devient la plateforme.');
  process.exit(1);
}

const P = plateforme.donnees.accessToken;

const commercant = await appeler('/api/auth/signup', {
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

const produit = await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'Burger', price: 13, status: 'ACTIVE' },
});
const productId = produit.donnees.product?.id || produit.donnees.id;

const client = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: emailClient, password: MDP, name: `Client ${uniq}` },
});
const C = client.donnees.accessToken;

// Un seul livreur pour toutes les courses : c'est sa moyenne qu'on regarde.
const livreur = await appeler('/api/drivers/register', {
  method: 'POST',
  corps: {
    name: `Karim ${uniq}`,
    email: `d-${uniq}@t.fr`,
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

/** Une commande confiée au livreur, remise ou non. */
const course = async ({ remettre }) => {
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
      deliveryLat: CLIENT.latitude,
      deliveryLng: CLIENT.longitude,
      totalAmount: 13,
      items: [{ productId, quantity: 1, price: 13 }],
    },
  });

  const orderId = commande.donnees.order?.id || commande.donnees.id;

  await appeler('/api/drivers/availability', { method: 'PATCH', jeton: D, corps: { isOnline: true } });
  await appeler(`/api/orders/${orderId}/dispatch`, { method: 'POST', jeton: T });

  const offres = await appeler('/api/drivers/offers', { jeton: D });
  const offre = offres.donnees?.data?.[0];

  if (!offre) {
    console.error('Aucune course proposée : le décor est incomplet.');
    process.exit(1);
  }

  await appeler(`/api/drivers/offers/${offre.id}/accept`, { method: 'POST', jeton: D });

  const acceptees = await appeler('/api/drivers/deliveries?status=ACCEPTED', { jeton: D });
  const deliveryId = acceptees.donnees.data[0].id;

  if (remettre) {
    await appeler(`/api/drivers/deliveries/${deliveryId}`, {
      method: 'PATCH',
      jeton: D,
      corps: { status: 'PICKED_UP' },
    });
    await appeler(`/api/drivers/deliveries/${deliveryId}`, {
      method: 'PATCH',
      jeton: D,
      corps: { status: 'DELIVERED', code: await codeDeRemise(API, orderId) },
    });
  }

  return { orderId, deliveryId };
};

// ===== Avant toute note =====

titre('Un livreur jamais noté n’a pas de note');

const profil = await appeler('/api/drivers/me', { jeton: D });
check('son tableau de bord n’annonce pas 5 sur 5', profil.donnees?.data?.rating === null, `${profil.donnees?.data?.rating}`);
check('et compte zéro avis', profil.donnees?.data?.avis === 0, `${profil.donnees?.data?.avis}`);

const revenus = await appeler('/api/drivers/earnings', { jeton: D });
check('l’écran des revenus non plus', revenus.donnees?.rating === null, `${revenus.donnees?.rating}`);

const vuPlateforme = await appeler('/api/superowner/drivers', { jeton: P });
const fiche = (vuPlateforme.donnees?.drivers || []).find((l) => l.email === `d-${uniq}@t.fr`);
check('la plateforme le voit comme jamais noté', fiche?.rating === null, `${fiche?.rating}`);

// ===== Ce qui est refusé =====

titre('Ce qu’on ne peut pas noter');

const enCours = await course({ remettre: false });
const avantRemise = await appeler(`/api/client/deliveries/${enCours.orderId}/rating`, {
  method: 'POST',
  jeton: C,
  corps: { note: 5 },
});
check('une course non remise ne se note pas', avantRemise.statut === 409, `statut ${avantRemise.statut}`);

// La course en cours doit finir, sinon le livreur n'en reçoit pas d'autre.
await appeler(`/api/drivers/deliveries/${enCours.deliveryId}`, {
  method: 'PATCH',
  jeton: D,
  corps: { status: 'PICKED_UP' },
});
await appeler(`/api/drivers/deliveries/${enCours.deliveryId}`, {
  method: 'PATCH',
  jeton: D,
  corps: { status: 'DELIVERED', code: await codeDeRemise(API, enCours.orderId) },
});

for (const note of [0, 6, 3.5]) {
  const horsBareme = await appeler(`/api/client/deliveries/${enCours.orderId}/rating`, {
    method: 'POST',
    jeton: C,
    corps: { note },
  });
  check(`la note ${note} est refusée`, horsBareme.statut === 400, `statut ${horsBareme.statut}`);
}

const voisin = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `v-${uniq}@t.fr`, password: MDP, name: `Voisin ${uniq}` },
});
const intrusion = await appeler(`/api/client/deliveries/${enCours.orderId}/rating`, {
  method: 'POST',
  jeton: voisin.donnees.accessToken,
  corps: { note: 1 },
});
check(
  'un autre client ne note pas cette course',
  intrusion.statut === 404,
  `statut ${intrusion.statut}`
);

const anonyme = await appeler(`/api/client/deliveries/${enCours.orderId}/rating`, {
  method: 'POST',
  corps: { note: 1 },
});
check('et un visiteur non connecté non plus', anonyme.statut === 401, `statut ${anonyme.statut}`);

// ===== La note, par l'écran du client =====

titre('Le client note son livreur depuis le suivi');

const nav = await chromium.launch();
const page = await nav.newPage();

const erreurs = [];
page.on('console', (m) => {
  const texte = m.text();
  const dehors = /tile\.openstreetmap|net::ERR_|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|favicon|Failed to load resource|404|RSC payload/i.test(texte);
  if (m.type() === 'error' && !dehors) erreurs.push(texte.slice(0, 200));
});

await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailClient);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

await page.goto(`${SITE}/client/orders/${enCours.orderId}`);
await page.waitForTimeout(5000);

const etoiles = page.locator('[role="radio"][aria-label*="étoile"]');
check('cinq étoiles sont proposées', (await etoiles.count()) === 5, `n=${await etoiles.count()}`);

const avantChoix = await page.locator('body').innerText();
check(
  'le commentaire n’est pas demandé avant la note',
  (await page.locator('textarea').count()) === 0,
  avantChoix.slice(0, 200)
);

await etoiles.nth(3).click();
await page.waitForTimeout(500);

check('choisir une note ouvre le commentaire', (await page.locator('textarea').count()) === 1);
check(
  'et dit ce que la note veut dire',
  /Bonne/.test(await page.locator('body').innerText()),
  'libellé absent'
);

await page.fill('textarea', 'Rapide et aimable.');
await page.click('button:has-text("Envoyer ma note")');
await page.waitForTimeout(3000);

const apresNote = await page.locator('body').innerText();
check('la note donnée est rappelée', /Votre note/.test(apresNote), apresNote.slice(0, 400));
check('avec le commentaire', /Rapide et aimable/.test(apresNote), apresNote.slice(0, 400));
check(
  'les étoiles ne sont plus proposées',
  (await page.locator('button:has-text("Envoyer ma note")').count()) === 0,
  'le formulaire est resté'
);

await page.reload();
await page.waitForTimeout(4000);
check(
  'et ne reviennent pas au rechargement',
  (await page.locator('button:has-text("Envoyer ma note")').count()) === 0,
  'le formulaire est revenu'
);

titre('La note compte pour de bon');

const apres = await appeler('/api/drivers/me', { jeton: D });
check('la moyenne du livreur vaut la note donnée', Number(apres.donnees?.data?.rating) === 4, `${apres.donnees?.data?.rating}`);
check('et il a un avis', apres.donnees?.data?.avis === 1, `${apres.donnees?.data?.avis}`);

const sesNotes = await appeler('/api/drivers/ratings', { jeton: D });
check('il lit ce qu’on lui a écrit', sesNotes.donnees?.data?.notes?.[0]?.commentaire === 'Rapide et aimable.', JSON.stringify(sesNotes.donnees?.data)?.slice(0, 200));
check(
  'sans savoir qui l’a écrit',
  !JSON.stringify(sesNotes.donnees?.data?.notes).includes(emailClient),
  'le client est nommé'
);

const deuxFois = await appeler(`/api/client/deliveries/${enCours.orderId}/rating`, {
  method: 'POST',
  jeton: C,
  corps: { note: 1 },
});
check('la même course ne se note pas deux fois', deuxFois.statut === 409, `statut ${deuxFois.statut}`);

titre('Une deuxième course, une deuxième note');

const seconde = await course({ remettre: true });
const noteBasse = await appeler(`/api/client/deliveries/${seconde.orderId}/rating`, {
  method: 'POST',
  jeton: C,
  corps: { note: 2 },
});
check('le même client note sa course suivante', noteBasse.statut === 201, `statut ${noteBasse.statut}`);

const moyenne = await appeler('/api/drivers/me', { jeton: D });
check('la moyenne suit les deux notes', Number(moyenne.donnees?.data?.rating) === 3, `${moyenne.donnees?.data?.rating}`);
check('sur deux avis', moyenne.donnees?.data?.avis === 2, `${moyenne.donnees?.data?.avis}`);

const listePlateforme = await appeler('/api/superowner/drivers', { jeton: P });
const revu = (listePlateforme.donnees?.drivers || []).find((l) => l.email === `d-${uniq}@t.fr`);
check('la plateforme voit la vraie note', Number(revu?.rating) === 3, `${revu?.rating}`);
check('et le nombre d’avis', revu?.avis === 2, `${revu?.avis}`);

titre('Le livreur voit sa note sur son tableau de bord');
// Le livreur a son propre écran de connexion : `/login` est celui du client.
await page.goto(`${SITE}/driver/login`);
await page.fill('input[type="email"]', `d-${uniq}@t.fr`);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL('**/driver', { timeout: 15000 });
await page.waitForTimeout(5000);

const tableau = await page.locator('body').innerText();
check('sa note s’affiche', /3,0/.test(tableau), tableau.slice(0, 600));
check('avec le nombre d’avis', /2 avis/.test(tableau), tableau.slice(0, 600));
check('et ce que les clients ont écrit', /Rapide et aimable/.test(tableau), tableau.slice(0, 900));

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
