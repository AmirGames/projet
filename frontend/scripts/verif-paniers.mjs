/**
 * Un panier par commerce, dans un vrai navigateur.
 *
 * Tout était rangé sous une seule clé : le panier composé chez le commerce 1
 * réapparaissait chez le commerce 2, et la commande partait avec des articles
 * qui n'appartenaient pas à la boutique visée.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-paniers.mjs
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

// ===== Deux commerces, deux menus =====

await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` },
});

/** Un commerçant par boutique : la formule gratuite n'en autorise qu'une. */
const ouvrirBoutique = async (suffixe, nomDuPlat, prix) => {
  const compte = await appeler('/api/auth/signup', {
    method: 'POST',
    corps: { email: `m${suffixe}-${uniq}@t.fr`, password: MDP, name: `M${suffixe} ${uniq}` },
  });

  const jeton = compte.donnees.accessToken;
  const slug = `commerce${suffixe}-${uniq}`;

  const boutique = await appeler('/api/stores', {
    method: 'POST',
    jeton,
    corps: {
      orgId: compte.donnees.organization.id,
      name: `Commerce ${suffixe} ${uniq}`,
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

  await appeler('/api/products', {
    method: 'POST',
    jeton,
    corps: { storeId, name: nomDuPlat, price: prix, status: 'ACTIVE' },
  });

  return { storeId, slug, nom: `Commerce ${suffixe} ${uniq}`, plat: nomDuPlat };
};

const un = await ouvrirBoutique('1', `Pizza ${uniq}`, 12);
const deux = await ouvrirBoutique('2', `Burger ${uniq}`, 9);

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

const texte = () => page.locator('body').innerText();
const ajouterAuPanier = (plat) =>
  page.locator(`button[aria-label="Ajouter ${plat} au panier"]`).first().click();

// ===== La page du restaurant =====

titre('Un panier chez le commerce 1');
await page.goto(`${SITE}/restaurant/${un.storeId}`);
await page.waitForTimeout(3500);

check('le menu du commerce 1 est là', (await texte()).includes(un.plat), (await texte()).slice(0, 300));

await ajouterAuPanier(un.plat);
await page.waitForTimeout(600);
await ajouterAuPanier(un.plat);
await page.waitForTimeout(800);

const chezUn = await texte();
check('son plat est au panier', chezUn.includes(un.plat), chezUn.slice(0, 600));
check('la quantité est de deux', /\b2\b/.test(chezUn), chezUn.slice(0, 600));

titre('En passant chez le commerce 2');
await page.goto(`${SITE}/restaurant/${deux.storeId}`);
await page.waitForTimeout(3500);

const chezDeux = await texte();
check('le menu du commerce 2 est là', chezDeux.includes(deux.plat), chezDeux.slice(0, 300));

// Le cœur du correctif.
check('le panier du commerce 1 ne suit pas', !chezDeux.includes(un.plat), chezDeux.slice(0, 800));
check('le panier y est vide', /Votre panier est vide/.test(chezDeux), chezDeux.slice(0, 800));
check(
  'mais le panier laissé ailleurs est rappelé',
  /panier vous attend ailleurs/i.test(chezDeux),
  chezDeux.slice(0, 900)
);
check('avec le nom du commerce', chezDeux.includes(un.nom), chezDeux.slice(0, 900));
check('et son nombre d’articles', /2 articles/.test(chezDeux), chezDeux.slice(0, 900));

titre('Le commerce 2 a son propre panier');
await ajouterAuPanier(deux.plat);
await page.waitForTimeout(800);

const deuxRempli = await texte();
check('son plat s’y ajoute', deuxRempli.includes(deux.plat), deuxRempli.slice(0, 700));
check('sans ramener celui du commerce 1', !new RegExp(`${un.plat}\\s*\\n`).test(deuxRempli), deuxRempli.slice(0, 700));

titre('Retour chez le commerce 1');
await page.goto(`${SITE}/restaurant/${un.storeId}`);
await page.waitForTimeout(3500);

const retour = await texte();
check('son panier est retrouvé intact', retour.includes(un.plat), retour.slice(0, 700));
check('la quantité est conservée', /\b2\b/.test(retour), retour.slice(0, 700));
check(
  'le panier du commerce 2 est signalé à son tour',
  retour.includes(deux.nom),
  retour.slice(0, 900)
);

titre('Vider un panier ne touche pas l’autre');
// On retire les deux unités du commerce 1.
await page.locator(`button[aria-label="Retirer un ${un.plat}"]`).first().click();
await page.waitForTimeout(500);
await page.locator(`button[aria-label="Retirer un ${un.plat}"]`).first().click();
await page.waitForTimeout(800);

const vide = await texte();
check('le panier du commerce 1 est vide', /Votre panier est vide/.test(vide), vide.slice(0, 700));
check('celui du commerce 2 est intact', vide.includes(deux.nom), vide.slice(0, 900));

// ===== La vitrine =====

titre('La vitrine garde aussi son panier');
await page.goto(`${SITE}/store/${deux.slug}`);
await page.waitForTimeout(3500);

await page.locator('button', { hasText: 'Panier' }).first().click();
await page.waitForTimeout(1000);

const vitrineDeux = await texte();
check(
  'le panier du commerce 2 y est retrouvé',
  vitrineDeux.includes(deux.plat),
  vitrineDeux.slice(0, 900)
);
check('celui du commerce 1 n’y est pas', !vitrineDeux.includes(un.plat), vitrineDeux.slice(0, 900));

titre('Le panier de la vitrine survit à la navigation');
// Il n'était gardé qu'en mémoire : quitter la page le perdait.
await page.goto(`${SITE}/restaurants`);
await page.waitForTimeout(2000);
await page.goto(`${SITE}/store/${deux.slug}`);
await page.waitForTimeout(3500);

await page.locator('button', { hasText: 'Panier' }).first().click();
await page.waitForTimeout(1000);

const apresAllerRetour = await texte();
check(
  'il est toujours là',
  apresAllerRetour.includes(deux.plat),
  apresAllerRetour.slice(0, 900)
);

titre('La vitrine du commerce 1 reste vide');
await page.goto(`${SITE}/store/${un.slug}`);
await page.waitForTimeout(3500);
await page.locator('button', { hasText: 'Panier' }).first().click();
await page.waitForTimeout(1000);

const vitrineUn = await texte();
check(
  'aucun article du commerce 2 ne s’y invite',
  !vitrineUn.includes(deux.plat),
  vitrineUn.slice(0, 900)
);

// ===== L'ancienne clé =====

titre('L’ancienne clé est abandonnée');
const heritee = await page.evaluate(() => localStorage.getItem('cart'));
check('elle n’existe plus', heritee === null, `${heritee}`);

const magasin = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem('zupone-paniers') || '{}');
  } catch {
    return {};
  }
});

check(
  'les paniers sont rangés par boutique',
  Object.keys(magasin).includes(deux.storeId),
  JSON.stringify(Object.keys(magasin))
);
check(
  'le commerce vidé a disparu du magasin',
  !Object.keys(magasin).includes(un.storeId),
  JSON.stringify(Object.keys(magasin))
);

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|403|RSC payload|Auth refresh/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
