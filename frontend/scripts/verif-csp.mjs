/**
 * La Content-Security-Policy à nonces (proxy.ts, lib/csp.ts).
 *
 * En enforce, vérifie que :
 *   - chaque page HTML reçoit une politique avec un nonce neuf, et que TOUS
 *     ses scripts (en ligne ou externes) le portent ;
 *   - l'API et la route de rapports n'en reçoivent pas ;
 *   - le navigateur n'émet aucune violation sur les parcours courants ;
 *   - un script injecté sans nonce est signalé puis bloqué.
 * Le mode report-only n'est pas une preuve exploitable actuellement : Next.js
 * n'ajoute pas de nonce à ses scripts runtime, ce qui fait échouer les contrôles ;
 *   - /api/csp-report accepte un rapport et ne renvoie jamais d'erreur.
 *
 *   CSP_MODE=enforce REQUIRE_CSP_ENFORCE=1 VERIF_SITE_URL=http://localhost:3000 node scripts/verif-csp.mjs
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const EXIGER_ENFORCE = process.env.REQUIRE_CSP_ENFORCE === '1';
const PAGES = ['/', '/login', '/signup', '/client', '/checkout', '/driver/login', '/mot-de-passe-oublie', '/devenir-livreur', '/zupdrive', '/trajet', '/societe'];

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
  const { dynamique, observation, enforce, mode } = lirePolitique(reponse);
  const nonce = /'nonce-([^']+)'/.exec(dynamique || '')?.[1];
  check(`${chemin} : politique avec nonce`, !!nonce, `${reponse.status}`);
  check(`${chemin} : COOP préserve les popups de paiement`, reponse.headers.get('cross-origin-opener-policy') === 'same-origin-allow-popups');
  check(`${chemin} : CORP limite l’intégration cross-origin`, reponse.headers.get('cross-origin-resource-policy') === 'same-origin');
  check(
    `${chemin} : protections fixes maintenues en report-only`,
    !observation || (/frame-ancestors 'self'/.test(enforce) && /form-action 'self'/.test(enforce) && /object-src 'none'/.test(enforce)),
  );
  if (!nonce) continue;
  check(`${chemin} : form-action limité au site`, /form-action 'self'/.test(dynamique));
  check(
    `${chemin} : CSP appliquée en production`,
    !EXIGER_ENFORCE || (mode === 'enforce' && enforce.includes(`'nonce-${nonce}'`) && !observation?.includes(`'nonce-${nonce}'`)),
    mode,
  );
  check(
    `${chemin} : aucune CSP partielle concurrente`,
    !EXIGER_ENFORCE || (enforce.match(/frame-ancestors/g) || []).length === 1,
  );
  nonces.add(nonce);

  const balises = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  const sansNonce = balises.filter((b) => !b.includes(`nonce="${nonce}"`));
  check(`${chemin} : ${balises.length} scripts, tous avec le nonce`, balises.length > 0 && sansNonce.length === 0, sansNonce[0]?.slice(0, 120));
  check(`${chemin} : pas de unsafe-inline dans script-src`, !/script-src[^;]*'unsafe-inline'/.test(dynamique));
  check(`${chemin} : directives fixes conservées`, /frame-ancestors/.test(reponse.headers.get('content-security-policy') || '') || /frame-ancestors/.test(dynamique));
}
check('un nonce différent à chaque requête', nonces.size === PAGES.length, `${nonces.size}/${PAGES.length}`);
const cspCheckout = await fetch(`${SITE}/checkout`).then((r) => lirePolitique(r).dynamique || '');
check('checkout : CSP autorise l’iframe Stripe 3DS', /frame-src[^;]*https:\/\/\*\.stripe\.com/.test(cspCheckout));
check('checkout : CSP autorise les appels Stripe 3DS', /connect-src[^;]*https:\/\/\*\.stripe\.network/.test(cspCheckout));

const api = await fetch(`${SITE}/api/health`);
check('/api/health : sans politique dynamique', !lirePolitique(api).dynamique);

titre('Navigateur : aucune violation sur les parcours courants');
const candidatsNavigateur = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];
const executableNavigateur = candidatsNavigateur.find((chemin) => chemin && existsSync(chemin));
if (!executableNavigateur && !existsSync(chromium.executablePath())) {
  throw new Error('Chromium Playwright absent : installez Chromium ou définissez PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
}
const nav = await chromium.launch(executableNavigateur ? { executablePath: executableNavigateur } : undefined);
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
