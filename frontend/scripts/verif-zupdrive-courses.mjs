/**
 * ZupDrive — une course de bout en bout, dans trois navigateurs.
 *
 * L'équipe fixe le tarif de la Wallonie dans le manager ; le chauffeur passe
 * en ligne depuis son téléphone (géolocalisation simulée) ; le passager
 * commande un trajet à prix fixe sur zupdrive.com/trajet ; la course est
 * proposée au chauffeur, qui l'accepte et la mène à terme ; le passager la
 * suit à chaque étape ; l'équipe la retrouve dans la liste des courses.
 *
 * Seule la recherche d'adresses (service externe) est simulée : tout le
 * reste passe par le vrai site et la vraie API.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *   DATABASE_URL=postgresql://… node scripts/verif-zupdrive-courses.mjs
 */

import { chromium } from 'playwright';
import { baseDeDonnees } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';
const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';

// Namur → Jambes (Wallonie).
const DEPART = { label: "Place d'Armes, 5000 Namur", street: "Place d'Armes", city: 'Namur', postalCode: '5000', country: 'BE', latitude: 50.4632, longitude: 4.8665 };
const ARRIVEE = { label: 'Avenue Jean Materne, 5100 Jambes', street: 'Avenue Jean Materne', city: 'Jambes', postalCode: '5100', country: 'BE', latitude: 50.4555, longitude: 4.8759 };
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
await fetch(`${API}/api/health`).catch(() => undefined);
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
  },
});
// Personne d'autre ne doit recevoir la course de ce scénario.
await db.chauffeurDrive.updateMany({ where: { region: 'WALLONIE', id: { not: chauffeur.id } }, data: { enLigne: false } });
await db.courseDrive.updateMany({ where: { statut: 'RECHERCHE' }, data: { statut: 'ANNULEE' } });

const passager = await inscrire('passager');

const nav = await chromium.launch();
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
await pageAdmin.waitForSelector('[data-region="WALLONIE"]', { timeout: 15000 });
const wallonie = pageAdmin.locator('[data-region="WALLONIE"]');
check('le menu propose Courses et Tarifs sous ZupDrive', /Tarifs/.test(await pageAdmin.locator('aside').innerText()));

await wallonie.locator('input[name="WALLONIE-priseEnChargeCentimes"]').fill('abc');
await wallonie.locator('button').click();
check('un montant invalide est refusé', /montant invalide/.test(await pageAdmin.locator('main').innerText()));

await wallonie.locator('input[name="WALLONIE-priseEnChargeCentimes"]').fill('2,50');
await wallonie.locator('input[name="WALLONIE-parKmCentimes"]').fill('1,8');
await wallonie.locator('input[name="WALLONIE-parMinuteCentimes"]').fill('0,30');
await wallonie.locator('input[name="WALLONIE-minimumCentimes"]').fill('8');
await wallonie.locator('input[name="WALLONIE-actif"]').check();
await wallonie.locator('button').click();
await pageAdmin.waitForSelector('text=Tarif Wallonie enregistré.', { timeout: 10000 });
const tarif = await db.tarifDrive.findUnique({ where: { region: 'WALLONIE' } });
check(
  'enregistré en centimes exacts',
  tarif?.priseEnChargeCentimes === 250 && tarif.parKmCentimes === 180 && tarif.parMinuteCentimes === 30 && tarif.minimumCentimes === 800 && tarif.actif,
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
await pagePassager.route('**/api/addresses/search**', (route) => {
  const q = new URL(route.request().url()).searchParams.get('q') || '';
  const adresse = /jambes|materne/i.test(q) ? ARRIVEE : DEPART;
  route.fulfill({ json: { suggestions: [adresse], available: true, provider: 'test' } });
});
await connecter(pagePassager, passager.email);
await pagePassager.goto(`${SITE}/trajet`);
await pagePassager.fill('#depart', 'Place d’Armes Namur');
await pagePassager.click(`li button:has-text("${DEPART.street}")`, { timeout: 10000 });
await pagePassager.fill('#arrivee', 'Avenue Jean Materne Jambes');
await pagePassager.click(`li button:has-text("${ARRIVEE.street}")`, { timeout: 10000 });
await pagePassager.waitForSelector('[data-devis]', { timeout: 10000 });
const devisAffiche = await pagePassager.locator('[data-devis]').innerText();

const devisApi = await fetch(`${API}/api/zupdrive/courses/devis`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await pagePassager.evaluate(() => localStorage.getItem('accessToken'))}`,
  },
  body: JSON.stringify({
    depart: { adresse: DEPART.label, latitude: DEPART.latitude, longitude: DEPART.longitude, codePostal: DEPART.postalCode },
    arrivee: { adresse: ARRIVEE.label, latitude: ARRIVEE.latitude, longitude: ARRIVEE.longitude, codePostal: ARRIVEE.postalCode },
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

// ===== L'équipe la retrouve =====
titre('L’équipe retrouve la course');
await pageAdmin.goto(`${SITE}/superowner/zupdrive/courses`);
await pageAdmin.waitForSelector('table', { timeout: 15000 });
const liste = await pageAdmin.locator('table').innerText();
check('dans la liste, terminée, avec son chauffeur et son passager', liste.includes(passager.email) && liste.includes(`Karim ${uniq}`) && /Terminée/.test(liste));

check('aucune erreur dans la console', erreurs.length === 0, erreurs.join(' | '));

await db.chauffeurDrive.update({ where: { id: chauffeur.id }, data: { enLigne: false } });
await nav.close();
await db.$disconnect();

console.log(`\n${ok} OK, ${echecs.length} échec(s)`);
process.exit(echecs.length ? 1 : 0);
