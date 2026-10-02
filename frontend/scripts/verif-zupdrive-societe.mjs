/**
 * ZupDrive — les sociétés de taxi / VTC et leurs chauffeurs, de bout en bout.
 *
 * Le gérant ouvre le dossier de sa société, inscrit un véhicule et invite un
 * chauffeur (par l'API : son espace, manager.zupdrive.com, vient ensuite).
 * Le chauffeur accepte l'invitation depuis son espace, où son dossier se
 * réduit à ses pièces personnelles. L'équipe ZupDrive valide la société et
 * son véhicule dans l'administration. Le chauffeur roule avec le véhicule
 * attribué, puis quitte la société. Une autre société ne touche à rien de
 * tout cela.
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *   DATABASE_URL=postgresql://… node scripts/verif-zupdrive-societe.mjs
 */

import { chromium } from 'playwright';
import { baseDeDonnees } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';
// Début d'un JPEG : assez pour que l'API reconnaisse le type réel du fichier.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
/** Un numéro BCE valable (97 − base mod 97), propre à ce passage. */
const bce = (graine) => {
  const base = `0${String(graine % 10_000_000).padStart(7, '0')}`;
  return `${base}${String(97 - (Number(base) % 97)).padStart(2, '0')}`;
};
const PLAQUE = `T${uniq.slice(-6).toUpperCase()}`;
const DANS_UN_AN = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

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

const membreEquipe = async (prefixe, plateforme) => {
  const compte = await inscrire(prefixe);
  const db = baseDeDonnees();
  await db.user.update({ where: { id: compte.id }, data: { isSystemAdmin: true } });
  await db.accesEquipe.create({ data: { userId: compte.id, plateforme, role: 'ADMIN' } });
  return compte;
};

const deposer = (chemin, jeton, type, dateExpiration) => {
  const formulaire = new FormData();
  formulaire.append('type', type);
  formulaire.append('file', new Blob([JPEG], { type: 'image/jpeg' }), `${type}.jpg`);
  if (dateExpiration) formulaire.append('dateExpiration', dateExpiration);
  return appeler(chemin, { method: 'POST', jeton, formulaire });
};

const connecter = async (page, email) => {
  await page.goto(`${SITE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 });
};

// ===== Le décor =====

const gerant = await inscrire('gerant');
const autreGerant = await inscrire('autre-gerant');
const chauffeur = await inscrire('chauffeur-societe');
const adminDrive = await membreEquipe('admin-drive', 'DRIVE');

const nav = await chromium.launch();
const erreurs = [];
const nouvellePage = async (nom) => {
  const page = await (await nav.newContext()).newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(`${nom} ${new URL(page.url()).pathname} : ${m.text()}`);
  });
  page.on('dialog', (dialogue) => dialogue.accept());
  return page;
};

titre('Le gérant ouvre le dossier de sa société (API)');
const ouverte = await appeler('/api/zupdrive/societe/me', {
  method: 'POST',
  jeton: gerant.jeton,
  corps: { raisonSociale: `Taxi ${uniq}`, numeroEntreprise: bce(Date.now()), region: 'WALLONIE', telephone: '+32 81 00 00 00' },
});
check('le dossier est ouvert', ouverte.statut === 201 && ouverte.donnees?.data?.statut === 'BROUILLON', JSON.stringify(ouverte.donnees));
const doublon = await appeler('/api/zupdrive/societe/me', {
  method: 'POST',
  jeton: autreGerant.jeton,
  corps: { raisonSociale: 'Copie', numeroEntreprise: ouverte.donnees?.data?.numeroEntreprise },
});
check('une entreprise ne s’inscrit qu’une fois', doublon.statut === 409, `${doublon.statut}`);

const tva = await deposer('/api/zupdrive/societe/me/documents', gerant.jeton, 'tva');
check('la pièce de TVA est déposée', tva.statut === 201, JSON.stringify(tva.donnees));
const soumise = await appeler('/api/zupdrive/societe/me/submit', { method: 'POST', jeton: gerant.jeton });
check('le dossier est envoyé à l’équipe', soumise.donnees?.data?.statut === 'SOUMIS', JSON.stringify(soumise.donnees));

const vehicule = await appeler('/api/zupdrive/societe/me/vehicules', {
  method: 'POST',
  jeton: gerant.jeton,
  corps: { marque: 'Toyota', modele: 'Corolla', plaque: PLAQUE.toLowerCase(), numeroLicence: `LVC-${uniq}` },
});
check('le véhicule est inscrit, plaque normalisée', vehicule.donnees?.data?.plaque === PLAQUE, JSON.stringify(vehicule.donnees));
const vehiculeId = vehicule.donnees?.data?.id;
for (const type of ['licence', 'assurance', 'controle_technique', 'immatriculation']) {
  const depot = await deposer(`/api/zupdrive/societe/me/vehicules/${vehiculeId}/documents`, gerant.jeton, type, DANS_UN_AN);
  if (depot.statut !== 201) check(`pièce du véhicule ${type}`, false, JSON.stringify(depot.donnees));
}

const invitation = await appeler('/api/zupdrive/societe/me/invitations', {
  method: 'POST',
  jeton: gerant.jeton,
  corps: { email: chauffeur.email.toUpperCase() },
});
check('le chauffeur est invité', invitation.statut === 201, JSON.stringify(invitation.donnees));

titre('Le chauffeur accepte l’invitation depuis son espace');
const page = await nouvellePage('chauffeur');
await connecter(page, chauffeur.email);
await page.goto(`${SITE}/chauffeur`);
await page.waitForSelector(`text=Taxi ${uniq} vous invite à rouler pour elle.`, { timeout: 15000 });
check('l’invitation s’affiche', true);
await page.click('button:has-text("Accepter")');
await page.waitForSelector(`text=Vous roulez pour Taxi ${uniq}`, { timeout: 15000 });
check('il roule désormais pour la société', true);
const texte = await page.locator('main').innerText();
check('la société attend encore sa validation', texte.includes('attend encore sa validation'), texte.slice(0, 400));
check('aucun véhicule ne lui est encore attribué', texte.includes('pas encore attribué de véhicule'));
check('ni BCE, ni licence, ni véhicule à saisir', (await page.locator('input[name="numeroEntreprise"], input[name="numeroLicence"], input[name="vehiculePlaque"], select[name="region"]').count()) === 0);
check(
  'ses pièces se limitent à ce qui le concerne',
  texte.includes("Carte d'identité") && texte.includes('Permis de conduire') && !texte.includes('Licence LVC') && !texte.includes('Assurance transport')
);

await page.fill('input[name="telephone"]', '+32 470 11 22 33');
await page.click('button:has-text("Enregistrer")');
await page.waitForSelector('text=Profil enregistré.', { timeout: 10000 });
await page.locator('li', { hasText: "Carte d'identité" }).locator('input[type="file"]').setInputFiles({ name: 'identite.jpg', mimeType: 'image/jpeg', buffer: JPEG });
await page.waitForSelector('text=Document déposé, en attente de vérification.', { timeout: 10000 });
await deposer('/api/zupdrive/chauffeur/me/documents', chauffeur.jeton, 'permis');
const piecesSociete = await deposer('/api/zupdrive/chauffeur/me/documents', chauffeur.jeton, 'licence');
check('une pièce de la société ne se dépose pas depuis son dossier', piecesSociete.statut === 400, `${piecesSociete.statut}`);
await page.reload();
await page.click('button:has-text("Envoyer mon dossier")');
await page.waitForSelector('text=Dossier envoyé', { timeout: 10000 }).catch(() => undefined);
const dossierChauffeur = await appeler('/api/zupdrive/chauffeur/me', { jeton: chauffeur.jeton });
check('son dossier réduit s’envoie', dossierChauffeur.donnees?.data?.statut === 'SOUMIS', dossierChauffeur.donnees?.data?.statut);

titre('L’équipe ZupDrive valide la société et son véhicule');
const pageAdmin = await nouvellePage('admin');
await connecter(pageAdmin, adminDrive.email);
await pageAdmin.goto(`${SITE}/superowner/zupdrive/societes`);
await pageAdmin.waitForSelector(`text=Taxi ${uniq}`, { timeout: 15000 });
check('le menu propose « Sociétés » sous ZupDrive', (await pageAdmin.locator('aside a[href="/superowner/zupdrive/societes"]').count()) === 1);
check('la société est dans la file « À examiner »', true);
await pageAdmin.click(`button:has-text("Taxi ${uniq}")`);
const fiche = pageAdmin.locator('[data-societe]');
await fiche.waitFor({ timeout: 10000 });
const texteFiche = await fiche.innerText();
check('la fiche montre le véhicule, pas encore en règle', texteFiche.includes(PLAQUE) && texteFiche.includes('Pas encore en règle'), texteFiche.slice(0, 500));
check('et le chauffeur rattaché', texteFiche.includes(`chauffeur-societe ${uniq}`));
check('la validation attend l’examen des pièces', await fiche.locator('button:has-text("Valider la société")').isDisabled());

for (let tour = 0; tour < 8; tour++) {
  const bouton = fiche.getByRole('button', { name: 'Valider', exact: true });
  if ((await bouton.count()) === 0) break;
  await bouton.first().click();
  await pageAdmin.waitForTimeout(800);
}
await pageAdmin.waitForSelector('text=En règle : peut rouler', { timeout: 10000 });
check('toutes les pièces validées : le véhicule est en règle', true);
await fiche.locator('button:has-text("Valider la société")').click();
await pageAdmin.waitForTimeout(1500);
const societeValidee = await appeler('/api/zupdrive/societe/me', { jeton: gerant.jeton });
check('la société est validée', societeValidee.donnees?.data?.statut === 'VALIDE', societeValidee.donnees?.data?.statut);
const journal = await baseDeDonnees().systemAuditLog.count({
  where: { action: 'ZUPDRIVE_APPROVE_SOCIETE', target: societeValidee.donnees?.data?.id },
});
check('la décision est journalisée', journal === 1, `${journal}`);

// Le dossier du chauffeur : l'équipe le valide (vérifié en détail dans verif-zupdrive-chauffeur).
const chauffeurId = dossierChauffeur.donnees?.data?.id;
for (const piece of dossierChauffeur.donnees?.data?.documents || []) {
  await appeler(`/api/zupdrive/admin/chauffeurs/${chauffeurId}/documents/${piece.id}`, {
    method: 'PATCH',
    jeton: adminDrive.jeton,
    corps: { approuve: true },
  });
}
const valide = await appeler(`/api/zupdrive/admin/chauffeurs/${chauffeurId}/approve`, { method: 'POST', jeton: adminDrive.jeton });
check('le dossier du chauffeur est validé', valide.donnees?.data?.statut === 'VALIDE', JSON.stringify(valide.donnees));
await pageAdmin.goto(`${SITE}/superowner/zupdrive/chauffeurs/${chauffeurId}`);
await pageAdmin.waitForSelector(`[data-dossier="${chauffeurId}"]`, { timeout: 15000 });
check('sa fiche dit pour quelle société il roule', (await pageAdmin.locator(`[data-dossier="${chauffeurId}"]`).innerText()).includes(`Taxi ${uniq}`));

titre('Il roule avec le véhicule que la société lui attribue');
const sansVehicule = await appeler('/api/zupdrive/chauffeur/me/disponibilite', { method: 'POST', jeton: chauffeur.jeton, corps: { enLigne: true } });
check('sans véhicule, il ne peut pas se mettre en ligne', sansVehicule.statut === 403 && sansVehicule.donnees?.code === 'VEHICLE_NOT_READY', JSON.stringify(sansVehicule.donnees));
const intrus = await appeler(`/api/zupdrive/societe/me/chauffeurs/${chauffeurId}/vehicule`, {
  method: 'PUT',
  jeton: autreGerant.jeton,
  corps: { vehiculeId },
});
check('une autre société ne peut pas lui attribuer de véhicule', intrus.statut === 404, `${intrus.statut}`);
const attribue = await appeler(`/api/zupdrive/societe/me/chauffeurs/${chauffeurId}/vehicule`, {
  method: 'PUT',
  jeton: gerant.jeton,
  corps: { vehiculeId },
});
check('sa société lui attribue le véhicule', attribue.statut === 200, JSON.stringify(attribue.donnees));
const enLigne = await appeler('/api/zupdrive/chauffeur/me/disponibilite', { method: 'POST', jeton: chauffeur.jeton, corps: { enLigne: true } });
check('il peut se mettre en ligne', enLigne.statut === 200, JSON.stringify(enLigne.donnees));
await page.reload();
await page.waitForSelector(`text=Véhicule attribué : Toyota Corolla (${PLAQUE}).`, { timeout: 10000 });
check('son espace affiche le véhicule attribué', true);

const pieceVehicule = (await appeler('/api/zupdrive/societe/me', { jeton: gerant.jeton })).donnees?.data?.vehicules?.[0]?.documents?.[0];
const lectureAutre = await appeler(`/api/files/signed-url?url=${encodeURIComponent(pieceVehicule?.url || '')}`, { jeton: autreGerant.jeton });
check('une autre société ne lit pas les pièces du véhicule', lectureAutre.statut === 404, `${lectureAutre.statut}`);
const lectureGerant = await appeler(`/api/files/signed-url?url=${encodeURIComponent(pieceVehicule?.url || '')}`, { jeton: gerant.jeton });
check('le gérant, si', lectureGerant.statut === 200, `${lectureGerant.statut}`);

titre('Il quitte la société');
await page.click('button:has-text("Quitter la société")');
await page.waitForSelector('text=Vous avez quitté la société.', { timeout: 10000 });
const apres = (await appeler('/api/zupdrive/chauffeur/me', { jeton: chauffeur.jeton })).donnees?.data;
check('il ne roule plus pour elle, ni avec son véhicule', apres?.societeId === null && apres?.vehicule === null, JSON.stringify(apres).slice(0, 300));
check('sans licence à lui, son dossier repasse en brouillon', apres?.statut === 'BROUILLON', apres?.statut);
check('il est hors ligne', apres?.enLigne === false);

check('aucune erreur dans la console', erreurs.length === 0, erreurs.join(' | '));

await nav.close();
await baseDeDonnees().$disconnect();

console.log(`\n${ok} OK, ${echecs.length} échec(s)`);
process.exit(echecs.length ? 1 : 0);
