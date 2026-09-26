/**
 * La cloche de notifications, dans les deux espaces.
 *
 * Elle n'existait que dans l'espace d'une boutique : la plateforme et le
 * choix du commerce s'en passaient, si bien qu'un ticket ou une réponse du
 * support n'arrivait nulle part tant qu'on n'avait pas changé de page.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-cloche.mjs
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
const MDP = 'Password123!';

// ===== Le décor =====

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` },
});

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` },
});

const T = commercant.donnees.accessToken;
const ORG = commercant.donnees.organization.id;

await appeler('/api/stores', {
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

const cloche = () => page.locator('button[aria-label^="Notifications"]');

/** La cloche est-elle bien dans l'en-tête, en haut à droite. */
const enHautADroite = async () => {
  const boite = await cloche().first().boundingBox();
  const fenetre = page.viewportSize();
  if (!boite || !fenetre) return false;

  // Dans le tiers droit, et dans les 120 premiers pixels de haut.
  return boite.x > fenetre.width * 0.66 && boite.y < 120;
};

// ===== L'espace plateforme =====

titre('La plateforme');
await connecter(`p-${uniq}@t.fr`);

const PAGES_PLATEFORME = [
  '/superowner',
  '/superowner/organizations',
  '/superowner/support-tickets',
  '/superowner/formules',
  '/superowner/audit-logs',
  '/superowner/system-config',
];

for (const chemin of PAGES_PLATEFORME) {
  await page.goto(SITE + chemin);
  await page.waitForTimeout(2000);
  check(`la cloche est sur ${chemin}`, (await cloche().count()) === 1, `n=${await cloche().count()}`);
}

check('elle est en haut à droite', await enHautADroite(), 'placée ailleurs');

titre('Elle s’ouvre et se ferme');
await cloche().first().click();
await page.waitForTimeout(600);
check('le panneau s’ouvre', /Notifications/.test(await page.locator('body').innerText()), 'panneau absent');

// Un panneau qui reste ouvert masque la page : il doit se refermer au clic
// ailleurs, et à la touche Échap.
await page.locator('h1').first().click({ force: true });
await page.waitForTimeout(600);
check(
  'un clic ailleurs le referme',
  (await page.locator('text=Aucune notification').count()) === 0,
  'resté ouvert'
);

await cloche().first().click();
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(
  'la touche Échap le referme',
  (await page.locator('text=Aucune notification').count()) === 0,
  'resté ouvert'
);

titre('La santé, sur le tableau de bord');
await page.goto(`${SITE}/superowner`);
await page.waitForTimeout(3000);

const tableau = await page.locator('body').innerText();
const chiffre = tableau.match(/Santé Système\s+(\d+)%/);

check('la carte affiche un pourcentage', Boolean(chiffre), tableau.slice(0, 500));
check('il n’est plus figé à 0 %', Number(chiffre?.[1]) > 0, chiffre?.[1]);

// Le tableau de bord ne porte que le chiffre : le détail a sa page.
check(
  'le détail n’encombre plus le tableau de bord',
  !/Base de données|Attribution des courses/.test(tableau),
  tableau.slice(0, 900)
);
// La carte du tableau de bord, pas le lien du menu : c'est elle qui doit
// mener au détail.
const carteSante = page.locator('main a[href="/superowner/health"]');
check('la carte mène à la page du détail', (await carteSante.count()) === 1, `n=${await carteSante.count()}`);

titre('La page Santé système');
await carteSante.first().click();
await page.waitForTimeout(3000);

check('le clic y mène', page.url().endsWith('/superowner/health'), page.url());

const sante = await page.locator('body').innerText();
check('le même pourcentage y figure', sante.includes(`${chiffre?.[1]}%`), sante.slice(0, 400));
check(
  'les cinq relevés sont nommés',
  ['Base de données', 'Ouverture du service', 'Sauvegardes', 'Attribution des courses', 'Webhooks'].every(
    (libelle) => sante.includes(libelle)
  ),
  sante.slice(0, 900)
);
check(
  'chaque relevé annonce ses points',
  (sante.match(/\d+ \/ \d+ points/g) || []).length === 5,
  JSON.stringify(sante.match(/\d+ \/ \d+ points/g))
);
check(
  'un relevé en défaut dit quoi faire',
  /Lancez une sauvegarde depuis Données/.test(sante),
  sante.slice(0, 900)
);
check('un relevé au vert est étiqueté', /rien à signaler/i.test(sante), sante.slice(0, 900));
check('un bouton permet de relever à nouveau', (await page.locator('button', { hasText: 'Relever à nouveau' }).count()) === 1, 'bouton absent');
check(
  'un retour au tableau de bord existe',
  (await page.locator('a[aria-label="Retour"]').count()) >= 1,
  'retour absent'
);
check(
  'un lien du menu y mène aussi',
  (await page.locator('aside a[href="/superowner/health"]').count()) === 1,
  'lien de menu absent'
);

titre('Un ticket allume la pastille');
await appeler('/api/support/tickets', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: ORG,
    subject: `Panne four ${uniq}`,
    description: 'Le four ne chauffe plus depuis ce matin.',
    priority: 'HIGH',
    category: 'TECHNICAL',
  },
});

// Aucun rechargement : le serveur pousse, la cloche doit suivre.
await page.waitForTimeout(3500);

const etiquette = await cloche().first().getAttribute('aria-label');
check('la cloche annonce une non-lue', /non lue/.test(etiquette || ''), etiquette);

await cloche().first().click();
await page.waitForTimeout(600);
const panneau = await page.locator('body').innerText();
check('le ticket est listé', panneau.includes(`Panne four ${uniq}`), panneau.slice(0, 400));
check('le commerçant est nommé', /Nouveau ticket/.test(panneau), panneau.slice(0, 400));

// ===== L'espace commerçant =====

titre('Le commerçant');
await connecter(`m-${uniq}@t.fr`);

const PAGES_COMMERCANT = ['/merchant', '/merchant/formule'];

for (const chemin of PAGES_COMMERCANT) {
  await page.goto(SITE + chemin);
  await page.waitForTimeout(2500);
  check(`la cloche est sur ${chemin}`, (await cloche().count()) === 1, `n=${await cloche().count()}`);
}

check('elle est en haut à droite', await enHautADroite(), 'placée ailleurs');

// Et dans l'espace d'une boutique, où elle existait déjà.
await page.goto(`${SITE}/merchant/${ORG}/dashboard`);
await page.waitForTimeout(3000);
check(
  'la cloche reste dans l’espace de la boutique',
  (await cloche().count()) === 1,
  `n=${await cloche().count()}`
);

titre('Chacun ne voit que ses notifications');
await page.goto(`${SITE}/merchant`);
await page.waitForTimeout(2500);
await cloche().first().click();
await page.waitForTimeout(800);

const vuCommercant = await page.locator('body').innerText();
check(
  'le commerçant ne voit pas l’alerte de la plateforme',
  !/Nouveau ticket/.test(vuCommercant),
  vuCommercant.slice(0, 400)
);

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|RSC payload|Auth refresh/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
