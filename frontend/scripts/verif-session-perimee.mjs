/**
 * Ce que voit quelqu'un dont la session n'est plus valable.
 *
 * Une base remise à zéro — ou un compte supprimé — laisse le navigateur porteur
 * d'un jeton signé pour un compte disparu. Le serveur répond 401, le contexte
 * d'authentification efface la session et l'écran repart vers la connexion…
 * sans un mot. L'utilisateur se retrouvait devant un formulaire vide, persuadé
 * d'avoir été déconnecté par erreur, et réessayait.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-session-perimee.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia } from './inscription.mjs';
import { entrerEspaceCommercant } from './connexion.mjs';

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

// Le premier compte inscrit devient la plateforme : celui qu'on suit doit être
// un commerçant ordinaire.
await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `Plateforme ${uniq}` },
});

const email = `s-${uniq}@t.fr`;

const compte = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email, password: MDP, name: `Session ${uniq}` },
});

if (!compte.donnees?.accessToken) {
  console.error(`Inscription impossible : ${JSON.stringify(compte.donnees)?.slice(0, 200)}`);
  process.exit(1);
}

const orgId = compte.donnees.organization.id;

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();

const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/401|403|net::ERR_/.test(m.text())) {
    erreurs.push(`${new URL(page.url()).pathname} : ${m.text().slice(0, 200)}`);
  }
});

titre('Il travaille normalement');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await entrerEspaceCommercant(page);
await page.waitForTimeout(1500);

// Le jeton d'accès n'est qu'en mémoire (lib/jeton-session.ts) : la session
// ouverte se voit au cookie httpOnly de renouvellement, pas au stockage.
const cookieOuvert = (await page.context().cookies()).find((c) => c.name === 'zup_refresh');
check('sa session est ouverte', !!cookieOuvert, 'pas de cookie zup_refresh');

titre('Sa session cesse d’être valable');
/**
 * Le cas réel : la base est remise à zéro pendant qu'un onglet reste ouvert, et
 * le navigateur garde une session pour un compte disparu. La session vit dans
 * le cookie httpOnly de renouvellement (le jeton d'accès n'est qu'en mémoire,
 * voir lib/jeton-session.ts) : on le remplace par une valeur que le serveur
 * refusera. La cause exacte importe peu, c'est le chemin qui compte :
 * renouvellement refusé (401), session effacée, retour à la connexion.
 */
const cookie = (await page.context().cookies()).find((c) => c.name === 'zup_refresh');
check('la session tient dans le cookie de renouvellement', !!cookie, 'pas de cookie zup_refresh');
if (cookie) {
  await page.context().addCookies([{ ...cookie, value: 'renouvellement-qui-ne-vaut-plus-rien' }]);
}

titre('La page le renvoie vers la connexion');
await page.goto(`${SITE}/merchant/${orgId}/dashboard`);
await page.waitForTimeout(4000);

check('il est ramené à la connexion', page.url().includes('/login'), page.url());

const texte = await page.locator('body').innerText();
check(
  'et on lui dit pourquoi',
  /session n’est plus valable|session n'est plus valable/.test(texte),
  texte.slice(0, 600)
);

titre('Le message ne s’incruste pas');
// Lu une fois, puis retiré : sinon il réapparaîtrait à chaque visite.
await page.reload();
await page.waitForTimeout(2000);
const rechargee = await page.locator('body').innerText();
check(
  'il a disparu au rechargement',
  !/session n’est plus valable|session n'est plus valable/.test(rechargee),
  rechargee.slice(0, 400)
);

titre('Et la session effacée ne traîne pas');
const restes = await page.evaluate(() => ({
  jetons: ['accessToken', 'driverToken', 'refreshToken', 'token'].filter((c) => localStorage.getItem(c) !== null),
  indice: localStorage.getItem('sessionOuverte'),
}));
check('aucun jeton ne traîne dans le stockage', restes.jetons.length === 0, restes.jetons.join(','));
check('l’indice de session est effacé', !restes.indice, `${restes.indice}`);

titre('Il peut se reconnecter');
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await entrerEspaceCommercant(page);
check('la reconnexion aboutit', page.url().includes('/merchant'), page.url());

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
