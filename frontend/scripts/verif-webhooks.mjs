/**
 * L'écran des webhooks.
 *
 * Il listait dix événements écrits en dur, dont neuf n'existaient pas côté
 * serveur : on s'abonnait à `payment.processed`, l'abonnement paraissait en
 * place, et rien n'arrivait jamais. Il jetait aussi le secret rendu à la
 * création — sans lui, aucune signature n'est vérifiable, et il n'est
 * récupérable nulle part ensuite.
 *
 * Le destinataire est un vrai serveur HTTP monté par ce script : on vérifie que
 * l'envoi d'essai déclenché depuis la page l'atteint pour de bon.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-webhooks.mjs
 */

import http from 'http';
import { chromium } from 'playwright';

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

// ===== Le destinataire =====

const recus = [];

const serveur = http.createServer((requete, reponse) => {
  let brut = '';
  requete.on('data', (bloc) => (brut += bloc));
  requete.on('end', () => {
    recus.push({ brut, evenement: requete.headers['x-webhook-event'] });
    reponse.writeHead(200);
    reponse.end();
  });
});

await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
const URL_RECEPTEUR = `http://127.0.0.1:${serveur.address().port}/zupone`;

// ===== Le décor =====

const emailPlateforme = `p-${uniq}@t.fr`;

const plateforme = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: emailPlateforme, password: MDP, name: `Plateforme ${uniq}` },
});

if (!plateforme.donnees?.accessToken) {
  console.error(`Inscription impossible : ${JSON.stringify(plateforme.donnees)?.slice(0, 200)}`);
  process.exit(1);
}

const TP = plateforme.donnees.accessToken;

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();

const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/400|401|403|net::ERR_/.test(m.text())) {
    erreurs.push(`${new URL(page.url()).pathname} : ${m.text().slice(0, 200)}`);
  }
});

const texte = () => page.locator('main').innerText();

titre('La plateforme ouvre les webhooks');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailPlateforme);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL('**/superowner**', { timeout: 15000 });
await page.waitForTimeout(1500);

await page.goto(`${SITE}/superowner/webhooks`);
await page.waitForTimeout(2500);

const accueil = await texte();
check('la page s’ouvre', /Webhooks/.test(accueil), accueil.slice(0, 300));
// Le comportement des relances doit être lisible sans ouvrir la documentation.
check('les relances sont annoncées', /relanc/i.test(accueil), accueil.slice(0, 500));

titre('Les événements proposés sont ceux du serveur');
await page.click('button:has-text("Nouvel abonnement")');
await page.waitForTimeout(800);

const formulaire = await texte();

for (const evenement of [
  'order.created',
  'order.status_changed',
  'merchant.suspended',
  'merchant.closed',
  'ticket.created',
  'ticket.message',
]) {
  check(`${evenement} est proposé`, formulaire.includes(evenement), 'absent');
}

// Ceux-là n'ont jamais existé côté serveur : les offrir était une promesse
// que rien ne tenait.
for (const fantome of ['payment.processed', 'user.registered', 'store.created', 'order.updated']) {
  check(`${fantome} n’est plus proposé`, !formulaire.includes(fantome), 'proposé à tort');
}

check(
  'chaque événement est expliqué',
  /Une commande vient d’être passée|Une commande vient d'être passée/.test(formulaire),
  formulaire.slice(0, 900)
);

titre('Elle crée un abonnement');
await page.fill('#champ-url', URL_RECEPTEUR);
await page.click('label:has-text("order.created") input[type="checkbox"]');
await page.click('button:has-text("Créer l’abonnement")');
await page.waitForTimeout(3000);

const apres = await texte();
check('l’abonnement apparaît', apres.includes(URL_RECEPTEUR), apres.slice(0, 600));

titre('Le secret est montré, une fois');
/**
 * Il n'est rendu qu'à la création et n'est récupérable nulle part ensuite : la
 * page le jetait pour recharger sa liste, et personne ne pouvait plus vérifier
 * une signature.
 */
const secret = page.locator('[data-secret-webhook]');
check('le secret est affiché', (await secret.count()) === 1, 'absent');

const valeur = (await secret.count()) === 1 ? await secret.innerText() : '';
check('c’est bien une clé', /^[0-9a-f]{64}$/.test(valeur.trim()), valeur.slice(0, 80));
check(
  'on prévient qu’il ne reviendra pas',
  /ne sera plus jamais affiché/.test(apres),
  apres.slice(0, 700)
);

const vuServeur = await appeler('/api/superowner/webhooks', { jeton: TP });
check(
  'le serveur ne le rend plus dans la liste',
  !JSON.stringify(vuServeur.donnees).includes(valeur.trim()),
  'secret exposé'
);

titre('L’envoi d’essai atteint le destinataire');
recus.length = 0;
await page.click(`button[aria-label="Envoi d’essai vers ${URL_RECEPTEUR}"]`);
await page.waitForTimeout(3000);

check('le destinataire a reçu l’essai', recus.length === 1, `${recus.length} reçu(s)`);
check('c’est bien un essai', recus[0]?.evenement === 'webhook.test', `${recus[0]?.evenement}`);

const retour = await texte();
check(
  'la page dit ce que le serveur a répondu',
  /a répondu 200/.test(retour),
  retour.slice(0, 500)
);

titre('L’historique montre l’envoi');
await page.click(`button[aria-label="Historique de ${URL_RECEPTEUR}"]`);
await page.waitForTimeout(1500);

const historique = await texte();
check('l’essai y figure', historique.includes('webhook.test'), historique.slice(0, 800));
check('avec le code rendu', /200/.test(historique), historique.slice(0, 800));

titre('La pause coupe les envois');
await page.click(`button[aria-label="Mettre en pause ${URL_RECEPTEUR}"]`);
await page.waitForTimeout(2000);

const enPause = await texte();
check('l’état passe en pause', /En pause/.test(enPause), enPause.slice(0, 500));

recus.length = 0;
await page.click(`button[aria-label="Envoi d’essai vers ${URL_RECEPTEUR}"]`);
await page.waitForTimeout(2500);
// L'essai part quand même — c'est un geste manuel —, mais le métier, lui, se tait.
await appeler('/api/support/tickets', {
  method: 'POST',
  jeton: TP,
  corps: { orgId: plateforme.donnees.organization.id, subject: `Muet ${uniq}`, description: 'Rien ne doit partir.' },
});
await page.waitForTimeout(1500);

check(
  'aucun événement métier ne part',
  recus.filter((r) => r.evenement !== 'webhook.test').length === 0,
  JSON.stringify(recus.map((r) => r.evenement))
);

titre('Et la réactivation les rétablit');
await page.click(`button[aria-label="Réactiver ${URL_RECEPTEUR}"]`);
await page.waitForTimeout(2000);

const reactive = await texte();
check('l’état repasse à actif', /Actif/.test(reactive), reactive.slice(0, 500));

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();
serveur.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
