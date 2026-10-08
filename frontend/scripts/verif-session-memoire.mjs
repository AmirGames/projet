/**
 * La session du navigateur : jeton d'accès en mémoire, cookie httpOnly.
 *
 * Prouve que :
 *   - le stockage local ne contient aucun jeton (ni accessToken, driverToken,
 *     refreshToken, token — pas même une chaîne qui ressemble à un JWT) ;
 *   - un jeton ancien laissé par une version précédente est purgé, pas migré ;
 *   - recharger la page garde la connexion (le cookie redonne un jeton) ;
 *   - la déconnexion ferme la session : le rechargement n'y change rien ;
 *   - (facultatif) la déconnexion ferme aussi la session sur un autre domaine.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-session-memoire.mjs
 *
 * Avec la connexion unique active (domaines configurés, voir verif-domaines),
 * ajouter un second domaine du site pour le dernier volet :
 *   VERIF_AUTRE_SITE_URL=http://manager.zupeat.localhost:3000
 */

import { chromium } from 'playwright';
import { connecterNavigateur } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';
const AUTRE_SITE = process.env.VERIF_AUTRE_SITE_URL || '';

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
    headers: { 'Content-Type': 'application/json' },
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
  });
  return { statut: reponse.status, donnees: await reponse.json().catch(() => null) };
};

/** Tout ce que le stockage du navigateur contient, clés et valeurs. */
const stockage = (page) =>
  page.evaluate(() => {
    const sortie = {};
    for (const [nom, zone] of [['local', localStorage], ['session', sessionStorage]]) {
      for (let i = 0; i < zone.length; i++) sortie[`${nom}:${zone.key(i)}`] = zone.getItem(zone.key(i));
    }
    return sortie;
  });

const aucunJeton = (contenu) => {
  const suspects = Object.entries(contenu).filter(
    ([cle, valeur]) =>
      /^(local|session):(accessToken|driverToken|refreshToken|token)$/.test(cle) ||
      /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/.test(String(valeur)),
  );
  return { propre: suspects.length === 0, detail: suspects.map(([cle]) => cle).join(', ') };
};

/** Connecté = la page protégée (/dashboard) s'ouvre sans renvoi vers la connexion. */
const estConnecte = async (page, site) => {
  await page.goto(`${site}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  return !/\/login/.test(page.url());
};

// ===== Le décor =====
const email = `m-${uniq}@t.fr`;
const compte = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email, password: MDP, confirmPassword: MDP, name: `Memoire ${uniq}`, conditionsAcceptees: true },
});
if (!compte.donnees?.accessToken) {
  console.error(`Inscription impossible : ${JSON.stringify(compte.donnees)?.slice(0, 200)}`);
  process.exit(1);
}

const nav = await chromium.launch();
const contexte = await nav.newContext();
const page = await contexte.newPage();

// ===== Rien de l'ancien stockage ne survit =====
titre('Un ancien jeton laissé par une version précédente est purgé');
await page.addInitScript(() => {
  if (sessionStorage.getItem('__semis')) return;
  sessionStorage.setItem('__semis', '1');
  const faux = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.signature-de-test';
  for (const cle of ['accessToken', 'driverToken', 'refreshToken', 'token']) localStorage.setItem(cle, faux);
});
await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
let contenu = await stockage(page);
let verdict = aucunJeton(contenu);
check('les anciennes clés sont supprimées au chargement', verdict.propre, verdict.detail);

// ===== Connexion =====
titre('Il se connecte');
const statut = await connecterNavigateur(page, SITE, { email, password: MDP });
check('la connexion par le site aboutit', statut === 200, `${statut}`);
const cookies = await contexte.cookies();
const refresh = cookies.find((c) => c.name === 'zup_refresh');
check('le renouvellement est dans un cookie httpOnly', !!refresh?.httpOnly, JSON.stringify(refresh));
check('le cookie n’est pas lisible par la page', !(await page.evaluate(() => document.cookie)).includes('zup_refresh'));

// ===== Rechargement =====
titre('Recharger la page garde la connexion');
check('la page protégée s’ouvre', await estConnecte(page, SITE), page.url());
let apresChargement = 0;
page.on('response', (r) => {
  if (r.url().endsWith('/api/auth/refresh') && r.status() === 200) apresChargement++;
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
check('toujours connecté après rechargement', !/\/login/.test(page.url()), page.url());
check('le jeton est redemandé au cookie (POST /api/auth/refresh)', apresChargement >= 1, `${apresChargement} appel(s)`);

titre('Le stockage ne contient aucun jeton');
contenu = await stockage(page);
verdict = aucunJeton(contenu);
check('ni clé de jeton, ni JWT dans localStorage / sessionStorage', verdict.propre, verdict.detail);
const indice = contenu['local:sessionOuverte'];
check('seul un indice sans secret reste (sessionOuverte)', indice === undefined || indice === '1', `${indice}`);

// ===== Un deuxième onglet =====
titre('Un autre onglet du même navigateur est connecté sans rien reposer');
const onglet = await contexte.newPage();
check('connecté dans le nouvel onglet', await estConnecte(onglet, SITE), onglet.url());
verdict = aucunJeton(await stockage(onglet));
check('et son stockage ne contient pas de jeton non plus', verdict.propre, verdict.detail);

// ===== Autre domaine (facultatif) =====
if (AUTRE_SITE) {
  titre('Un autre domaine du site reçoit la session');
  const autre = await contexte.newPage();
  check('connecté sur l’autre domaine', await estConnecte(autre, AUTRE_SITE), autre.url());
  await autre.close();
}

// ===== Déconnexion =====
titre('La déconnexion ferme la session');
await page.goto(`${SITE}/dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.locator('nav button:has-text("Déconnexion"), header button:has-text("Déconnexion")').first().click({ timeout: 10000 });
await page.waitForTimeout(2500);
check('retour à la connexion', /\/login/.test(page.url()), page.url());
const apres = (await contexte.cookies()).find((c) => c.name === 'zup_refresh');
check('le cookie de renouvellement est effacé', !apres || !apres.value, JSON.stringify(apres));
check('le rechargement ne reconnecte pas', !(await estConnecte(page, SITE)), page.url());
check('l’autre onglet n’est plus connecté non plus', !(await estConnecte(onglet, SITE)), onglet.url());
verdict = aucunJeton(await stockage(page));
check('toujours aucun jeton dans le stockage', verdict.propre, verdict.detail);

// L'ancien refresh ne vaut plus rien côté serveur.
if (refresh) {
  const reponse = await fetch(`${API}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(SITE).origin },
    body: JSON.stringify({ refreshToken: decodeURIComponent(refresh.value) }),
  });
  check('l’ancien jeton de renouvellement est refusé par l’API', reponse.status === 401 || reponse.status === 403, `${reponse.status}`);
}

if (AUTRE_SITE) {
  titre('Et sur l’autre domaine');
  const autre = await contexte.newPage();
  check('la session y est fermée aussi', !(await estConnecte(autre, AUTRE_SITE)), autre.url());
}

await nav.close();
console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
