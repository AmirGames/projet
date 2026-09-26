/**
 * Parcours complet « mot de passe oublié », dans un vrai navigateur.
 *
 * Du lien sur la page de connexion jusqu'à la reconnexion avec le nouveau
 * mot de passe, en passant par le courriel réellement reçu. Playwright n'est
 * pas une dépendance du projet :
 *
 *   npm i -D playwright && npx playwright install chromium
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-mot-de-passe-oublie.mjs
 *
 * Le serveur de courriel de développement doit être libre sur le port 1025 :
 * ce script en ouvre un le temps du parcours.
 */

import { chromium } from 'playwright';

import { ouvrirBoiteAuxLettres } from '../../backend/scripts/verification/boite-aux-lettres.mjs';

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

const boite = await ouvrirBoiteAuxLettres(1025);
const nav = await chromium.launch();
const page = await nav.newPage();

const identifiant = Date.now().toString(36);
const email = `parcours-${identifiant}@test.fr`;
const ancienMotDePasse = 'Password123!';
const nouveauMotDePasse = 'ToutAutre456!';

// Le compte est créé par l'API : ce script vérifie le parcours de
// récupération, pas l'inscription.
await fetch(`${API}/api/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conditionsAcceptees: true, email, password: ancienMotDePasse, name: `Parcours ${identifiant}` }),
});
boite.vider();

titre('Depuis la page de connexion');
await page.goto(`${SITE}/login`);
const lienOubli = page.locator('a[href="/mot-de-passe-oublie"]');
check('le lien « Mot de passe oublié » est proposé', (await lienOubli.count()) > 0);

await lienOubli.first().click();
await page.waitForURL('**/mot-de-passe-oublie', { timeout: 10000 });
check('il mène au formulaire', page.url().includes('/mot-de-passe-oublie'), page.url());

titre('Demande du lien');
await page.fill('input[type="email"]', email);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

const confirmation = await page.locator('body').innerText();
check('la page confirme l\'envoi', /Regardez vos e-mails/i.test(confirmation), confirmation.slice(0, 120));
check(
  'elle ne dit pas si le compte existe',
  /Si un compte existe/i.test(confirmation),
  confirmation.slice(0, 200)
);

const courriel = await boite.attendre((m) => m.destinataire.includes(email));
check('le courriel arrive', !!courriel);

const lien = courriel?.lien('/reinitialiser');
check('il contient un lien de réinitialisation', !!lien, courriel?.contenu?.slice(0, 150));

titre('Nouveau mot de passe');
// Le lien pointe vers l'adresse configurée côté serveur ; on ne garde que le
// chemin pour rester sur le site visé par ce script.
const chemin = lien ? new URL(lien).pathname + new URL(lien).search : '';
await page.goto(SITE + chemin);
await page.waitForTimeout(1500);

const champs = page.locator('input[type="password"]');
check('deux champs sont demandés', (await champs.count()) === 2, `n=${await champs.count()}`);

await champs.nth(0).fill(nouveauMotDePasse);
await champs.nth(1).fill('PasLeMeme999!');
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
check(
  'deux saisies différentes sont refusées',
  /ne sont pas identiques/i.test(await page.locator('body').innerText())
);

await champs.nth(1).fill(nouveauMotDePasse);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
check(
  'le changement est confirmé',
  /Mot de passe modifié/i.test(await page.locator('body').innerText()),
  (await page.locator('body').innerText()).slice(0, 150)
);

titre('Reconnexion');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', ancienMotDePasse);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
check(
  'l\'ancien mot de passe est refusé',
  page.url().includes('/login') && /incorrect/i.test(await page.locator('body').innerText()),
  page.url()
);

await page.fill('input[type="password"]', nouveauMotDePasse);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => undefined);
check('le nouveau mot de passe ouvre la session', !page.url().includes('/login'), page.url());

titre('Le lien ne sert qu\'une fois');
await page.goto(SITE + chemin);
await page.waitForTimeout(1500);
const champsRejeu = page.locator('input[type="password"]');
await champsRejeu.nth(0).fill('EncoreUnAutre000!');
await champsRejeu.nth(1).fill('EncoreUnAutre000!');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);
check(
  'le même lien est refusé la seconde fois',
  /n'est plus valable|valable/i.test(await page.locator('body').innerText()),
  (await page.locator('body').innerText()).slice(0, 150)
);

await nav.close();
await boite.fermer();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
