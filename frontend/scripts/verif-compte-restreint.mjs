/**
 * Suspension et fermeture vues par le commerçant, dans un vrai navigateur.
 *
 * Le point qui compte : la bascule doit se voir **sans rechargement**, et ne
 * laisser qu'une porte. Laisser la navigation entière afficherait une
 * trentaine de liens répondant « accès refusé » : le commerçant croirait à
 * une panne.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-compte-restreint.mjs
 */

import { chromium } from 'playwright';

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

const plateforme = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` },
});
const TP = plateforme.donnees.accessToken;

const commercant = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` },
});
const T = commercant.donnees.accessToken;
const ORG = commercant.donnees.organization.id;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: ORG,
    name: `Pizzeria ${uniq}`,
    slug: `pizzeria-${uniq}`,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
  },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;

await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'Margherita', price: 12, status: 'ACTIVE' },
});

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

const liensDuMenu = () =>
  page.locator('aside a').evaluateAll((liens) => liens.map((a) => a.getAttribute('href')));

// ===== Compte actif =====

titre('Un compte actif');
await connecter(`m-${uniq}@t.fr`);
await page.goto(`${SITE}/merchant/${ORG}/dashboard`);
await page.waitForTimeout(3500);

const menuComplet = await liensDuMenu();
check('le menu est complet', menuComplet.length > 15, `n=${menuComplet.length}`);
check(
  'les produits sont accessibles',
  menuComplet.includes(`/merchant/${ORG}/products`),
  JSON.stringify(menuComplet.slice(0, 5))
);

const actif = await page.locator('body').innerText();
check('aucun bandeau de suspension', !/suspendu|Compte fermé/i.test(actif), actif.slice(0, 300));

// ===== La suspension, en direct =====

titre('Suspension, sans rechargement');
await appeler(`/api/superowner/organizations/${ORG}/suspend`, {
  method: 'POST',
  jeton: TP,
  corps: { reason: `Fraude ${uniq}` },
});

// Aucun rechargement : seul le direct peut mettre la page à jour.
await page.waitForTimeout(4000);

const pendant = await page.locator('body').innerText();
check('la page bascule d’elle-même', /suspendu/i.test(pendant), pendant.slice(0, 500));
check('le motif est repris', pendant.includes(`Fraude ${uniq}`), pendant.slice(0, 600));
check(
  'le contenu de la page est remplacé',
  /Écrire au support/.test(pendant),
  pendant.slice(0, 600)
);

const menuRestreint = await liensDuMenu();
check('le menu est réduit', menuRestreint.length <= 3, JSON.stringify(menuRestreint));
// Le retour vers « Mes commerces » reste : il ne donne accès à rien de la
// boutique suspendue.
check(
  'seul le support reste, plus le retour au choix',
  menuRestreint.every((lien) => (lien || '').endsWith('/support') || lien === '/merchant'),
  JSON.stringify(menuRestreint)
);
check(
  'le support y est bien',
  menuRestreint.some((lien) => (lien || '').endsWith('/support')),
  JSON.stringify(menuRestreint)
);

check(
  'la cloche annonce l’avertissement',
  /non lue/.test((await page.locator('button[aria-label^="Notifications"]').first().getAttribute('aria-label')) || ''),
  'pastille éteinte'
);

titre('Les pages du catalogue ne s’ouvrent plus');
await page.goto(`${SITE}/merchant/${ORG}/products`);
await page.waitForTimeout(3000);

const produits = await page.locator('body').innerText();
check('la page produits est remplacée', /Compte suspendu/i.test(produits), produits.slice(0, 400));
check(
  'elle ne montre aucun tableau vide trompeur',
  !/Aucun produit/i.test(produits),
  produits.slice(0, 400)
);

titre('Le support, lui, s’ouvre');
await page.goto(`${SITE}/merchant/${ORG}/support`);
await page.waitForTimeout(3500);

const support = await page.locator('body').innerText();
check('la page support fonctionne', /support|ticket/i.test(support), support.slice(0, 400));
check('le bandeau y reste visible', /suspendu/i.test(support), support.slice(0, 400));

// ===== Réactivation, en direct =====

titre('Réactivation, sans rechargement');
await appeler(`/api/superowner/organizations/${ORG}/unsuspend`, { method: 'POST', jeton: TP });
await page.waitForTimeout(4000);

const repris = await page.locator('body').innerText();
check('le bandeau disparaît de lui-même', !/suspendu/i.test(repris), repris.slice(0, 400));

const menuRevenu = await liensDuMenu();
check('le menu complet revient', menuRevenu.length > 15, `n=${menuRevenu.length}`);

// ===== Fermeture =====

titre('Fermeture');
await appeler(`/api/superowner/organizations/${ORG}/close`, {
  method: 'POST',
  jeton: TP,
  corps: { reason: `Cessation ${uniq}` },
});
await page.waitForTimeout(4000);

await page.goto(`${SITE}/merchant/${ORG}/dashboard`);
await page.waitForTimeout(3500);

const ferme = await page.locator('body').innerText();
check('la fermeture est annoncée', /Compte fermé/i.test(ferme), ferme.slice(0, 500));
check('le motif est repris', ferme.includes(`Cessation ${uniq}`), ferme.slice(0, 600));
check('le support reste proposé', /Écrire au support/.test(ferme), ferme.slice(0, 600));

const menuFerme = await liensDuMenu();
check('le menu reste réduit', menuFerme.length <= 3, JSON.stringify(menuFerme));

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|403|RSC payload|Auth refresh/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
