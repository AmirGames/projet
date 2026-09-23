/**
 * Le profil du commerçant, dans son espace.
 *
 * La plateforme lui prélevait une commission et lui devait des versements sans
 * rien savoir de lui : ni raison sociale, ni adresse de facturation, ni numéro
 * de TVA, ni compte où virer — et aucun écran ne le lui demandait.
 *
 * On vérifie ici qu'il peut renseigner tout cela depuis /merchant, que son
 * IBAN ne lui est jamais réaffiché en entier, et que la pièce qu'il dépose
 * arrive bien sur le bureau de la plateforme.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-profil-commercant.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia } from './inscription.mjs';
import { entrerEspaceCommercant } from './connexion.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';
const IBAN = 'FR7630006000011234567890189';

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
const emailCommercant = `m-${uniq}@t.fr`;

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailPlateforme, password: MDP, name: `Plateforme ${uniq}` },
});
const TP = plateforme.donnees?.accessToken;

if (!TP) {
  console.error(`Inscription de la plateforme impossible : ${JSON.stringify(plateforme.donnees)}`);
  console.error('La base doit être vierge : le premier compte inscrit devient la plateforme.');
  process.exit(1);
}

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailCommercant, password: MDP, name: `Commerce ${uniq}` },
});
const T = commercant.donnees.accessToken;
const orgId = commercant.donnees.organization.id;

// ===== Le navigateur =====

const nav = await chromium.launch();
const contexte = await nav.newContext();
const page = await contexte.newPage();

const erreurs = [];
page.on('console', (m) => {
  // Le script saisit exprès une TVA invalide : le 400 qui en résulte est ce
  // qu'on vérifie, pas un défaut de la page.
  if (m.type() === 'error' && !/400|403/.test(m.text())) {
    erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
  }
});

const texte = () => page.locator('body').innerText();

titre('Le commerçant ouvre son profil');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailCommercant);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await entrerEspaceCommercant(page);
await page.waitForTimeout(1500);

// Le profil n'était accessible d'aucun écran : c'est le lien qui compte, pas
// l'adresse tapée à la main.
check('le menu propose « Mon profil »', (await page.locator('aside a:has-text("Mon profil")').count()) === 1, 'lien absent');

await page.click('aside a:has-text("Mon profil")');
await page.waitForURL((url) => url.pathname === '/merchant/profil', { timeout: 15000 });
await page.waitForTimeout(2000);

const vide = await texte();
check('la page s’ouvre', /Mon profil/.test(vide), vide.slice(0, 400));
check(
  'ce qui manque pour être facturé est dit',
  /Pour être facturé/.test(vide) && /raison sociale/.test(vide),
  vide.slice(0, 900)
);
check('ce qui manque pour être payé aussi', /Pour être payé/.test(vide), vide.slice(0, 900));
check('aucun compte bancaire n’est annoncé', /Aucun compte enregistré/.test(vide), vide.slice(0, 1500));

titre('Il renseigne son identité de facturation');
await page.fill('#legalName', `Zupone Test ${uniq}`);
await page.fill('#registrationNumber', '81234567800015');
await page.fill('#vatNumber', 'FR12345678901');
await page.fill('#billingAddress', '20 Rue de la République');
await page.fill('#billingPostalCode', '69002');
await page.fill('#billingCity', 'Lyon');

titre('La Belgique est proposée');
// L'autocomplétion s'arrêtait à la frontière française, et le pays de
// facturation n'existait pas.
const pays = await page.locator('#billingCountry option').allInnerTexts();
check('France et Belgique sont au choix', pays.includes('France') && pays.includes('Belgique'), pays.join(','));

titre('Il renseigne le propriétaire et son compte');
await page.fill('#ownerFirstName', 'Amir');
await page.fill('#ownerLastName', `Test ${uniq}`);
await page.fill('#ownerEmail', `proprio-${uniq}@t.fr`);
await page.fill('#ownerPhone', '0600000000');
await page.fill('#ownerBirthDate', '1985-04-12');
await page.fill('#iban', IBAN);
await page.fill('#bic', 'AGRIFRPP');
await page.fill('#accountHolder', `Zupone Test ${uniq}`);

await page.click('button:has-text("Enregistrer")');
await page.waitForTimeout(3000);

const apres = await texte();
check('l’enregistrement est confirmé', /Profil enregistré/.test(apres), apres.slice(0, 600));
check('plus rien ne manque pour facturer', !/Pour être facturé/.test(apres), apres.slice(0, 900));
check('ni pour être payé', !/Pour être payé/.test(apres), apres.slice(0, 900));

const vuServeur = await appeler(`/api/merchant-profile/${orgId}`, { jeton: T });
check('le serveur a bien la raison sociale', vuServeur.donnees?.data?.legalName === `Zupone Test ${uniq}`, vuServeur.donnees?.data?.legalName);
check('et le numéro de TVA', vuServeur.donnees?.data?.vatNumber === 'FR12345678901', vuServeur.donnees?.data?.vatNumber);
check('et la date de naissance du propriétaire', String(vuServeur.donnees?.data?.ownerBirthDate || '').startsWith('1985-04-12'), vuServeur.donnees?.data?.ownerBirthDate);

titre('L’IBAN n’est jamais réaffiché');
// Le rendre en entier exposerait une coordonnée bancaire à chaque ouverture
// de page.
check('le compte est reconnaissable', /Compte enregistré : .*0189/.test(apres), apres.slice(0, 2500));
check('mais l’IBAN n’est pas à l’écran', !apres.includes(IBAN), 'IBAN affiché');
check('et le champ est vidé', (await page.inputValue('#iban')) === '', await page.inputValue('#iban'));

await page.reload();
await page.waitForTimeout(2500);
const recharge = await texte();
check('même après rechargement', !recharge.includes(IBAN), 'IBAN affiché');
check('le compte reste reconnu', /0189/.test(recharge), recharge.slice(0, 2500));

titre('Un enregistrement sans IBAN ne l’efface pas');
// Le champ étant vide par construction, un enregistrement ordinaire ne doit
// pas effacer le compte du commerçant.
await page.fill('#ownerPhone', '0611111111');
await page.click('button:has-text("Enregistrer")');
await page.waitForTimeout(3000);

const toujours = await appeler(`/api/merchant-profile/${orgId}`, { jeton: T });
check('le compte est toujours là', toujours.donnees?.data?.ibanRenseigne === true, `${toujours.donnees?.data?.ibanRenseigne}`);
check('et le téléphone a changé', toujours.donnees?.data?.ownerPhone === '0611111111', toujours.donnees?.data?.ownerPhone);

titre('Une TVA au mauvais format est refusée');
await page.fill('#vatNumber', 'FR1');
await page.click('button:has-text("Enregistrer")');
await page.waitForTimeout(2500);

const refus = await texte();
check('le refus est affiché', /TVA/.test(refus) && /invalide/i.test(refus), refus.slice(0, 900));

const inchange = await appeler(`/api/merchant-profile/${orgId}`, { jeton: T });
check('et la TVA n’a pas bougé', inchange.donnees?.data?.vatNumber === 'FR12345678901', inchange.donnees?.data?.vatNumber);

titre('Il dépose un justificatif');
await page.reload();
await page.waitForTimeout(2500);
await page.selectOption('#piece-type', 'registration');
await page.fill('#piece-lien', 'https://exemple.fr/kbis.pdf');
await page.click('button:has-text("Déposer la pièce")');
await page.waitForTimeout(3000);

const dossier = await texte();
check('la pièce figure au dossier', /Extrait d’immatriculation|Extrait d'immatriculation/.test(dossier), dossier.slice(-1500));
check('elle attend son examen', /En attente d’examen|En attente d'examen/.test(dossier), dossier.slice(-1500));

// ===== Côté plateforme =====

titre('La plateforme voit le dossier');
// Un contexte séparé : les deux espaces partagent le même stockage local, et
// la session de la plateforme écraserait celle du commerçant.
const contextePlateforme = await nav.newContext();
const plateformePage = await contextePlateforme.newPage();
plateformePage.on('console', (m) => {
  if (m.type() === 'error' && !/400|403/.test(m.text())) {
    erreurs.push(`${new URL(plateformePage.url()).pathname} : ${m.text()}`);
  }
});

await plateformePage.goto(`${SITE}/login`);
await plateformePage.fill('input[type="email"]', emailPlateforme);
await plateformePage.fill('input[type="password"]', MDP);
await plateformePage.click('button[type="submit"]');
await plateformePage.waitForURL('**/superowner**', { timeout: 15000 });
await plateformePage.waitForTimeout(1500);

await plateformePage.goto(`${SITE}/superowner/organizations/${orgId}`);
await plateformePage.waitForTimeout(3000);

const vuPlateforme = await plateformePage.locator('body').innerText();
check('le dossier est affiché', /Dossier du commerçant/.test(vuPlateforme), vuPlateforme.slice(0, 1200));
check('la raison sociale y est', vuPlateforme.includes(`Zupone Test ${uniq}`), vuPlateforme.slice(0, 2000));
check('le numéro de TVA aussi', vuPlateforme.includes('FR12345678901'), vuPlateforme.slice(0, 2500));
check('la pièce est signalée à examiner', /1 pièce à examiner/.test(vuPlateforme), vuPlateforme.slice(0, 2000));
// Elle rapproche un virement d'un compte : quatre caractères suffisent.
check('l’IBAN entier ne lui est pas montré', !vuPlateforme.includes(IBAN), 'IBAN affiché');
check('mais elle reconnaît le compte', /0189/.test(vuPlateforme), vuPlateforme.slice(0, 2500));

titre('Elle refuse la pièce en disant pourquoi');
await plateformePage.fill('input[aria-label^="Motif pour"]', 'Document illisible');
await plateformePage.click('button:has-text("Refuser")');
await plateformePage.waitForTimeout(3000);

const refuse = await plateformePage.locator('body').innerText();
check('le refus est affiché', /Refusé/.test(refuse), refuse.slice(0, 2000));
check('avec son motif', /Document illisible/.test(refuse), refuse.slice(0, 2000));

titre('Le commerçant lit le motif');
// Un refus muet le laisserait redéposer la même pièce à l'aveugle.
await page.reload();
await page.waitForTimeout(2500);
const motifLu = await texte();
check('le motif lui est montré', /Document illisible/.test(motifLu), motifLu.slice(-1800));

titre('Suspendu, il peut encore compléter son dossier');
/**
 * Une suspension tient le plus souvent à ce qui manque ici. Lui fermer cette
 * page faisait de la suspension une impasse : le support lui disait quoi
 * faire, et il n'avait nulle part où le faire.
 */
await appeler(`/api/superowner/organizations/${orgId}/suspend`, {
  method: 'POST',
  jeton: TP,
  corps: { reason: `Dossier incomplet ${uniq}` },
});

await page.reload();
await page.waitForTimeout(3000);

const suspendu = await texte();
check('la page reste ouverte', /Identité de facturation/.test(suspendu), suspendu.slice(0, 900));
check('la suspension est annoncée', /compte est suspendu/i.test(suspendu), suspendu.slice(0, 900));
check('avec son motif', suspendu.includes(`Dossier incomplet ${uniq}`), suspendu.slice(0, 1200));
check('et le support est à portée de lien', /prévenez le support/i.test(suspendu), suspendu.slice(0, 1200));

await page.selectOption('#piece-type', 'vat');
await page.fill('#piece-lien', 'https://exemple.fr/tva.pdf');
await page.click('button:has-text("Déposer la pièce")');
await page.waitForTimeout(3000);

const dossierSuspendu = await appeler(`/api/merchant-profile/${orgId}`, { jeton: T });
check(
  'la pièce déposée arrive bien au dossier',
  (dossierSuspendu.donnees?.data?.documents || []).some((d) => d.type === 'vat'),
  JSON.stringify(dossierSuspendu.donnees?.data?.documents?.map((d) => d.type))
);

// La porte est étroite : elle ne rouvre pas le commerce.
const commerce = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: { orgId, name: `Contournement ${uniq}`, slug: `contournement-${uniq}`, phone: '0400000000' },
});
check('le reste de l’espace reste fermé', commerce.statut === 403, `statut ${commerce.statut}`);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
