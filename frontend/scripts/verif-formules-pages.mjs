/**
 * Les deux pages des formules, dans un vrai navigateur.
 *
 * Côté plateforme : régler un tarif et un quota sans passer par le code.
 * Côté commerçant : savoir à quoi il a souscrit, et demander autre chose.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-formules-pages.mjs
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

await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
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

// ===== Côté plateforme =====

titre('La grille, côté plateforme');
await connecter(`p-${uniq}@t.fr`);
await page.goto(`${SITE}/superowner/formules`);
await page.waitForTimeout(3000);

const grille = await page.locator('body').innerText();
check('la page s’ouvre', /Formules/.test(grille), grille.slice(0, 200));
check('les trois formules sont là', /FREE/.test(grille) && /PREMIUM/.test(grille) && /PRO/.test(grille), grille.slice(0, 400));
check('le nombre d’abonnés est affiché', /abonné/.test(grille), grille.slice(0, 400));

const lienMenu = await page.locator('a[href="/superowner/formules"]').count();
check('un lien y mène depuis le menu', lienMenu >= 1, `n=${lienMenu}`);

titre('Régler la formule Premium');
const nom = page.locator('#nom-PREMIUM');
const prix = page.locator('#prix-PREMIUM');
const quota = page.locator('#quota-PREMIUM');

check('les champs sont éditables', (await nom.count()) === 1 && (await prix.count()) === 1, 'champ absent');

// Le bouton ne doit pas être actif tant que rien n'a changé : enregistrer à
// vide ferait croire à une modification.
const boutonPremium = page
  .locator('section')
  .filter({ hasText: 'PREMIUM' })
  .locator('button', { hasText: 'Enregistrer' });

check('« Enregistrer » est éteint au départ', await boutonPremium.first().isDisabled(), 'actif à tort');

await nom.fill(`Confort ${uniq}`);
await prix.fill('24.5');
await quota.fill('4');
await page.waitForTimeout(300);

check('il s’allume après une modification', !(await boutonPremium.first().isDisabled()), 'resté éteint');

await boutonPremium.first().click();
await page.waitForTimeout(2500);

const apres = await page.locator('body').innerText();
check('l’enregistrement est confirmé', /enregistrée/i.test(apres), apres.slice(0, 300));

// Le contrôle qui compte : la base, pas l'écran.
const relue = await appeler('/api/superowner/plans', {
  jeton: plateforme.donnees.accessToken,
});
const premium = (relue.donnees?.data || []).find((f) => f.code === 'PREMIUM');

check('le nom est enregistré', premium?.libelle === `Confort ${uniq}`, premium?.libelle);
check('le tarif est enregistré', premium?.prixMensuel === 24.5, `${premium?.prixMensuel}`);
check('le quota est enregistré', premium?.maxBoutiques === 4, `${premium?.maxBoutiques}`);

titre('Ajouter un argument de vente');
await page.reload();
await page.waitForTimeout(2500);

const sectionPremium = page.locator('section').filter({ hasText: 'PREMIUM' });
await sectionPremium.locator('button', { hasText: 'Ajouter une ligne' }).first().click();
await page.waitForTimeout(300);

const champs = sectionPremium.locator('input[aria-label^="Argument"]');
await champs.last().fill(`Livraison offerte ${uniq}`);
await sectionPremium.locator('button', { hasText: 'Enregistrer' }).first().click();
await page.waitForTimeout(2500);

const avecArgument = await appeler('/api/superowner/plans', {
  jeton: plateforme.donnees.accessToken,
});
const argumente = (avecArgument.donnees?.data || []).find((f) => f.code === 'PREMIUM');

check(
  'l’argument est enregistré',
  (argumente?.avantages || []).includes(`Livraison offerte ${uniq}`),
  JSON.stringify(argumente?.avantages)
);

titre('Un quota sous l’existant est refusé');
await page.locator('#quota-FREE').fill('0');
await page.waitForTimeout(300);
await page
  .locator('section')
  .filter({ hasText: 'FREE' })
  .locator('button', { hasText: 'Enregistrer' })
  .first()
  .click();
await page.waitForTimeout(2500);

const refus = await page.locator('body').innerText();
check('le refus est affiché', /au moins une boutique|refus|impossible/i.test(refus), refus.slice(0, 300));

const inchangee = await appeler('/api/superowner/plans', {
  jeton: plateforme.donnees.accessToken,
});
check(
  'la formule Gratuit n’a pas bougé',
  (inchangee.donnees?.data || []).find((f) => f.code === 'FREE')?.maxBoutiques === 1,
  JSON.stringify(inchangee.donnees?.data?.find((f) => f.code === 'FREE'))
);

// ===== Côté commerçant =====

titre('Ma formule, côté commerçant');
await connecter(`m-${uniq}@t.fr`);
await page.goto(`${SITE}/merchant/formule`);
await page.waitForTimeout(3000);

const vue = await page.locator('body').innerText();
check('la page s’ouvre', /Ma formule/.test(vue), vue.slice(0, 200));
check('sa formule est nommée', /Gratuit/.test(vue), vue.slice(0, 400));
check('son usage est chiffré', /1 boutique sur 1/.test(vue), vue.slice(0, 500));
check(
  'le nom réglé par la plateforme apparaît',
  vue.includes(`Confort ${uniq}`),
  vue.slice(0, 600)
);
check('le tarif réglé apparaît', /24[,.]50/.test(vue), vue.slice(0, 600));
check(
  'l’argument ajouté apparaît',
  vue.includes(`Livraison offerte ${uniq}`),
  vue.slice(0, 800)
);
check('sa formule est signalée « En cours »', /en cours/i.test(vue), vue.slice(0, 400));

const lienBarre = await page.locator('a[href="/merchant/formule"]').count();
check('un lien y mène depuis la barre latérale', lienBarre >= 1, `n=${lienBarre}`);

titre('Demander une formule supérieure');
const demander = page.locator('button', { hasText: 'Demander cette formule' });
check('deux formules sont proposables', (await demander.count()) === 2, `n=${await demander.count()}`);

await demander.first().click();
await page.waitForTimeout(3000);

const apresDemande = await page.locator('body').innerText();
check('la demande est confirmée', /Demande envoyée/i.test(apresDemande), apresDemande.slice(0, 400));
check('elle est rappelée sur la page', /en attente du support/i.test(apresDemande), apresDemande.slice(0, 500));

const boutonsApres = page.locator('button', { hasText: 'Demander cette formule' });
const desactives = await page.locator('button:disabled').count();
check('les boutons sont bloqués', desactives >= (await boutonsApres.count()), `n=${desactives}`);

// Le ticket existe vraiment, et la plateforme le voit.
const tickets = await appeler('/api/superowner/support-tickets', {
  jeton: plateforme.donnees.accessToken,
});
const liste = tickets.donnees?.tickets || [];
const ticket = liste.find((t) => (t.title || '').startsWith('Demande de formule'));

check('le support reçoit la demande', Boolean(ticket), JSON.stringify(liste)?.slice(0, 300));
check(
  'le ticket nomme la formule visée',
  (ticket?.title || '').includes(`Confort ${uniq}`),
  ticket?.title
);
check(
  'il chiffre la formule actuelle et la demandée',
  /Formule actuelle/.test(ticket?.description || '') && /24[.,]5/.test(ticket?.description || ''),
  (ticket?.description || '').slice(0, 200)
);

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|RSC payload|Auth refresh/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
