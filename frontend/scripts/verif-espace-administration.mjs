/**
 * Vérifie l'espace d'administration unique, dans un vrai navigateur.
 *
 * Il y en avait trois — /admin, /super-admin, /superowner — avec les mêmes
 * écrans en plusieurs exemplaires. Ce script contrôle que tout est bien sous
 * /superowner, que chaque entrée du menu affiche une page, et que les
 * anciennes adresses mènent toujours quelque part.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/seed-demo.mjs          # depuis backend/
 *   VERIF_SITE_URL=http://localhost:3000 node scripts/verif-espace-administration.mjs
 */

import { chromium } from 'playwright';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';

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

/** Les anciennes adresses et là où elles doivent désormais mener. */
const ANCIENNES = {
  '/admin': '/superowner',
  '/admin/dashboard': '/superowner',
  '/admin/super-owner': '/superowner',
  '/admin/analytics': '/superowner/analytics',
  '/admin/audit-logs': '/superowner/audit-logs',
  '/admin/commissions': '/superowner/billing',
  '/admin/merchants': '/superowner/organizations',
  '/admin/stores': '/superowner/stores',
  '/admin/tickets': '/superowner/support-tickets',
  '/admin/settings': '/superowner/system-config',
  '/admin/settings/admin-settings': '/superowner/system-config',
  '/admin/orders': '/merchant',
  '/admin/products': '/merchant',
  '/admin/customers': '/merchant',
  '/admin/categories': '/merchant',
  '/super-admin': '/superowner',
  '/super-admin/access-logs': '/superowner/access-logs',
  '/super-admin/admin-management': '/superowner/user-management',
  '/super-admin/user-management': '/superowner/user-management',
  '/super-admin/analytics': '/superowner/analytics',
  '/super-admin/audit-logs': '/superowner/audit-logs',
  '/super-admin/commissions': '/superowner/billing',
  '/super-admin/exports': '/superowner/exports',
  '/super-admin/merchants': '/superowner/organizations',
  '/super-admin/notifications': '/superowner/notifications',
  '/super-admin/settings': '/superowner/system-config',
  '/super-admin/tickets': '/superowner/support-tickets',
};

const nav = await chromium.launch();
const page = await nav.newPage();

const erreurs = [];
// L'adresse au moment de l'erreur : sans elle, « Failed to fetch » ne dit pas
// quelle page a échoué.
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

titre('Connexion de la plateforme');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', 'super@demo.fr');
await page.fill('input[type="password"]', 'Password123!');
await page.click('button[type="submit"]');
await page.waitForURL('**/superowner', { timeout: 15000 });
check('la connexion mène à /superowner', page.url().endsWith('/superowner'), page.url());

await page.waitForTimeout(2000);

titre('Une seule barre latérale');
check('une barre latérale, et une seule', (await page.locator('aside').count()) === 1, `n=${await page.locator('aside').count()}`);

const texteMenu = await page.locator('aside').first().innerText();
check('elle ne renvoie plus vers un autre espace', !/SuperAdmin|Espace admin/i.test(texteMenu), texteMenu.slice(0, 200));

titre('Chaque entrée du menu affiche une page');
const entrees = await page
  .locator('aside a')
  .evaluateAll((liens) => liens.map((a) => ({ href: a.getAttribute('href'), texte: a.textContent?.trim() })));

check('le menu a au moins quinze entrées', entrees.length >= 15, `n=${entrees.length}`);

for (const { href, texte } of entrees) {
  if (!href) continue;

  await page.goto(SITE + href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  const corps = await page.locator('body').innerText();
  const introuvable = /404|introuvable|not found/i.test(corps.slice(0, 300));

  check(`${texte} (${href})`, !introuvable && corps.length > 50, introuvable ? '404' : `${corps.length} caractères`);
}

titre('Les anciennes adresses mènent toujours quelque part');
for (const [ancienne, attendue] of Object.entries(ANCIENNES)) {
  await page.goto(SITE + ancienne, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const arrivee = new URL(page.url()).pathname;
  check(`${ancienne} → ${attendue}`, arrivee === attendue, `arrivé sur ${arrivee}`);
}

titre('La fiche détaillée d\'un commerçant');
await page.goto(`${SITE}/superowner/organizations`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const liensFiche = await page
  .locator('a[href^="/superowner/organizations/"]')
  .evaluateAll((liens) => liens.map((a) => a.getAttribute('href')));

check('la liste mène à la fiche détaillée', liensFiche.length > 0, `n=${liensFiche.length}`);

if (liensFiche.length > 0) {
  await page.goto(SITE + liensFiche[0], { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const fiche = await page.locator('body').innerText();
  check('la fiche affiche le commerçant', !/introuvable|404/i.test(fiche.slice(0, 300)), fiche.slice(0, 150));
  check(
    'elle ne cherche pas un identifiant « undefined »',
    !erreurs.some((e) => e.includes('undefined')),
    erreurs.find((e) => e.includes('undefined')) || ''
  );
}

titre('Plus rien ne subsiste des anciens espaces');
for (const disparue of ['/admin/products/new', '/super-admin/merchants/inexistant']) {
  await page.goto(SITE + disparue, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const arrivee = new URL(page.url()).pathname;
  check(`${disparue} ne reste pas sur place`, !arrivee.startsWith('/admin') && !arrivee.startsWith('/super-admin'), arrivee);
}

const vraiesErreurs = erreurs.filter((e) => !/favicon|404 \(Not Found\)|Failed to load resource/i.test(e));
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
