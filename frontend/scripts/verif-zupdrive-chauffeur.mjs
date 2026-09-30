/**
 * ZupDrive — le dossier chauffeur (licence LVC), des deux côtés.
 *
 * Côté chauffeur : « Devenir chauffeur » mène au dossier, qui se remplit en
 * ligne (profil, numéro BCE contrôlé, pièces), se soumet quand il est
 * complet, puis se fige. Côté équipe ZupDrive : l'administration n'ouvre
 * qu'aux rôles de la plateforme DRIVE, valide pièce par pièce puis le
 * dossier, et journalise.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *   DATABASE_URL=postgresql://… node scripts/verif-zupdrive-chauffeur.mjs
 */

import { chromium } from 'playwright';
import { baseDeDonnees } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';
// Début d'un JPEG : assez pour que l'API reconnaisse le type réel du fichier.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
// 0123.456.749 : 1234567 mod 97 = 48, 97 − 48 = 49.
const BCE = '0123.456.749';

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
      ...(options.corps ? { 'Content-Type': 'application/json' } : {}),
      ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
    },
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
    ...(options.formulaire ? { body: options.formulaire } : {}),
  });

  return { statut: reponse.status, donnees: await reponse.json().catch(() => null) };
};

const inscrire = async (prefixe) => {
  const email = `${prefixe}-${uniq}@t.fr`;
  const reponse = await appeler('/api/auth/signup', {
    method: 'POST',
    corps: { email, password: MDP, confirmPassword: MDP, name: `${prefixe} ${uniq}`, conditionsAcceptees: true },
  });
  if (!reponse.donnees?.accessToken) {
    console.error(`Inscription impossible (${prefixe}) : ${JSON.stringify(reponse.donnees)}`);
    process.exit(1);
  }
  return { email, jeton: reponse.donnees.accessToken, id: reponse.donnees.user.id };
};

/** Un membre de l'équipe, avec son rôle sur une plateforme (posé en base). */
const membreEquipe = async (prefixe, plateforme) => {
  const compte = await inscrire(prefixe);
  const db = baseDeDonnees();
  await db.user.update({ where: { id: compte.id }, data: { isSystemAdmin: true } });
  await db.accesEquipe.create({ data: { userId: compte.id, plateforme, role: 'ADMIN' } });
  return compte;
};

const deposer = (jeton, type) => {
  const formulaire = new FormData();
  formulaire.append('type', type);
  formulaire.append('file', new Blob([JPEG], { type: 'image/jpeg' }), `${type}.jpg`);
  return appeler('/api/zupdrive/chauffeur/me/documents', { method: 'POST', jeton, formulaire });
};

// ===== Le décor =====

const chauffeur = await inscrire('chauffeur');
const curieux = await inscrire('curieux');
const adminDrive = await membreEquipe('admin-drive', 'DRIVE');
const adminEat = await membreEquipe('admin-eat', 'EAT');

const nav = await chromium.launch();
const page = await (await nav.newContext()).newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

// ===== Devenir chauffeur =====

titre('« Devenir chauffeur » mène au dossier en ligne (Belgique)');
await page.goto(`${SITE}/devenir-chauffeur?pays=BE`);
const cta = page.getByRole('link', { name: 'Créer mon dossier chauffeur' }).first();
check('le bouton est là', (await cta.count()) > 0);
await cta.click();
await page.waitForURL('**/chauffeur**', { timeout: 15000 });
await page.waitForTimeout(1500);
check(
  'sans session, la page invite à se connecter',
  /Connectez-vous avec votre compte ZupOne/.test(await page.locator('body').innerText())
);

titre('Le chauffeur se connecte et ouvre son dossier');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', chauffeur.email);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 });
await page.goto(`${SITE}/chauffeur`);
await page.waitForSelector('input[name="telephone"]', { timeout: 15000 });

await page.fill('input[name="telephone"]', '+32 470 12 34 56');
await page.selectOption('select[name="region"]', 'WALLONIE');
await page.fill('input[name="numeroEntreprise"]', '0123.456.748');
await page.click('button:has-text("Ouvrir mon dossier")');
await page.waitForTimeout(1500);
check(
  'un numéro BCE faux est refusé, avec un message',
  /Numéro d'entreprise \(BCE\) invalide/.test(await page.locator('body').innerText())
);
// Le 400 de ce refus est voulu : ce n'est pas une erreur de la page.
erreurs.length = 0;

await page.fill('input[name="numeroEntreprise"]', BCE);
await page.fill('input[name="numeroLicence"]', 'LVC-2026-001');
await page.fill('input[name="vehiculeMarque"]', 'Toyota');
await page.fill('input[name="vehiculeModele"]', 'Corolla');
await page.fill('input[name="vehiculePlaque"]', 't-laa-123');
await page.click('button:has-text("Ouvrir mon dossier")');
await page.waitForSelector('text=Profil enregistré.', { timeout: 10000 });

const apresProfil = await page.locator('body').innerText();
check('le numéro de TVA est déduit du BCE', apresProfil.includes('BE0123456749'), apresProfil.slice(0, 600));
check('la plaque est normalisée', (await page.inputValue('input[name="vehiculePlaque"]')) === 'TLAA123');
check('le nom vient du compte ZupOne', (await page.inputValue('input[name="nomComplet"]')) === `chauffeur ${uniq}`);
check('les pièces de Wallonie sont demandées, pas le bestuurderspas', !apresProfil.includes('Bestuurderspas') && apresProfil.includes('Contrôle technique'));
check('l’envoi est bloqué tant qu’il manque des pièces', await page.locator('button:has-text("Envoyer mon dossier")').isDisabled());

titre('Il dépose une pièce depuis la page');
const ligneIdentite = page.locator('li', { hasText: "Carte d'identité" });
await ligneIdentite.locator('input[type="file"]').setInputFiles({ name: 'identite.jpg', mimeType: 'image/jpeg', buffer: JPEG });
await page.waitForSelector('text=Document déposé, en attente de vérification.', { timeout: 10000 });
check('la pièce passe en vérification', /En vérification/.test(await ligneIdentite.innerText()));

// Le reste par l'API : redéposer chaque pièce à l'écran ne vérifierait rien de plus.
for (const type of ['permis', 'tva', 'licence', 'controle_technique', 'assurance', 'immatriculation']) {
  const depot = await deposer(chauffeur.jeton, type);
  if (depot.statut !== 201) check(`dépôt ${type}`, false, JSON.stringify(depot.donnees));
}

titre('Il envoie son dossier, qui se fige');
await page.reload();
await page.waitForSelector('button:has-text("Envoyer mon dossier")', { timeout: 15000 });
await page.click('button:has-text("Envoyer mon dossier")');
await page.waitForSelector('text=Dossier en vérification', { timeout: 10000 });
check('le formulaire n’est plus modifiable', await page.locator('input[name="telephone"]').isDisabled());
const modification = await appeler('/api/zupdrive/chauffeur/me', {
  method: 'PATCH',
  jeton: chauffeur.jeton,
  corps: { telephone: '+32 470 00 00 00' },
});
check('même en appelant l’API directement', modification.statut === 409, `${modification.statut}`);

// ===== Équipe ZupDrive =====

titre('L’administration ZupDrive');
const parEat = await appeler('/api/zupdrive/admin/chauffeurs', { jeton: adminEat.jeton });
check('un admin ZupEat seul n’y a pas accès', parEat.statut === 403, `${parEat.statut}`);
const parChauffeur = await appeler('/api/zupdrive/admin/chauffeurs', { jeton: chauffeur.jeton });
check('le chauffeur non plus', parChauffeur.statut === 403, `${parChauffeur.statut}`);

const liste = await appeler('/api/zupdrive/admin/chauffeurs?statut=SOUMIS', { jeton: adminDrive.jeton });
const ligne = (liste.donnees?.data || []).find((c) => c.email === chauffeur.email);
check('un admin ZupDrive voit le dossier soumis', Boolean(ligne), JSON.stringify(liste.donnees)?.slice(0, 300));
const id = ligne?.id;

const tropTot = await appeler(`/api/zupdrive/admin/chauffeurs/${id}/approve`, { method: 'POST', jeton: adminDrive.jeton });
check('pas de validation avant l’examen des pièces', tropTot.statut === 400, `${tropTot.statut}`);

titre('Un admin ZupDrive traite le dossier dans l’espace manager');
const pageAdmin = await (await nav.newContext()).newPage();
pageAdmin.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`admin ${new URL(pageAdmin.url()).pathname} : ${m.text()}`);
});
await pageAdmin.goto(`${SITE}/login`);
await pageAdmin.fill('input[type="email"]', adminDrive.email);
await pageAdmin.fill('input[type="password"]', MDP);
await pageAdmin.click('button[type="submit"]');
await pageAdmin.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 });

// Le lien des notifications ouvre le dossier directement.
await pageAdmin.goto(`${SITE}/superowner/zupdrive/chauffeurs/${id}`);
await pageAdmin.waitForSelector(`[data-dossier="${id}"]`, { timeout: 15000 });
const menu = await pageAdmin.locator('aside').innerText();
check('le menu propose « Chauffeurs » sous ZupDrive', /ZupDrive/i.test(menu) && /Chauffeurs/.test(menu), menu.slice(0, 300));
check('et pas « Livreurs » : son rôle n’est que ZupDrive', !/Livreurs/.test(menu), menu.slice(0, 300));

await pageAdmin.goto(`${SITE}/superowner/zupdrive/chauffeurs`);
await pageAdmin.waitForSelector(`text=chauffeur ${uniq}`, { timeout: 15000 });
check('le dossier soumis est dans la file « À examiner »', true);
await pageAdmin.click(`button:has-text("chauffeur ${uniq}")`);
const fiche = pageAdmin.locator(`[data-dossier="${id}"]`);
await fiche.waitFor({ timeout: 10000 });
check('le numéro de TVA est affiché', (await fiche.innerText()).includes('BE0123456749'));
check('la validation est bloquée tant que les pièces ne sont pas examinées', await fiche.locator('button:has-text("Valider le dossier")').isDisabled());

const pieceAssurance = fiche.locator('li', { hasText: 'Assurance' });
await pieceAssurance.locator('button:has-text("Refuser")').click();
await pageAdmin.waitForTimeout(500);
check('refuser une pièce sans motif est impossible', /Indiquez un motif/.test(await pageAdmin.locator('main').innerText()));
await pieceAssurance.locator('input').fill('Attestation illisible');
await pieceAssurance.locator('button:has-text("Refuser")').click();
await pageAdmin.waitForFunction(
  () => [...document.querySelectorAll('li')].some((li) => li.textContent.includes('Assurance') && li.textContent.includes('Refusée')),
  null,
  { timeout: 10000 }
);
check('la pièce refusée affiche son motif', (await pieceAssurance.innerText()).includes('Attestation illisible'));

// « Voir » ouvre la pièce dans la page, sans nouvel onglet. L'adresse signée
// est redemandée à l'ouverture : celle du dossier ne vaut que cinq minutes.
const ongletsAvant = pageAdmin.context().pages().length;
const [signee, fichier] = await Promise.all([
  pageAdmin.waitForResponse((r) => r.url().includes('/api/files/signed-url'), { timeout: 10000 }),
  pageAdmin.waitForResponse((r) => /\/api\/files\/chauffeurs\/[^/?]+\?exp=/.test(r.url()), { timeout: 10000 }),
  fiche.locator('li', { hasText: "Carte d'identité" }).locator('button:has-text("Voir")').click(),
]);
const apercu = pageAdmin.getByRole('dialog');
await apercu.waitFor({ timeout: 10000 });
check('« Voir » affiche la pièce dans la page', (await apercu.innerText()).includes("Carte d'identité"));
check('sans ouvrir d’autre onglet', pageAdmin.context().pages().length === ongletsAvant);
check('avec une adresse signée fraîche', signee.status() === 200 && fichier.status() === 200, `${signee.status()} / ${fichier.status()}`);
await apercu.getByRole('button', { name: 'Close preview' }).click();
await apercu.waitFor({ state: 'detached', timeout: 5000 });

// Chaque pièce validée une à une, la refusée comprise (le chauffeur l'a « corrigée »).
for (let tour = 0; tour < 12; tour++) {
  const bouton = fiche.getByRole('button', { name: 'Valider', exact: true });
  if ((await bouton.count()) === 0) break;
  await bouton.first().click();
  await pageAdmin.waitForTimeout(700);
}
check('toutes les pièces sont validées', (await fiche.getByRole('button', { name: 'Valider', exact: true }).count()) === 0);
await fiche.locator('button:has-text("Valider le dossier")').click();
await pageAdmin.waitForTimeout(1500);
const apres = await appeler(`/api/zupdrive/admin/chauffeurs/${id}`, { jeton: adminDrive.jeton });
check('le dossier complet est validé', apres.donnees?.data?.statut === 'VALIDE', apres.donnees?.data?.statut);
check('l’écran propose ensuite la suspension', await fiche.locator('button:has-text("Suspendre le chauffeur")').isVisible());

titre('Un admin ZupEat seul ne voit pas les chauffeurs');
const pageEat = await (await nav.newContext()).newPage();
await pageEat.goto(`${SITE}/login`);
await pageEat.fill('input[type="email"]', adminEat.email);
await pageEat.fill('input[type="password"]', MDP);
await pageEat.click('button[type="submit"]');
await pageEat.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 });
await pageEat.goto(`${SITE}/superowner/zupdrive/chauffeurs`);
await pageEat.waitForSelector('aside', { timeout: 15000 });
await pageEat.waitForTimeout(1500);
const menuEat = await pageEat.locator('aside').innerText();
check('son menu a « Livreurs » mais pas « Chauffeurs »', /Livreurs/.test(menuEat) && !/Chauffeurs/.test(menuEat), menuEat.slice(0, 300));
check('et la file des chauffeurs ne s’affiche pas', !(await pageEat.locator('main').innerText()).includes(`chauffeur ${uniq}`));

const rejoue = await appeler(`/api/zupdrive/admin/chauffeurs/${id}/approve`, { method: 'POST', jeton: adminDrive.jeton });
check('une seconde validation est refusée', rejoue.statut === 409, `${rejoue.statut}`);

const journal = await baseDeDonnees().systemAuditLog.findMany({ where: { target: id } });
check('la décision est journalisée', journal.some((l) => l.action === 'ZUPDRIVE_APPROVE_CHAUFFEUR' && l.adminId === adminDrive.id));

titre('Le chauffeur voit sa validation, et lui seul ses pièces');
await page.reload();
await page.waitForSelector('text=Dossier validé', { timeout: 15000 });
check('le bandeau annonce la validation', true);

const lien = await page.locator('li', { hasText: "Carte d'identité" }).locator('a:has-text("Voir")').getAttribute('href');
check('la pièce s’ouvre par une adresse signée', /[?&]sig=/.test(lien || ''), lien || '');
check('et se télécharge', (await fetch(lien)).status === 200);
const brute = (await baseDeDonnees().documentChauffeurDrive.findFirst({ where: { chauffeurId: id } })).url;
const autre = await appeler(`/api/files/signed-url?url=${encodeURIComponent(brute)}`, { jeton: curieux.jeton });
check('un autre compte ne peut pas la lire', autre.statut === 404, `${autre.statut}`);

check('aucune erreur dans la console', erreurs.length === 0, erreurs.join(' | '));

await nav.close();
await baseDeDonnees().$disconnect();

console.log(`\n${ok} OK, ${echecs.length} échec(s)`);
process.exit(echecs.length ? 1 : 0);
