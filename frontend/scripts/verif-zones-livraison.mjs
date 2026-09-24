/**
 * Les zones de livraison, des deux côtés, dans un vrai navigateur.
 *
 * Côté commerçant : régler des anneaux avec leurs frais et leur montant
 * minimum. Côté client : voir sa zone dès qu'il saisit son adresse, et ne pas
 * pouvoir valider hors zone ou sous le minimum.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-zones-livraison.mjs
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
const MDP = 'Password123!';

// Place Bellecour, Lyon.
const BOUTIQUE = { latitude: 45.7578, longitude: 4.832 };
const aKm = (km) => ({
  latitude: BOUTIQUE.latitude + km / 111.32,
  longitude: BOUTIQUE.longitude,
});

// ===== Le décor =====

await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` },
});

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` },
});
const T = commercant.donnees.accessToken;
const ORG = commercant.donnees.organization.id;
const slug = `pizzeria-${uniq}`;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: ORG,
    name: `Pizzeria ${uniq}`,
    slug,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    ...BOUTIQUE,
  },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;
await ouvrirToutLeJour(appeler, storeId, T);

await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: `Margherita ${uniq}`, price: 10, status: 'ACTIVE' },
});

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

const texte = () => page.locator('body').innerText();

const connecter = async (email) => {
  await page.goto(`${SITE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
};

// ===== Côté commerçant =====

titre('Le commerçant règle ses zones');
await connecter(`m-${uniq}@t.fr`);
await page.goto(`${SITE}/merchant/${ORG}/delivery-zones`);
await page.waitForTimeout(3500);

const vide = await texte();
check('la page s’ouvre', /[Zz]one/.test(vide), vide.slice(0, 300));

await page.locator('button', { hasText: /Nouvelle|Ajouter|Créer/ }).first().click();
await page.waitForTimeout(800);

// L'explication accompagne le formulaire : c'est là qu'elle sert.
const formulaire = await texte();
check(
  'le fonctionnement des anneaux est expliqué',
  /anneaux autour de la boutique/.test(formulaire) && /la plus petite qui s’applique/.test(formulaire),
  formulaire.slice(0, 900)
);

check('le champ rayon existe', (await page.locator('#zone-rayon').count()) === 1, 'champ absent');
check('le champ minimum existe', (await page.locator('#zone-minimum').count()) === 1, 'champ absent');

const creerZone = async (nom, rayon, frais, minimum, minutes) => {
  await page.locator('#zone-nom').fill(nom);
  await page.locator('#zone-rayon').fill(String(rayon));
  await page.locator('#zone-frais').fill(String(frais));
  await page.locator('#zone-minimum').fill(String(minimum));
  await page.locator('#zone-duree').fill(String(minutes));
  await page.locator('button', { hasText: /Enregistrer|Créer/ }).first().click();
  await page.waitForTimeout(2000);
};

await creerZone('Centre', 2, 2.5, 12, 20);

await page.locator('button', { hasText: /Nouvelle|Ajouter|Créer/ }).first().click();
await page.waitForTimeout(800);
await creerZone('Périphérie', 5, 4.5, 20, 35);

// Le contrôle qui compte : la base, pas l'écran.
const enregistrees = await appeler(`/api/delivery-zones?storeId=${storeId}`, { jeton: T });
const zones = enregistrees.donnees?.zones || [];

check('les deux zones sont enregistrées', zones.length === 2, JSON.stringify(zones.map((z) => z.name)));
check(
  'le rayon est retenu',
  zones.find((z) => z.name === 'Centre')?.radiusKm === 2,
  JSON.stringify(zones.find((z) => z.name === 'Centre'))
);
check(
  'les frais et le minimum sont retenus',
  zones.find((z) => z.name === 'Centre')?.baseFee === 2.5 &&
    zones.find((z) => z.name === 'Centre')?.minOrder === 12,
  JSON.stringify(zones.find((z) => z.name === 'Centre'))
);
check(
  'la durée annoncée est retenue',
  zones.find((z) => z.name === 'Périphérie')?.deliveryMinutes === 35,
  JSON.stringify(zones.find((z) => z.name === 'Périphérie'))
);

const affichees = await texte();
check('le rayon est affiché sur la carte', /2 km/.test(affichees), affichees.slice(0, 900));
check('la durée aussi', /35 min/.test(affichees), affichees.slice(0, 900));

titre('Un rayon manquant est refusé');
await page.locator('button', { hasText: /Nouvelle|Ajouter|Créer/ }).first().click();
await page.waitForTimeout(800);
await page.locator('#zone-nom').fill('Sans rayon');
await page.locator('#zone-frais').fill('3');
await page.locator('button', { hasText: /Enregistrer|Créer/ }).first().click();
await page.waitForTimeout(1200);

const refus = await texte();
check('le message le dit', /rayon en kilomètres/.test(refus), refus.slice(0, 900));

const toujoursDeux = await appeler(`/api/delivery-zones?storeId=${storeId}`, { jeton: T });
check('aucune zone n’a été créée', (toujoursDeux.donnees?.zones || []).length === 2, `${(toujoursDeux.donnees?.zones || []).length}`);

titre('Un rayon déjà pris est refusé');
await page.locator('#zone-rayon').fill('5');
await page.locator('button', { hasText: /Enregistrer|Créer/ }).first().click();
await page.waitForTimeout(1500);

const refusRayon = await texte();
check('le refus du serveur est affiché', /Périphérie/.test(refusRayon), refusRayon.slice(0, 900));

// ===== Côté client =====

titre('Le client, à 1 km');
await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(3500);

await page.locator(`button[aria-label="Ajouter Margherita ${uniq} au panier"]`).first().click();
await page.waitForTimeout(700);
await page.locator('button', { hasText: 'Panier' }).first().click();
await page.waitForTimeout(800);
await page.locator('button', { hasText: 'Passer la Commande' }).first().click();
await page.waitForTimeout(1500);

const tunnel = await texte();
check('le tunnel de commande s’ouvre', /Mode de Livraison/i.test(tunnel), tunnel.slice(0, 400));
check(
  'les frais de service inventés ont disparu',
  !/Frais de service/.test(tunnel),
  tunnel.slice(0, 900)
);

// Les coordonnées viennent de l'autocomplétion, injoignable d'ici : on les
// pose comme la suggestion le ferait.
const poserAdresse = async (position) => {
  await page.evaluate(
    ({ lat, lng }) => {
      const champs = [...document.querySelectorAll('input')];
      const adresse = champs.find((champ) =>
        (champ.getAttribute('placeholder') || '').includes('rue de la Paix')
      );
      if (adresse) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        setter?.call(adresse, `${lat},${lng}`);
        adresse.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    { lat: position.latitude, lng: position.longitude }
  );
};

/**
 * L'autocomplétion est injoignable depuis cet environnement : on interroge
 * directement la route publique, qui est ce que la page appelle.
 */
const verdict = async (position) =>
  (
    await appeler(
      `/api/client/stores/${storeId}/zone-livraison?lat=${position.latitude}&lng=${position.longitude}`
    )
  ).donnees?.data;

const proche = await verdict(aKm(1));
check('à 1 km, la zone Centre s’applique', proche?.zone?.name === 'Centre', JSON.stringify(proche));
check('avec ses frais', proche?.frais === 2.5, `${proche?.frais}`);

const moyen = await verdict(aKm(4));
check('à 4 km, la zone Périphérie', moyen?.zone?.name === 'Périphérie', JSON.stringify(moyen));

const dehors = await verdict(aKm(20));
check('à 20 km, aucune zone', dehors?.livrable === false, JSON.stringify(dehors));
check('le refus dit la portée', /5 km/.test(dehors?.raison || ''), dehors?.raison);

titre('La grille est publique');
const grille = await appeler(`/api/client/stores/${storeId}/zones`);
check('un visiteur peut la consulter', grille.statut === 200, `statut ${grille.statut}`);
check(
  'elle porte les deux anneaux',
  (grille.donnees?.data || []).map((zone) => zone.name).sort().join(',') === 'Centre,Périphérie',
  JSON.stringify(grille.donnees?.data?.map((zone) => zone.name))
);

titre('Le retrait reste possible partout');
await page.locator('input[value="PICKUP"]').first().check().catch(() => undefined);
await page.waitForTimeout(2000);

const retrait = await texte();
check('la livraison n’est plus facturée', /Retrait sur place/.test(retrait), retrait.slice(0, 900));

const boutonRetrait = page.locator('button', { hasText: /Confirmer la Commande/ });
check('la commande reste validable', !(await boutonRetrait.first().isDisabled()), 'bloquée à tort');

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|403|RSC payload|Auth refresh|adresse/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
