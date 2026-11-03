/**
 * ZupDrive — une course de bout en bout, dans trois sessions Chromium isolées.
 *
 * L'équipe fixe le tarif de la Wallonie dans le manager ; le chauffeur passe
 * en ligne (géolocalisation simulée) ; le passager commande un trajet à prix
 * fixe sur /trajet ; la course est
 * proposée au chauffeur, qui l'accepte et la mène à terme ; le passager la
 * suit à chaque étape ; l'équipe la retrouve dans la liste des courses.
 *
 * Le site, l'API et l'autocomplétion d'adresse sont réels. Seules les tuiles
 * cartographiques et la position GPS sont simulées.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *   DATABASE_URL=postgresql://…/zupdrive_e2e?schema=public \
 *   ZUPDRIVE_E2E_ALLOW_DISPOSABLE_DB=1 node scripts/verif-zupdrive-courses.mjs
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { baseDeDonnees } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';
const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (
  process.env.ZUPDRIVE_E2E_ALLOW_DISPOSABLE_DB !== '1' ||
  !databaseUrl ||
  !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
  databaseUrl.pathname.replace(/^\//, '') !== 'zupdrive_e2e'
) {
  throw new Error('Cette recette modifie les comptes et les courses : utilisez uniquement la base locale jetable zupdrive_e2e et définissez ZUPDRIVE_E2E_ALLOW_DISPOSABLE_DB=1.');
}
const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';

// Namur → Jambes (Wallonie), sélectionnés par le vrai géocodeur serveur.
const REQUETE_DEPART = "Place d'Armes, Namur";
const REQUETE_ARRIVEE = 'Avenue Jean Materne, Jambes';
async function adresseSignee(requete, codePostal) {
  const url = new URL(`${API}/api/addresses/search`);
  url.searchParams.set('q', requete);
  url.searchParams.set('country', 'be');
  url.searchParams.set('usage', 'zupdrive');
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Recherche d'adresse impossible (${reponse.status})`);
  const resultat = await reponse.json();
  const suggestion = resultat.suggestions?.find((s) => s.postalCode === codePostal && s.preuveAdresse);
  if (!suggestion) throw new Error(`Aucune adresse belge signée trouvée pour ${requete} (${codePostal})`);
  return { ...suggestion, country: suggestion.country || 'Belgique' };
}
const DEPART = await adresseSignee(REQUETE_DEPART, '5000');
const ARRIVEE = await adresseSignee(REQUETE_ARRIVEE, '5100');
// Le chauffeur attend à un kilomètre au nord du départ.
const POSITION_CHAUFFEUR = { latitude: DEPART.latitude + 0.009, longitude: DEPART.longitude };

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

const inscrire = async (prefixe) => {
  const email = `${prefixe}-${uniq}@t.fr`;
  const r = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: MDP, confirmPassword: MDP, name: `${prefixe} ${uniq}`, conditionsAcceptees: true }),
  }).then((x) => x.json());
  if (!r.accessToken) {
    console.error(`Inscription impossible (${prefixe}) : ${JSON.stringify(r)}`);
    process.exit(1);
  }
  return { email, id: r.user.id };
};

const db = baseDeDonnees();

// ===== Le décor =====
const admin = await inscrire('admin-drive');
await db.user.update({ where: { id: admin.id }, data: { isSystemAdmin: true } });
await db.accesEquipe.create({ data: { userId: admin.id, plateforme: 'DRIVE', role: 'ADMIN' } });

// Le rôle ADMIN ZupDrive peut dater d'avant la section « Courses et tarifs » :
// on la coche, comme le ferait le superowner depuis la gestion des rôles.
await fetch(`${API}/health`).catch(() => undefined);
const roleDrive = await db.platformRole.findUnique({ where: { plateforme_code: { plateforme: 'DRIVE', code: 'ADMIN' } } });
if (roleDrive && roleDrive.permissions?.['courses-drive'] !== 'write') {
  await db.platformRole.update({
    where: { plateforme_code: { plateforme: 'DRIVE', code: 'ADMIN' } },
    data: { permissions: { ...roleDrive.permissions, 'courses-drive': 'write' } },
  });
}

const compteChauffeur = await inscrire('chauffeur');
const chauffeur = await db.chauffeurDrive.create({
  data: {
    userId: compteChauffeur.id,
    nomComplet: `Karim ${uniq}`,
    region: 'WALLONIE',
    statut: 'VALIDE',
    vehiculeMarque: 'Toyota',
    vehiculeModele: 'Corolla',
    vehiculePlaque: 'TLAA123',
    placesPassagers: 4,
  },
});
// Personne d'autre ne doit recevoir la course de ce scénario.
await db.chauffeurDrive.updateMany({ where: { region: 'WALLONIE', id: { not: chauffeur.id } }, data: { enLigne: false } });
await db.courseDrive.updateMany({ where: { statut: 'RECHERCHE' }, data: { statut: 'ANNULEE' } });

const passager = await inscrire('passager');
// Le navigateur ne garde plus de jeton lisible : on en demande un à l'API.
const jetonDe = async (email) =>
  (await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: MDP }),
  }).then((x) => x.json())).accessToken;

const navigateurDemande = process.env.ZUPDRIVE_E2E_CHROME_EXECUTABLE?.trim();
const navigateursSysteme = process.platform === 'win32'
  ? [
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter((chemin) => chemin && existsSync(chemin))
  : [];
const navigateurPlaywright = chromium.executablePath();
const executableNavigateur = navigateurDemande ||
  (!existsSync(navigateurPlaywright) ? navigateursSysteme[0] : undefined);
if (executableNavigateur && !existsSync(executableNavigateur)) {
  throw new Error(`Navigateur introuvable : ${executableNavigateur}`);
}
if (!executableNavigateur && !existsSync(navigateurPlaywright)) {
  throw new Error('Chromium est absent : lancez « npx playwright install chromium » ou définissez ZUPDRIVE_E2E_CHROME_EXECUTABLE.');
}
const nav = await chromium.launch(executableNavigateur ? { executablePath: executableNavigateur } : undefined);
const erreurs = [];
async function ouvrir(nom, options = {}) {
  const contexte = await nav.newContext(options);
  const page = await contexte.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(`${nom} ${new URL(page.url()).pathname} : ${m.text()}`);
  });
  return page;
}
async function connecter(page, email) {
  await page.goto(`${SITE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 });
}

// L'API garde les rôles quelques secondes en cache : on attend qu'elle voie la section.
const jetonAdmin = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: admin.email, password: MDP }),
}).then((x) => x.json()).then((r) => r.accessToken);
for (let i = 0; i < 40; i++) {
  const r = await fetch(`${API}/api/zupdrive/admin/tarifs`, { headers: { Authorization: `Bearer ${jetonAdmin}` } });
  if (r.ok) break;
  await new Promise((fin) => setTimeout(fin, 1000));
}

// ===== L'équipe fixe le tarif =====
titre('L’équipe ZupDrive fixe le tarif de la Wallonie');
const pageAdmin = await ouvrir('admin');
await connecter(pageAdmin, admin.email);
await pageAdmin.goto(`${SITE}/superowner/zupdrive/tarifs`);
await pageAdmin.waitForSelector('[data-region="WALLONIE"][data-categorie="STANDARD"]', { timeout: 15000 });
const wallonie = pageAdmin.locator('[data-region="WALLONIE"][data-categorie="STANDARD"]');
check('le menu propose Courses et Tarifs sous ZupDrive', /Tarifs/.test(await pageAdmin.locator('aside').innerText()));

await wallonie.locator('input[name="WALLONIE:STANDARD-priseEnChargeCentimes"]').fill('abc');
await wallonie.locator('button').click();
check('un montant invalide est refusé', /montant invalide/i.test(await pageAdmin.locator('main').innerText()));

await wallonie.locator('input[name="WALLONIE:STANDARD-priseEnChargeCentimes"]').fill('2,50');
await wallonie.locator('input[name="WALLONIE:STANDARD-parKmCentimes"]').fill('1,8');
await wallonie.locator('input[name="WALLONIE:STANDARD-parMinuteCentimes"]').fill('0,30');
await wallonie.locator('input[name="WALLONIE:STANDARD-minimumCentimes"]').fill('8,20');
await wallonie.locator('input[name="WALLONIE:STANDARD-actif"]').check();
await wallonie.locator('button').click();
await pageAdmin.waitForSelector('[role="status"]', { timeout: 10000 });
check('la page confirme l’enregistrement du tarif Standard', /STANDARD/.test(await pageAdmin.locator('[role="status"]').innerText()));
const tarif = await db.tarifDrive.findUnique({ where: { region: 'WALLONIE' } });
check(
  'enregistré en centimes exacts',
  tarif?.priseEnChargeCentimes === 250 && tarif.parKmCentimes === 180 && tarif.parMinuteCentimes === 30 && tarif.minimumCentimes === 820 && tarif.actif,
  JSON.stringify(tarif)
);
const journal = await db.systemAuditLog.findFirst({ where: { adminId: admin.id, action: 'ZUPDRIVE_SET_TARIF' } });
check('et journalisé', Boolean(journal));

// ===== Le chauffeur passe en ligne =====
titre('Le chauffeur passe en ligne');
const pageChauffeur = await ouvrir('chauffeur', {
  geolocation: POSITION_CHAUFFEUR,
  permissions: ['geolocation'],
});
await connecter(pageChauffeur, compteChauffeur.email);
await pageChauffeur.goto(`${SITE}/chauffeur/courses`);
await pageChauffeur.click('button:has-text("Passer en ligne")', { timeout: 15000 });
await pageChauffeur.waitForSelector('text=Vous recevez les courses proches de vous.', { timeout: 10000 });
let positionEnvoyee = false;
for (let i = 0; i < 20 && !positionEnvoyee; i++) {
  const lu = await db.chauffeurDrive.findUnique({ where: { id: chauffeur.id } });
  positionEnvoyee = lu.enLigne && lu.positionLe && Math.abs(lu.latitude - POSITION_CHAUFFEUR.latitude) < 1e-6;
  if (!positionEnvoyee) await pageChauffeur.waitForTimeout(500);
}
check('en ligne, avec la position du téléphone', positionEnvoyee);

// ===== Le passager commande =====
titre('Le passager commande un trajet à prix fixe');
const pagePassager = await ouvrir('passager');
// Les fonds de carte (OpenStreetMap, service externe) : une image vide.
const TUILE_VIDE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
await pagePassager.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: TUILE_VIDE }));
await connecter(pagePassager, passager.email);
await pagePassager.goto(`${SITE}/trajet`);
await pagePassager.fill('#depart', REQUETE_DEPART);
await pagePassager.click(`li button:has-text("${DEPART.street}")`, { timeout: 10000 });
await pagePassager.fill('#arrivee', REQUETE_ARRIVEE);
await pagePassager.click(`li button:has-text("${ARRIVEE.street}")`, { timeout: 10000 });
await pagePassager.waitForSelector('[data-devis]', { timeout: 10000 });
const devisAffiche = await pagePassager.locator('[data-devis]').innerText();
await pagePassager.waitForSelector('[data-carte-course] .leaflet-marker-icon', { timeout: 10000 });
check('la carte montre le départ et la destination', (await pagePassager.locator('[data-carte-course] .leaflet-marker-icon').count()) === 2);

const devisApi = await fetch(`${API}/api/zupdrive/courses/devis`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await jetonDe(passager.email)}`,
  },
  body: JSON.stringify({
    depart: { preuveAdresse: DEPART.preuveAdresse },
    arrivee: { preuveAdresse: ARRIVEE.preuveAdresse },
  }),
}).then((x) => x.json());
const prixAttendu = (devisApi.data.prixCentimes / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
check('le prix affiché est celui du serveur', devisAffiche.includes(prixAttendu), `${devisAffiche} / ${prixAttendu}`);

await pagePassager.click('button:has-text("Commander pour")');
await pagePassager.waitForURL('**/trajet/**', { timeout: 15000 });
const courseId = new URL(pagePassager.url()).pathname.split('/').pop();
await pagePassager.waitForSelector('[data-statut="RECHERCHE"]', { timeout: 10000 });
check('la course attend un chauffeur', true);
const course = await db.courseDrive.findUnique({ where: { id: courseId } });
check('au prix annoncé, figé', course?.prixCentimes === devisApi.data.prixCentimes, `${course?.prixCentimes}`);

// ===== Le chauffeur accepte et mène la course =====
titre('Le chauffeur reçoit la course et la mène à terme');
await pageChauffeur.waitForSelector('[data-proposition]', { timeout: 15000 });
check('la proposition arrive avec son compte à rebours', /\d+ s/.test(await pageChauffeur.locator('[data-proposition]').innerText()));
await pageChauffeur.click('[data-proposition] button:has-text("Accepter")');
await pageChauffeur.waitForSelector('[data-course][data-statut="ACCEPTEE"]', { timeout: 10000 });
check('la course lui est attribuée', true);

await pagePassager.waitForSelector('[data-statut="ACCEPTEE"]', { timeout: 15000 });
const vuePassager = await pagePassager.locator('main').innerText();
check('le passager voit son chauffeur arriver, avec la plaque', /Votre chauffeur arrive/.test(vuePassager) && vuePassager.includes('TLAA123'), vuePassager.slice(0, 300));
await pagePassager.waitForSelector('[data-carte-course] [title="Votre chauffeur"]', { timeout: 10000 });
check('et le voit sur la carte pendant son approche', true);

for (const [bouton, statut] of [
  ['Je suis arrivé', 'ARRIVEE'],
  ['Le passager est à bord', 'EN_COURS'],
]) {
  await pageChauffeur.click(`[data-course] button:has-text("${bouton}")`);
  await pageChauffeur.waitForSelector(`[data-course][data-statut="${statut}"]`, { timeout: 10000 });
  await pagePassager.waitForSelector(`[data-statut="${statut}"]`, { timeout: 15000 });
  check(`« ${bouton} » : le passager suit (${statut})`, true);
}
check('à bord, le passager ne peut plus annuler', (await pagePassager.locator('button:has-text("Annuler le trajet")').count()) === 0);

await pageChauffeur.click('[data-course] button:has-text("Terminer la course")');
await pagePassager.waitForSelector('[data-statut="TERMINEE"]', { timeout: 15000 });
check('le passager voit le trajet terminé', /Trajet terminé/.test(await pagePassager.locator('main').innerText()));
await pageChauffeur.waitForSelector('text=Historique', { timeout: 10000 });
check('la course rejoint l’historique du chauffeur', (await pageChauffeur.locator('main').innerText()).includes(DEPART.label));

// ===== Les notes =====
titre('Chacun note l’autre');
await pagePassager.waitForSelector('[data-noter]', { timeout: 10000 });
await pagePassager.click('[data-noter] [role="radio"][aria-label^="5 "]');
await pagePassager.fill('[data-noter] textarea', 'Chauffeur ponctuel et aimable');
check('le passager est prévenu que son commentaire ne va qu’à l’équipe', /n'est lu que par l'équipe ZupDrive/.test(await pagePassager.locator('[data-noter]').innerText()));
await pagePassager.click('[data-noter] button:has-text("Envoyer ma note")');
await pagePassager.waitForSelector('[data-ma-note="5"]', { timeout: 10000 });
check('le passager a noté son chauffeur 5/5', true);

await pageChauffeur.reload();
const noterPassager = pageChauffeur.locator(`[data-noter-course="${courseId}"]`);
await noterPassager.waitFor({ timeout: 15000 });
await noterPassager.locator('[role="radio"][aria-label^="2 "]').click();
await noterPassager.locator('textarea').fill('Quinze minutes de retard');
await noterPassager.locator('button:has-text("Envoyer ma note")').click();
await pageChauffeur.waitForSelector('text=Passager noté.', { timeout: 10000 });
check('le chauffeur a noté son passager', true);
const vueChauffeur = await pageChauffeur.locator('main').innerText();
check('le chauffeur voit sa moyenne, pas le commentaire du passager', /5 sur 5 \(1 avis\)/.test(vueChauffeur) && !vueChauffeur.includes('ponctuel'), vueChauffeur.slice(0, 200));
await pagePassager.reload();
await pagePassager.waitForSelector('[data-ma-note="5"]', { timeout: 10000 });
check('le passager ne voit pas le commentaire du chauffeur', !(await pagePassager.locator('main').innerText()).includes('retard'));

// ===== L'équipe la retrouve =====
titre('L’équipe retrouve la course');
await pageAdmin.goto(`${SITE}/superowner/zupdrive/courses`);
await pageAdmin.waitForSelector('table', { timeout: 15000 });
const liste = await pageAdmin.locator('table').innerText();
check('dans la liste, terminée, avec son chauffeur et son passager', liste.includes(passager.email) && liste.includes(`Karim ${uniq}`) && /Terminée/.test(liste));
check(
  'l’équipe voit les deux notes et leurs commentaires',
  /Chauffeur noté 5\/5/.test(liste) && /Passager noté 2\/5/.test(liste) && liste.includes('Quinze minutes de retard') && liste.includes('ponctuel'),
  liste.slice(0, 400)
);

check('aucune erreur dans la console', erreurs.length === 0, erreurs.join(' | '));

await db.chauffeurDrive.update({ where: { id: chauffeur.id }, data: { enLigne: false } });
await nav.close();
await db.$disconnect();

console.log(`\n${ok} OK, ${echecs.length} échec(s)`);
process.exit(echecs.length ? 1 : 0);
