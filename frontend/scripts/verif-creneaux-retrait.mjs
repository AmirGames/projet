/**
 * Le choix de l'heure de retrait, dans un vrai navigateur.
 *
 * Un champ d'heure libre laissait le client demander un retrait à 9 h alors
 * que la boutique ouvre à 11 h : la commande partait, et personne n'était là
 * pour la lui remettre. On vérifie donc que la page ne propose que des
 * créneaux qui existent — et que la page « Passer la commande » offre un
 * chemin de retour.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-creneaux-retrait.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia } from './inscription.mjs';

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

// ===== Le décor =====

await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` },
});

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` },
});

const T = commercant.donnees.accessToken;
const slug = `pizzeria-${uniq}`;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
    name: `Pizzeria ${uniq}`,
    slug,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    latitude: 45.764,
    longitude: 4.8357,
  },
});

const storeId = boutique.donnees.store?.id || boutique.donnees.id;

// Ouverture à 11 h, fermeture à 14 h, tous les jours : une plage étroite et
// facile à contrôler.
for (const jour of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) {
  await appeler(`/api/store-hours/${storeId}/day/${jour}`, {
    method: 'PUT',
    jeton: T,
    corps: { open: '11:00', close: '14:00', closed: false },
  });
}

await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'Margherita', price: 12, status: 'ACTIVE' },
});

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

titre('La boutique');
await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(3000);

const vitrine = await page.locator('body').innerText();
check('la Margherita est au menu', vitrine.includes('Margherita'), vitrine.slice(0, 300));

// Au panier, puis au tunnel de commande.
await page
  .locator('button')
  .filter({ hasText: /^Ajouter/ })
  .first()
  .click()
  .catch(() => undefined);
await page.waitForTimeout(800);

await page.locator('button', { hasText: 'Panier' }).first().click().catch(() => undefined);
await page.waitForTimeout(800);

await page
  .locator('button', { hasText: 'Passer la Commande' })
  .first()
  .click()
  .catch(() => undefined);
await page.waitForTimeout(1200);

titre('Le retrait sur place');
await page.locator('input[value="PICKUP"]').first().check().catch(() => undefined);
await page.waitForTimeout(2500);

const champLibre = await page.locator('input[type="datetime-local"]').count();
check('plus de champ d’heure libre', champLibre === 0, `n=${champLibre}`);

const liste = page.locator('select#creneau');
check('un choix de créneaux est proposé', (await liste.count()) === 1, `n=${await liste.count()}`);

const heures = await liste
  .locator('option')
  .evaluateAll((options) =>
    options.map((o) => ({ valeur: o.value, libelle: o.textContent?.trim() }))
  );

const reels = heures.filter((h) => h.valeur);
check('des créneaux sont listés', reels.length > 0, JSON.stringify(heures.slice(0, 5)));

const horsHoraires = reels.filter((h) => {
  const instant = new Date(h.valeur);
  const minutes = instant.getHours() * 60 + instant.getMinutes();
  return minutes < 11 * 60 || minutes >= 14 * 60;
});

check(
  'aucune heure hors ouverture n’est proposée',
  horsHoraires.length === 0,
  horsHoraires.slice(0, 3).map((h) => h.libelle).join(', ')
);

const passees = reels.filter((h) => new Date(h.valeur).getTime() < Date.now());
check('aucune heure déjà passée', passees.length === 0, passees.slice(0, 3).map((h) => h.libelle).join(', '));

const journees = await liste
  .locator('optgroup')
  .evaluateAll((groupes) => groupes.map((g) => g.getAttribute('label')));

check('les créneaux sont groupés par journée', journees.length > 0, JSON.stringify(journees));
check(
  'la première journée porte un nom lisible',
  ['Aujourd’hui', "Aujourd'hui", 'Demain'].includes(journees[0]) ||
    /\w+ \d+ \w+/.test(journees[0] || ''),
  JSON.stringify(journees)
);

titre('Le créneau choisi part avec la commande');
await liste.selectOption(reels[0].valeur);
const choisi = await liste.inputValue();
check('la sélection est retenue', choisi === reels[0].valeur, `${choisi} au lieu de ${reels[0].valeur}`);

// ===== Le bouton retour de « Passer la commande » =====

titre('La page Passer la commande');
await page.goto(`${SITE}/checkout`);
await page.waitForTimeout(2500);

const entete = await page.locator('body').innerText();
check('le titre est bien celui-là', /Passer la commande/i.test(entete), entete.slice(0, 200));

// Sans bouton retour, le client était coincé : ni fil d'Ariane, ni lien vers
// la boutique qu'il venait de quitter.
const retour = page.locator('button[aria-label="Retour"], a[aria-label="Retour"]');
check('un bouton retour existe', (await retour.count()) >= 1, `n=${await retour.count()}`);

const avant = page.url();
await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(2000);
await page.goto(`${SITE}/checkout`);
await page.waitForTimeout(2000);

await retour.first().click().catch(() => undefined);
await page.waitForTimeout(2500);

check(
  'il ramène à la page précédente',
  page.url().includes(`/store/${slug}`),
  `${avant} puis ${page.url()}`
);

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|RSC payload/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
