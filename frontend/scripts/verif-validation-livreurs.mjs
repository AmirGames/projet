/**
 * La validation des livreurs, des deux côtés de l'écran.
 *
 * Côté livreur : son dossier, ses pièces, et l'impossibilité de se mettre en
 * ligne tant que la plateforme ne l'a pas validé. Côté plateforme : la page
 * qui n'existait pas, où l'on examine les pièces une à une puis on valide.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-validation-livreurs.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia } from './inscription.mjs';

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

const emailPlateforme = `p-${uniq}@t.fr`;
const emailLivreur = `livreur-${uniq}@t.fr`;

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailPlateforme, password: MDP, name: `Plateforme ${uniq}` },
});

if (!plateforme.donnees?.accessToken) {
  console.error(`Inscription de la plateforme impossible : ${JSON.stringify(plateforme.donnees)}`);
  process.exit(1);
}

const inscription = await appeler('/api/drivers/register', {
  method: 'POST',
  corps: {
    name: `Karim ${uniq}`,
    email: emailLivreur,
    password: MDP,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  },
});

const jetonLivreur = inscription.donnees?.accessToken;

if (!jetonLivreur) {
  console.error(`Inscription du livreur impossible : ${JSON.stringify(inscription.donnees)}`);
  process.exit(1);
}

// ===== Le navigateur =====

const nav = await chromium.launch();
const contexte = await nav.newContext();
const page = await contexte.newPage();

const erreurs = [];
page.on('console', (m) => {
  // Le script provoque exprès un refus de mise en ligne : le 403 qui en
  // résulte est le comportement attendu, pas une erreur de la page.
  if (m.type() === 'error' && !/403/.test(m.text())) {
    erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
  }
});

// ===== Côté livreur : le dossier =====

titre('Le livreur voit où en est son dossier');
await page.goto(`${SITE}/driver/login`);
await page.fill('input[type="email"]', emailLivreur);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL('**/driver', { timeout: 15000 });
await page.waitForTimeout(2500);

const espace = await page.locator('body').innerText();
check('son espace annonce l’attente de validation', /en cours de validation/i.test(espace), espace.slice(0, 300));
check('les pièces attendues sont listées', espace.includes('Permis de conduire'), espace.slice(0, 500));
check('la carte grise aussi, pour un scooter', espace.includes('Carte grise'), espace.slice(0, 500));
check('aucune n’est encore déposée', /Pas encore déposée/.test(espace), espace.slice(0, 500));

titre('Il dépose une pièce depuis son espace');
await page.selectOption('#piece-type', 'license');
await page.fill('#piece-lien', 'https://exemple.fr/permis.pdf');
await page.click('button:has-text("Déposer la pièce")');
await page.waitForTimeout(2500);

const apresDepot = await page.locator('body').innerText();
check('la pièce passe en attente d’examen', /En attente d’examen|En attente d'examen/.test(apresDepot), apresDepot.slice(0, 600));

const dossierApi = await appeler('/api/drivers/documents', { jeton: jetonLivreur });
check(
  'et elle est bien arrivée au serveur',
  (dossierApi.donnees?.data?.documents || []).some((piece) => piece.type === 'license'),
  JSON.stringify(dossierApi.donnees?.data?.documents)
);

titre('Il ne peut pas se mettre en ligne');
// Le bouton existe : c'est le serveur qui refuse, et l'écran doit le dire
// plutôt que de faire semblant de basculer.
const bascule = page.locator('button', { hasText: 'Hors ligne' }).first();

if (await bascule.count()) {
  await bascule.click();
  await page.waitForTimeout(2000);
}

const profil = await appeler('/api/drivers/me', { jeton: jetonLivreur });
check('il reste hors ligne', profil.donnees?.data?.isOnline === false, `${profil.donnees?.data?.isOnline}`);
check('et en attente', profil.donnees?.data?.status === 'PENDING', profil.donnees?.data?.status);

// Le bouton revenait en arrière sans un mot : le livreur cliquait et croyait
// à un bug.
const refus = await page.locator('body').innerText();
check('le refus lui est expliqué', /dossier est en cours de validation/i.test(refus), refus.slice(0, 600));

// Les trois pièces restantes passent par l'API : les redéposer une à une dans
// le navigateur ne vérifierait rien de plus que le dépôt déjà contrôlé.
for (const type of ['identity', 'insurance', 'vehicle_registration']) {
  await appeler('/api/drivers/documents', {
    method: 'POST',
    jeton: jetonLivreur,
    corps: { type, documentUrl: `https://exemple.fr/${type}.pdf` },
  });
}

// ===== Côté plateforme : l'examen =====

titre('La plateforme ouvre la page des livreurs');
// Son propre contexte, et non un onglet de plus : deux pages du même contexte
// partagent le `localStorage`, donc le jeton. La connexion de la plateforme
// écrasait celui du livreur, et les appels de l'espace livreur repartaient
// ensuite avec le mauvais compte — un 404 « aucun profil livreur » que rien
// dans le scénario n'expliquait.
const contextePlateforme = await nav.newContext();
const pagePlateforme = await contextePlateforme.newPage();
const erreursPlateforme = [];
pagePlateforme.on('console', (m) => {
  if (m.type() === 'error') erreursPlateforme.push(m.text());
});

await pagePlateforme.goto(`${SITE}/login`);
await pagePlateforme.fill('input[type="email"]', emailPlateforme);
await pagePlateforme.fill('input[type="password"]', MDP);
await pagePlateforme.click('button[type="submit"]');
await pagePlateforme.waitForURL('**/superowner**', { timeout: 15000 });
await pagePlateforme.waitForTimeout(1500);

const menu = await pagePlateforme.locator('aside').innerText();
check('« Livreurs » figure au menu', menu.includes('Livreurs'), menu.slice(0, 400));

await pagePlateforme.click('aside a:has-text("Livreurs")');
await pagePlateforme.waitForURL('**/superowner/drivers', { timeout: 15000 });
await pagePlateforme.waitForTimeout(2500);

const liste = await pagePlateforme.locator('main').innerText();
check('le livreur en attente est listé', liste.includes(`Karim ${uniq}`), liste.slice(0, 600));
check('son état est affiché', liste.includes('En attente'), liste.slice(0, 600));
check('le compte de pièces validées aussi', /0\/4 pièces validées/.test(liste), liste.slice(0, 600));

titre('Elle ouvre le dossier');
await pagePlateforme.click(`button:has-text("Karim ${uniq}")`);
await pagePlateforme.waitForTimeout(2000);

const ouvert = await pagePlateforme.locator('main').innerText();
check('les pièces sont listées', ouvert.includes('Pièces du dossier'), ouvert.slice(0, 800));
check('chacune porte son libellé', ouvert.includes('Attestation d’assurance') || ouvert.includes("Attestation d'assurance"), ouvert.slice(0, 800));
check('et son état', /à examiner/.test(ouvert), ouvert.slice(0, 800));
check('ce qui reste à valider est rappelé', /Reste à valider/.test(ouvert), ouvert.slice(0, 900));

titre('Valider est impossible tant que le dossier est incomplet');
const boutonValider = pagePlateforme.locator('button:has-text("Valider le livreur")').first();
check('le bouton est désactivé', await boutonValider.isDisabled(), 'bouton actif');

titre('Elle refuse une pièce, avec un motif');
await pagePlateforme.fill('input[id^="motif-"]', 'Permis illisible');
await pagePlateforme.click('button[aria-label^="Refuser Permis"]');
await pagePlateforme.waitForTimeout(2000);

const apresRefus = await pagePlateforme.locator('main').innerText();
check('la pièce est marquée refusée', /refusée/.test(apresRefus), apresRefus.slice(0, 900));
check('le motif est affiché', apresRefus.includes('Permis illisible'), apresRefus.slice(0, 900));

const vuLivreur = await appeler('/api/drivers/documents', { jeton: jetonLivreur });
const permis = (vuLivreur.donnees?.data?.documents || []).find((piece) => piece.type === 'license');
check('le livreur voit le refus', permis?.status === 'REJECTED', permis?.status);
check('et son motif', permis?.reviewNote === 'Permis illisible', permis?.reviewNote);

titre('Le livreur redépose, et la pièce repart en examen');
await appeler('/api/drivers/documents', {
  method: 'POST',
  jeton: jetonLivreur,
  corps: { type: 'license', documentUrl: 'https://exemple.fr/permis-net.pdf' },
});

const redepose = await appeler('/api/drivers/documents', { jeton: jetonLivreur });
const permisBis = (redepose.donnees?.data?.documents || []).filter((piece) => piece.type === 'license');
check('une seule pièce par type au dossier', permisBis.length === 1, `${permisBis.length}`);
check('elle est de nouveau à examiner', permisBis[0]?.status === 'PENDING', permisBis[0]?.status);

titre('Elle valide les quatre pièces');
await pagePlateforme.reload();
await pagePlateforme.waitForTimeout(2500);
await pagePlateforme.click(`button:has-text("Karim ${uniq}")`);
await pagePlateforme.waitForTimeout(2000);

// Les libellés viennent du serveur : les relire évite de valider trois pièces
// sur quatre parce qu'une apostrophe n'est pas la même.
const aValider = await pagePlateforme
  .locator('button[aria-label^="Valider "]')
  .evaluateAll((boutons) => boutons.map((b) => b.getAttribute('aria-label')));

check('chaque pièce a son bouton de validation', aValider.length === 4, `${aValider.length}`);

for (const etiquette of aValider) {
  const bouton = pagePlateforme.locator(`button[aria-label="${etiquette}"]`).first();

  if (await bouton.count()) {
    await bouton.click();
    await pagePlateforme.waitForTimeout(1500);
  }
}

const complet = await pagePlateforme.locator('main').innerText();
check('plus rien ne reste à valider', !/Reste à valider/.test(complet), complet.slice(0, 900));

titre('Puis le livreur');
const validerMaintenant = pagePlateforme.locator('button:has-text("Valider le livreur")').first();
check('le bouton est désormais actif', await validerMaintenant.isEnabled(), 'bouton inactif');

await validerMaintenant.click();
await pagePlateforme.waitForTimeout(2500);

const profilValide = await appeler('/api/drivers/me', { jeton: jetonLivreur });
check('le livreur est actif', profilValide.donnees?.data?.status === 'ACTIVE', profilValide.donnees?.data?.status);

titre('Son espace le lui dit');
await page.reload();
await page.waitForTimeout(2500);

const espaceValide = await page.locator('body').innerText();
check('le dossier est annoncé validé', /Compte validé/.test(espaceValide), espaceValide.slice(0, 400));
// Validé, le dossier n'a plus à encombrer l'écran à chaque visite.
check('le formulaire de dépôt disparaît', !/Déposer la pièce/.test(espaceValide), espaceValide.slice(0, 600));

titre('Maintenant il se met en ligne');
await page.locator('button', { hasText: 'Hors ligne' }).first().click();
await page.waitForTimeout(2500);

const profilEnLigne = await appeler('/api/drivers/me', { jeton: jetonLivreur });
check('le passage en ligne est accepté', profilEnLigne.donnees?.data?.isOnline === true, `${profilEnLigne.donnees?.data?.isOnline}`);

titre('La plateforme peut le suspendre');
await pagePlateforme.reload();
await pagePlateforme.waitForTimeout(2500);
await pagePlateforme.click('button:has-text("Actifs")');
await pagePlateforme.waitForTimeout(2000);

const actifs = await pagePlateforme.locator('main').innerText();
check('il figure parmi les actifs', actifs.includes(`Karim ${uniq}`), actifs.slice(0, 600));

await pagePlateforme.click(`button:has-text("Karim ${uniq}")`);
await pagePlateforme.waitForTimeout(2000);
await pagePlateforme.fill('input[id^="motif-"]', 'Assurance expirée');
await pagePlateforme.click('button:has-text("Suspendre")');
await pagePlateforme.waitForTimeout(2500);

const profilSuspendu = await appeler('/api/drivers/me', { jeton: jetonLivreur });
check('il est suspendu', profilSuspendu.donnees?.data?.status === 'SUSPENDED', profilSuspendu.donnees?.data?.status);
// Un suspendu qui reste « en ligne » dans les listes est trompeur.
check('et repassé hors ligne', profilSuspendu.donnees?.data?.isOnline === false, `${profilSuspendu.donnees?.data?.isOnline}`);
check('le motif lui est donné', profilSuspendu.donnees?.data?.statusReason === 'Assurance expirée', profilSuspendu.donnees?.data?.statusReason);

titre('Et le rétablir');
// Le dossier suspendu reste ouvert à l'écran : recliquer sur la ligne le
// replierait au lieu de l'ouvrir.
await pagePlateforme.reload();
await pagePlateforme.waitForTimeout(2500);
await pagePlateforme.click('button:has-text("Suspendus")');
await pagePlateforme.waitForTimeout(2000);
await pagePlateforme.click(`button:has-text("Karim ${uniq}")`);
await pagePlateforme.waitForTimeout(2000);
await pagePlateforme.click('button:has-text("Rétablir")');
await pagePlateforme.waitForTimeout(2500);

const profilRetabli = await appeler('/api/drivers/me', { jeton: jetonLivreur });
check('il est de nouveau actif', profilRetabli.donnees?.data?.status === 'ACTIVE', profilRetabli.donnees?.data?.status);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript côté livreur', erreurs.length === 0, erreurs.join(' | '));
check('aucune erreur JavaScript côté plateforme', erreursPlateforme.length === 0, erreursPlateforme.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
