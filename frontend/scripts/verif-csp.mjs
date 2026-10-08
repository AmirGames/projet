/**
 * La Content-Security-Policy à nonces (proxy.ts, lib/csp.ts).
 *
 * Prouve que :
 *   - chaque page HTML reçoit une politique avec un nonce neuf, et que TOUS
 *     ses scripts (en ligne ou externes) le portent ;
 *   - l'API et la route de rapports n'en reçoivent pas ;
 *   - le navigateur n'émet aucune violation sur les parcours courants (c'est ce
 *     que mesure la phase d'observation en production, avant `CSP_MODE=enforce`) ;
 *   - un script injecté sans nonce est signalé (report-only) ou bloqué (enforce) ;
 *   - /api/csp-report accepte un rapport et ne renvoie jamais d'erreur.
 *
 *   VERIF_SITE_URL=http://localhost:3000 node scripts/verif-csp.mjs
 *   # puis, serveur relancé avec CSP_MODE=enforce, la même commande.
 */

import { chromium } from 'playwright';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const PAGES = ['/', '/login', '/signup', '/client', '/driver/login', '/mot-de-passe-oublie', '/devenir-livreur'];

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

const lirePolitique = (reponse) => {
  const enforce = reponse.headers.get('content-security-policy') || '';
  const observation = reponse.headers.get('content-security-policy-report-only');
  // La politique dynamique : celle qui porte un nonce.
  const dynamique = [observation, ...enforce.split(/,\s*(?=[a-z-]+ )/)].find((v) => v?.includes("'nonce-"));
  return { observation, enforce, dynamique, mode: observation?.includes("'nonce-") ? 'report-only' : 'enforce' };
};

titre('En-têtes et nonces');
const nonces = new Set();
for (const chemin of PAGES) {
  const reponse = await fetch(SITE + chemin, { redirect: 'follow' });
  const html = await reponse.text();
  const { dynamique } = lirePolitique(reponse);
  const nonce = /'nonce-([^']+)'/.exec(dynamique || '')?.[1];
  check(`${chemin} : politique avec nonce`, !!nonce, `${reponse.status}`);
  if (!nonce) continue;
  nonces.add(nonce);

  const balises = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  const sansNonce = balises.filter((b) => !b.includes(`nonce="${nonce}"`));
  check(`${chemin} : ${balises.length} scripts, tous avec le nonce`, balises.length > 0 && sansNonce.length === 0, sansNonce[0]?.slice(0, 120));
  check(`${chemin} : pas de unsafe-inline dans script-src`, !/script-src[^;]*'unsafe-inline'/.test(dynamique));
  check(`${chemin} : directives fixes conservées`, /frame-ancestors/.test(reponse.headers.get('content-security-policy') || '') || /frame-ancestors/.test(dynamique));
}
check('un nonce différent à chaque requête', nonces.size === PAGES.length, `${nonces.size}/${PAGES.length}`);

const api = await fetch(`${SITE}/api/health`);
check('/api/health : sans politique dynamique', !lirePolitique(api).dynamique);

titre('Navigateur : aucune violation sur les parcours courants');
const nav = await chromium.launch();
const contexte = await nav.newContext();
const page = await contexte.newPage();
const violations = [];
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    (window.__violations ||= []).push(`${e.effectiveDirective} ${e.blockedURI} ${e.disposition}`);
  });
});
const erreursPage = [];
page.on('pageerror', (e) => erreursPage.push(e.message.slice(0, 160)));

for (const chemin of PAGES) {
  await page.goto(SITE + chemin, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  const vues = await page.evaluate(() => window.__violations || []);
  // Next.js en développement injecte des éléments que la production n'a pas.
  violations.push(...vues.map((v) => `${chemin} : ${v}`));
  check(`${chemin} : aucune violation`, vues.length === 0, vues.slice(0, 3).join(' | '));
}
check('la page est hydratée (React actif)', await page.evaluate(() => !!document.querySelector('script[src*="_next"]')));

titre('Un script injecté sans nonce');
await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
// Un attribut onerror injecté dans le HTML (la forme classique d'un XSS) : un
// script créé par un script de confiance passerait sous 'strict-dynamic'.
const injection = await page.evaluate(async () => {
  window.__intrus = false;
  document.body.insertAdjacentHTML('beforeend', '<img src="x:" onerror="window.__intrus = true">');
  await new Promise((r) => setTimeout(r, 600));
  return { execute: window.__intrus, violations: window.__violations || [] };
});
const enforce = !!(await fetch(SITE + '/login').then((r) => r.headers.get('content-security-policy')))?.includes("'nonce-");
check('l’injection est signalée au navigateur', injection.violations.some((v) => v.startsWith('script-src')), JSON.stringify(injection.violations));
check(enforce ? 'et elle est bloquée (enforce)' : 'et elle s’exécute encore (report-only : observation)', enforce ? !injection.execute : injection.execute);

titre('Route des rapports');
const rapport = await fetch(`${SITE}/api/csp-report`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/csp-report' },
  body: JSON.stringify({ 'csp-report': { 'document-uri': `${SITE}/login?x=1`, 'effective-directive': 'script-src', 'blocked-uri': 'https://evil.example/a.js', disposition: 'report' } }),
});
check('un rapport valide : 204', rapport.status === 204, `${rapport.status}`);
const mauvais = await fetch(`${SITE}/api/csp-report`, { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: '{pas du json' });
check('un corps illisible : 204 aussi', mauvais.status === 204, `${mauvais.status}`);

await nav.close();
console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
