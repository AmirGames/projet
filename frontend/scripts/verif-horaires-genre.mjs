/**
 * Les horaires en plusieurs services, et le genre du commerce.
 *
 * Un jour n'avait qu'une plage : un restaurant qui sert à midi puis le soir
 * devait se dire ouvert tout l'après-midi, et une fermeture à 1 h du matin
 * était refusée. La page était par ailleurs la seule de l'espace commerçant
 * restée en anglais.
 *
 * L'inscription, elle, ne demandait ni type d'établissement ni type de
 * cuisine, et les réglages proposaient des « heures d'ouverture par défaut »
 * qui faisaient doublon avec l'onglet Horaires sans que personne ne les lise.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-horaires-genre.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';

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

const emailCommercant = `m-${uniq}@t.fr`;

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `Plateforme ${uniq}` },
});

if (!plateforme.donnees?.accessToken) {
  console.error(`Inscription impossible : ${JSON.stringify(plateforme.donnees)?.slice(0, 200)}`);
  console.error('La base doit être vierge : le premier compte inscrit devient la plateforme.');
  process.exit(1);
}

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailCommercant, password: MDP, name: `Commerce ${uniq}` },
});
const T = commercant.donnees.accessToken;
const orgId = commercant.donnees.organization.id;

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();

const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/400|403|tile\.openstreetmap|net::ERR_/.test(m.text())) {
    erreurs.push(`${new URL(page.url()).pathname} : ${m.text().slice(0, 200)}`);
  }
});

titre('Le commerçant crée son commerce en disant ce qu’il vend');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailCommercant);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL('**/merchant', { timeout: 15000 });
await page.waitForTimeout(1500);

await page.goto(`${SITE}/store/new`);
await page.waitForTimeout(3000);

// Toute boutique naissait « restaurant » sans genre : le client ne pouvait ni
// distinguer une épicerie d'un fleuriste, ni chercher une pizzeria.
const etablissements = await page.locator('#businessType option').allInnerTexts();
check('le type d’entreprise est demandé', etablissements.length === 8, etablissements.join(','));
check('l’épicerie y est', etablissements.includes('Épicerie'), etablissements.join(','));
check('le fleuriste aussi', etablissements.includes('Fleuriste'), etablissements.join(','));

const cuisines = await page.locator('#cuisineType option').allInnerTexts();
check('le type de cuisine est demandé', cuisines.length > 80, `${cuisines.length}`);
check('les pizzas y sont', cuisines.includes('Pizzas'), `${cuisines.length} entrées`);
check('les sushis japonais aussi', cuisines.includes('Japonaise : sushis'), `${cuisines.length} entrées`);

titre('Choisir une épicerie retire la cuisine');
// Une épicerie n'a pas de cuisine : le champ n'a pas à rester à l'écran.
await page.selectOption('#businessType', 'grocery');
await page.waitForTimeout(600);
check('le champ disparaît', (await page.locator('#cuisineType').count()) === 0, 'toujours affiché');

await page.selectOption('#businessType', 'restaurant');
await page.waitForTimeout(600);
check('et revient pour un restaurant', (await page.locator('#cuisineType').count()) === 1, 'absent');

await page.fill('input[name="name"]', `Trattoria ${uniq}`);
await page.fill('input[name="slug"]', `trattoria-${uniq}`);
await page.selectOption('#cuisineType', 'pizza');
await page.fill('input[name="phone"]', '0400000000');
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);

const boutiques = await appeler(`/api/stores/org/${orgId}`, { jeton: T });
const liste = Array.isArray(boutiques.donnees) ? boutiques.donnees : boutiques.donnees?.stores || [];
const creee = liste.find((b) => b.slug === `trattoria-${uniq}`);
check('la boutique est créée', !!creee, JSON.stringify(liste)?.slice(0, 200));
check('avec son type', creee?.businessType === 'restaurant', creee?.businessType);
check('et sa cuisine', creee?.cuisineType === 'pizza', creee?.cuisineType);

const storeId = creee?.id;

// ===== Les horaires =====

titre('Un jour peut porter deux services');
await page.goto(`${SITE}/merchant/${orgId}/store-hours`);
await page.waitForTimeout(3500);

const horaires = await page.locator('body').innerText();
// La page était la seule de l'espace commerçant restée en anglais.
check('la page est en français', /Horaires et disponibilité/.test(horaires), horaires.slice(0, 300));
check('les jours sont en français', /Lundi/.test(horaires) && /Dimanche/.test(horaires), horaires.slice(0, 600));
check('rien n’est resté en anglais', !/Monday|Store Hours|Edit|Save|Cancel/.test(horaires), horaires.slice(0, 900));

await page.click('button[aria-label="Modifier Lundi"]');
await page.waitForTimeout(800);

check(
  'un service supplémentaire se propose',
  (await page.locator('button:has-text("Ajouter un service")').count()) === 1,
  'bouton absent'
);

await page.fill('input[aria-label="Ouverture 1 — Lundi"]', '11:30');
await page.fill('input[aria-label="Fermeture 1 — Lundi"]', '14:00');
await page.click('button:has-text("Ajouter un service")');
await page.waitForTimeout(600);

await page.fill('input[aria-label="Ouverture 2 — Lundi"]', '17:30');
await page.fill('input[aria-label="Fermeture 2 — Lundi"]', '22:00');
await page.click('button[aria-label="Enregistrer Lundi"]');
await page.waitForTimeout(3000);

const apres = await page.locator('body').innerText();
check('les deux services sont affichés', /11:30 – 14:00/.test(apres) && /17:30 – 22:00/.test(apres), apres.slice(0, 1200));

const vuServeur = await appeler(`/api/store-hours/${storeId}`, { jeton: T });
check(
  'le serveur en a bien deux',
  vuServeur.donnees?.operatingHours?.MON?.plages?.length === 2,
  JSON.stringify(vuServeur.donnees?.operatingHours?.MON)
);

titre('Un vendredi qui ferme après minuit');
// « L'heure d'ouverture doit précéder l'heure de fermeture » refusait
// l'horaire le plus courant du week-end.
await page.click('button[aria-label="Modifier Vendredi"]');
await page.waitForTimeout(800);
await page.fill('input[aria-label="Ouverture 1 — Vendredi"]', '17:30');
await page.fill('input[aria-label="Fermeture 1 — Vendredi"]', '01:00');
await page.waitForTimeout(400);

const pendant = await page.locator('body').innerText();
check('la page annonce le lendemain', /jusqu’au lendemain|jusqu'au lendemain/.test(pendant), pendant.slice(0, 1400));

await page.click('button[aria-label="Enregistrer Vendredi"]');
await page.waitForTimeout(3000);

const vendredi = await appeler(`/api/store-hours/${storeId}`, { jeton: T });
check(
  'la fermeture après minuit est acceptée',
  vendredi.donnees?.operatingHours?.FRI?.plages?.[0]?.close === '01:00',
  JSON.stringify(vendredi.donnees?.operatingHours?.FRI)
);

titre('Un chevauchement est refusé, et le refus s’affiche');
await page.click('button[aria-label="Modifier Mardi"]');
await page.waitForTimeout(800);
await page.fill('input[aria-label="Ouverture 1 — Mardi"]', '11:30');
await page.fill('input[aria-label="Fermeture 1 — Mardi"]', '15:00');
await page.click('button:has-text("Ajouter un service")');
await page.waitForTimeout(500);
await page.fill('input[aria-label="Ouverture 2 — Mardi"]', '14:00');
await page.fill('input[aria-label="Fermeture 2 — Mardi"]', '22:00');
await page.click('button[aria-label="Enregistrer Mardi"]');
await page.waitForTimeout(2500);

const refus = await page.locator('body').innerText();
check('le refus est montré', /chevauchent/i.test(refus), refus.slice(0, 1000));

// ===== Les réglages =====

titre('Les horaires en double ont quitté les réglages');
await page.goto(`${SITE}/merchant/${orgId}/settings`);
await page.waitForTimeout(3000);

const reglages = await page.locator('body').innerText();
check(
  'le doublon a disparu',
  !/heures d’ouverture par défaut|heures d'ouverture par défaut/.test(reglages),
  reglages.slice(0, 900)
);
check('un onglet Facturation le remplace', /Facturation/.test(reglages), reglages.slice(0, 900));

titre('La boutique peut porter sa propre TVA');
// Trois commerces peuvent relever de trois sociétés, donc de trois numéros.
await appeler(`/api/merchant-profile/${orgId}`, {
  method: 'PUT',
  jeton: T,
  corps: { legalName: `Societe Mere ${uniq}`, vatNumber: 'FR12345678901' },
});

await page.reload();
await page.waitForTimeout(3000);
await page.click('button:has-text("Facturation")');
await page.waitForTimeout(1200);

const onglet = await page.locator('body').innerText();
check('l’héritage est annoncé', /Héritée de votre société/.test(onglet), onglet.slice(0, 1600));
check('avec la TVA de la société', onglet.includes('FR12345678901'), onglet.slice(0, 1600));

await page.fill('#vatNumber', 'FR98765432109');
await page.fill('#legalName', `Trattoria SARL ${uniq}`);
await page.click('button:has-text("Enregistrer les modifications")');
await page.waitForTimeout(3500);

const enregistre = await appeler(`/api/store-settings/${storeId}`, { jeton: T });
check(
  'la TVA de la boutique est enregistrée',
  enregistre.donnees?.facturation?.effective?.vatNumber === 'FR98765432109',
  enregistre.donnees?.facturation?.effective?.vatNumber
);
check('et elle prime sur celle de la société', enregistre.donnees?.facturation?.propre === true, `${enregistre.donnees?.facturation?.propre}`);

titre('Une TVA au mauvais format est refusée à l’écran');
await page.fill('#vatNumber', 'FR1');
await page.click('button:has-text("Enregistrer les modifications")');
await page.waitForTimeout(3000);

const refusTva = await page.locator('body').innerText();
check('le refus est affiché', /TVA/.test(refusTva) && /invalide/i.test(refusTva), refusTva.slice(0, 1200));

const intacte = await appeler(`/api/store-settings/${storeId}`, { jeton: T });
check('et la TVA n’a pas bougé', intacte.donnees?.vatNumber === 'FR98765432109', intacte.donnees?.vatNumber);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
