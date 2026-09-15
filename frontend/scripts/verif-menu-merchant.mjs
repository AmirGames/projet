/**
 * Vérifie la barre latérale du choix du commerce, dans un vrai navigateur.
 *
 * Playwright n'est pas une dépendance du projet : il n'est utile qu'ici.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/seed-demo.mjs          # depuis backend/, crée les comptes
 *   VERIF_SITE_URL=http://localhost:3000 node scripts/verif-menu-merchant.mjs
 *
 * Le compte attendu est celui du jeu de démonstration :
 * marchand@demo.fr / Password123!, avec deux boutiques.
 */

import { chromium } from 'playwright';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';

let ok = 0; const ko = [];
const check = (n, c, d = '') => { if (c) { ok++; console.log(`  OK    ${n}`); } else { ko.push(n); console.log(`  ECHEC ${n}${d ? ' — ' + d : ''}`); } };

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

// --- Connexion
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', 'marchand@demo.fr');
await page.fill('input[type="password"]', 'Password123!');
await page.click('button[type="submit"]');
await page.waitForURL('**/merchant', { timeout: 15000 });
check('la connexion mène au choix du commerce', page.url().endsWith('/merchant'), page.url());

await page.waitForTimeout(2500);

console.log('\n[Barre latérale du choix]');
const aside = page.locator('aside').first();
check('une barre latérale est présente', await aside.count() === 1);
check('une seule barre latérale', await page.locator('aside').count() === 1, `n=${await page.locator('aside').count()}`);
const texteAside = await aside.innerText();
check('elle est titrée « Mes commerces »', texteAside.includes('Mes commerces'), texteAside.slice(0, 80));
check('la formule est affichée', /gratuit|premium|pro/i.test(texteAside), texteAside.slice(0, 120));

console.log('\n[Les boutiques sont dans le menu]');
check('Boulangerie Centre listée', texteAside.includes('Boulangerie Centre'), texteAside);
check('Boulangerie Gare listée', texteAside.includes('Boulangerie Gare'), texteAside);
check('Nouvelle boutique proposée', texteAside.includes('Nouvelle boutique'));
check('Support proposé', texteAside.includes('Support'));
check('Déconnexion proposée', texteAside.includes('Déconnexion'));

console.log('\n[Plus aucun lien mort]');
const liens = await page.locator('aside a').evaluateAll((n) => n.map((a) => a.getAttribute('href')));
console.log('   liens :', liens.join(' | '));
for (const href of liens) {
  if (!href || href.startsWith('http')) continue;
  const r = await page.request.get(SITE + href, { maxRedirects: 0 });
  check(`${href} répond (${r.status()})`, r.status() < 400, `statut ${r.status()}`);
}
// Un /merchant/<orgId> sans page derrière était un lien mort. Les segments
// statiques de l'espace, eux, sont de vraies pages — et sont vérifiés
// ci-dessus comme les autres.
const PAGES_STATIQUES = ['formule', 'orders', 'register'];
const nus = liens.filter(
  (h) => /^\/merchant\/[^/]+$/.test(h || '') && !PAGES_STATIQUES.includes(h.split('/')[2])
);
check('aucun lien vers /merchant/<orgId> nu', nus.length === 0, liens.join(','));
check('la formule est atteignable depuis le menu', liens.includes('/merchant/formule'), liens.join(','));

console.log('\n[Choisir une boutique la sélectionne vraiment]');
await page.locator('aside button', { hasText: 'Boulangerie Gare' }).click();
await page.waitForURL('**/dashboard', { timeout: 15000 });
const orgId = page.url().match(/merchant\/([^/]+)\//)?.[1];
const retenu = await page.evaluate((o) => localStorage.getItem(`currentStoreId:${o}`), orgId);
check('la boutique choisie est mémorisée', !!retenu, `clé currentStoreId:${orgId} = ${retenu}`);
await page.waitForTimeout(2000);
const enTete = await page.locator('header').first().innerText();
check('le tableau de bord ouvre bien la Gare', enTete.includes('Gare'), enTete.slice(0, 160));

console.log('\n[Une seule barre latérale dans la boutique]');
check('pas de barres empilées', await page.locator('aside').count() === 1, `n=${await page.locator('aside').count()}`);

console.log('\n[La deuxième boutique donne un résultat différent]');
await page.goto(`${SITE}/merchant`);
await page.waitForTimeout(2500);
await page.locator('aside button', { hasText: 'Boulangerie Centre' }).click();
await page.waitForURL('**/dashboard', { timeout: 15000 });
await page.waitForTimeout(2000);
const enTete2 = await page.locator('header').first().innerText();
check('le tableau de bord ouvre le Centre', enTete2.includes('Centre'), enTete2.slice(0, 160));

console.log('\n[Ancienne page /merchant/orders]');
await page.goto(`${SITE}/merchant/orders`);
await page.waitForTimeout(3000);
check('redirigée vers les commandes de la boutique', /\/merchant\/[^/]+\/orders/.test(page.url()), page.url());

check('aucune erreur JavaScript', erreurs.filter((e) => !/favicon|404 \(Not Found\)/.test(e)).length === 0, erreurs.slice(0, 3).join(' | '));

await nav.close();
console.log(`\n=== ${ok} réussites, ${ko.length} échecs ===`);
if (ko.length) console.log(ko.map((n) => '  - ' + n).join('\n'));
process.exit(ko.length ? 1 : 0);
