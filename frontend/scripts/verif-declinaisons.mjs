/**
 * Les déclinaisons d'un plat, des deux côtés, dans un vrai navigateur.
 *
 * Côté commerçant : créer « penne », « spaghetti », « tagliatelle » sur un même
 * plat. Côté client : les choisir, voir le prix suivre, et ne pas pouvoir
 * commander sans avoir choisi.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-declinaisons.mjs
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
const slug = `trattoria-${uniq}`;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: ORG,
    name: `Trattoria ${uniq}`,
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
await ouvrirToutLeJour(appeler, storeId, T);

const plat = await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'Pâtes 4 fromages', price: 14, status: 'ACTIVE' },
});
const productId = plat.donnees.product?.id || plat.donnees.id;

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

const connecter = async (email) => {
  await page.goto(`${SITE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
};

// ===== Côté commerçant =====

titre('Le commerçant décline son plat');
await connecter(`m-${uniq}@t.fr`);
await page.goto(`${SITE}/merchant/${ORG}/products`);
await page.waitForTimeout(3500);

const panneau = page.locator('button[aria-expanded]', { hasText: 'Déclinaisons' });
check('un panneau « Déclinaisons » existe', (await panneau.count()) >= 1, `n=${await panneau.count()}`);

await panneau.first().click();
await page.waitForTimeout(800);

const champChoix = page.locator(`#choix-${productId}`);
check('la question posée est saisissable', (await champChoix.count()) === 1, 'champ absent');

await champChoix.fill('Type de pâtes');
await page.locator('button[aria-label="Enregistrer l’intitulé"]').first().click();
await page.waitForTimeout(1500);

const ajouter = async (nom, prix) => {
  await page.locator(`#nom-${productId}`).fill(nom);
  await page.locator(`#prix-${productId}`).fill(prix === null ? '' : String(prix));
  // Repère précis : « Ajouter » attrapait le bouton d'ajout de produit de la
  // page, dont la fenêtre modale bloquait ensuite tous les clics.
  await page.locator('button[aria-label="Ajouter la déclinaison"]').first().click();
  await page.waitForTimeout(1500);
};

await ajouter('Penne', null);
await ajouter('Spaghetti', null);
await ajouter('Tagliatelle', 16.5);

// Le contrôle qui compte : la base, pas l'écran.
const enregistrees = await appeler(`/api/products/${productId}/variants`);
const variantes = enregistrees.donnees?.data?.variantes || [];

check('les trois déclinaisons sont enregistrées', variantes.length === 3, JSON.stringify(variantes.map((v) => v.label)));
check(
  'la question posée est enregistrée',
  enregistrees.donnees?.data?.libelleDuChoix === 'Type de pâtes',
  enregistrees.donnees?.data?.libelleDuChoix
);
check(
  'le prix propre des tagliatelle est retenu',
  variantes.find((v) => v.label === 'Tagliatelle')?.prixEffectif === 16.5,
  JSON.stringify(variantes.find((v) => v.label === 'Tagliatelle'))
);
check(
  'une déclinaison sans prix suit le plat',
  variantes.find((v) => v.label === 'Penne')?.prixEffectif === 14,
  JSON.stringify(variantes.find((v) => v.label === 'Penne'))
);

titre('Le compteur se met à jour');
const resume = await page.locator('body').innerText();
check('le panneau annonce trois déclinaisons', /Déclinaisons \(3\)/.test(resume), resume.slice(0, 400));

titre('Épuiser une déclinaison');
await page.locator('button', { hasText: 'Épuiser' }).nth(1).click();
await page.waitForTimeout(1500);

const apresEpuisement = await appeler(`/api/products/${productId}/variants`);
const epuisees = (apresEpuisement.donnees?.data?.variantes || []).filter((v) => !v.isAvailable);
check('une déclinaison est épuisée', epuisees.length === 1, JSON.stringify(epuisees.map((v) => v.label)));

const nomEpuisee = epuisees[0]?.label;

// ===== Côté client =====

titre('Le client choisit');
await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(3500);

const menu = await page.locator('body').innerText();
check('le plat est au menu', menu.includes('Pâtes 4 fromages'), menu.slice(0, 400));
check('la question posée est affichée', menu.includes('Type de pâtes'), menu.slice(0, 600));

const choix = page.locator('[role="radio"]');
check('les trois choix sont proposés', (await choix.count()) === 3, `n=${await choix.count()}`);

const epuise = page.locator(`[role="radio"]:has-text("${nomEpuisee}")`);
check('la déclinaison épuisée est désactivée', await epuise.first().isDisabled(), 'restée cliquable');

titre('Sans choix, pas de commande');
const bouton = page.locator('button[aria-label="Ajouter Pâtes 4 fromages au panier"]');
check('le bouton est bloqué', await bouton.first().isDisabled(), 'actif à tort');
check(
  // La vitrine qui reste nomme la question du commerçant plutôt que de parler
  // d'« une option » : « Choisissez : Type de pâtes ».
  'la page invite à choisir',
  /Choisissez\s*:/.test(menu),
  menu.slice(0, 700)
);

titre('Le prix suit le choix');
await page.locator('[role="radio"]:has-text("Tagliatelle")').first().click();
await page.waitForTimeout(600);

const avecTagliatelle = await page.locator('body').innerText();
check('le prix passe à celui des tagliatelle', /16,50/.test(avecTagliatelle), avecTagliatelle.slice(0, 700));
check('le bouton se débloque', !(await bouton.first().isDisabled()), 'resté bloqué');

titre('Au panier, la déclinaison est nommée');
await bouton.first().click();
await page.waitForTimeout(800);

// Le panier de cette vitrine est un panneau replié : sans l'ouvrir, ses lignes
// ne sont pas dans la page.
const ouvrirPanier = page.locator('button:has-text("Panier")').first();
await ouvrirPanier.click();
await page.waitForTimeout(800);

const panier = await page.locator('body').innerText();
check('la ligne nomme la déclinaison', /Pâtes 4 fromages — Tagliatelle/.test(panier), panier.slice(0, 900));

titre('Deux déclinaisons font deux lignes');
await page.locator('[role="radio"]:has-text("Penne")').first().click();
await page.waitForTimeout(400);
await bouton.first().click();
await page.waitForTimeout(800);

const deuxLignes = await page.locator('body').innerText();
check('les penne apparaissent aussi', /Pâtes 4 fromages — Penne/.test(deuxLignes), deuxLignes.slice(0, 900));
check(
  'les tagliatelle sont toujours là',
  /Pâtes 4 fromages — Tagliatelle/.test(deuxLignes),
  deuxLignes.slice(0, 900)
);
check(
  'le total additionne les deux prix',
  /30,50/.test(deuxLignes),
  deuxLignes.slice(0, 1000)
);

titre('En direct, sans recharger');
// On épuise les penne côté commerçant, sans toucher au navigateur.
const penneId = (await appeler(`/api/products/${productId}/variants`)).donnees.data.variantes.find(
  (v) => v.label === 'Penne'
)?.id;

await appeler(`/api/products/variants/${penneId}/availability`, {
  method: 'PATCH',
  jeton: T,
  corps: { isAvailable: false },
});

await page.waitForTimeout(3500);

const enDirect = await page.locator('body').innerText();
check(
  'les penne quittent le panier sans rechargement',
  !/Pâtes 4 fromages — Penne/.test(enDirect),
  enDirect.slice(0, 900)
);

const penneBouton = page.locator('[role="radio"]:has-text("Penne")');
check('le choix « Penne » se désactive', await penneBouton.first().isDisabled(), 'resté cliquable');

// ===== La vitrine et la commande =====

titre('La vitrine propose le même choix');
await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(3500);

const vitrine = await page.locator('body').innerText();
check('la question posée y figure', vitrine.includes('Type de pâtes'), vitrine.slice(0, 600));

const choixVitrine = page.locator('[role="radio"]');
check('les choix y sont', (await choixVitrine.count()) === 3, `n=${await choixVitrine.count()}`);

const boutonVitrine = page.locator('button[aria-label="Ajouter Pâtes 4 fromages au panier"]');
check('le bouton invite à choisir', /Choisissez : Type de pâtes/.test(vitrine), vitrine.slice(0, 700));
check('il est bloqué', await boutonVitrine.first().isDisabled(), 'actif à tort');

await page.locator('[role="radio"]:has-text("Tagliatelle")').first().click();
await page.waitForTimeout(500);
await boutonVitrine.first().click();
await page.waitForTimeout(800);

await page.locator('button', { hasText: 'Panier' }).first().click();
await page.waitForTimeout(800);

const panierVitrine = await page.locator('body').innerText();
check(
  'le panier nomme la déclinaison',
  /Pâtes 4 fromages — Tagliatelle/.test(panierVitrine),
  panierVitrine.slice(0, 900)
);
check('au prix de la déclinaison', /16,50/.test(panierVitrine), panierVitrine.slice(0, 900));

titre('La commande porte la déclinaison');
await page.locator('button', { hasText: 'Passer la Commande' }).first().click();
await page.waitForTimeout(1200);

await page.fill('input[name="customerName"], input[placeholder*="om"]', `Client ${uniq}`).catch(() => undefined);
const champs = await page.locator('input[type="email"], input[type="tel"]').count();
check('le tunnel de commande s’ouvre', champs >= 1, `n=${champs}`);

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|403|RSC payload|Auth refresh/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
