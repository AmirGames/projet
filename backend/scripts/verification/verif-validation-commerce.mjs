// La validation d'un commerce par la plateforme, et l'expiration de ses pièces.
//
// Ce qui compte ici : qu'un commerce pas encore validé prépare sa boutique
// sans pouvoir l'ouvrir ni vendre — même en forçant le bouton en base —, qu'il
// n'apparaisse pas aux clients, que la plateforme ne puisse valider qu'un
// dossier complet, et qu'une pièce qui expire soit annoncée trente jours avant,
// une seule fois.

import { execFileSync } from 'node:child_process';

import {
  titre,
  check,
  j,
  uniq,
  post,
  patch,
  get,
  terminer,
  sqlScalaire,
  sqlExec,
} from './outils.mjs';

const MDP = 'Password123!';

const inscrireCommerce = async (prefixe) =>
  j(
    await post('/api/auth/merchant-register', {
      businessName: `${prefixe} ${uniq}`,
      email: `${prefixe}-${uniq}@t.fr`,
      password: MDP,
      businessType: 'restaurant',
      phone: '0600000000',
      address: '20 Rue de la République',
      city: 'Lyon',
      postalCode: '69002',
      description: 'Commerce de vérification',
      storeName: `${prefixe} ${uniq}`,
      storeSlug: `${prefixe}-${uniq}`.toLowerCase(),
    })
  );

/** Joue la surveillance des pièces, comme le ferait le passage horaire. */
const surveiller = () =>
  execFileSync(
    'npx',
    [
      'tsx',
      // Le service lit sa configuration comme le serveur : depuis .env.
      '--import',
      'dotenv/config',
      '-e',
      `import('./src/services/merchant-approval.service.ts').then(async ({ MerchantApprovalService }) => {
         console.log(JSON.stringify(await MerchantApprovalService.surveillerExpirations()));
         process.exit(0);
       })`,
    ],
    { encoding: 'utf8', env: { ...process.env, LOG_LEVEL: 'error' } }
  );

const notifications = (email, motif) =>
  sqlScalaire(
    `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = '${email}' AND title LIKE '${motif}'`
  );

// ===== La plateforme, validée d'office =====

titre('La plateforme n’a personne pour la valider');
const plateforme = await inscrireCommerce('plateforme');
const TP = plateforme.accessToken;
check('la plateforme est inscrite', !!TP, JSON.stringify(plateforme)?.slice(0, 200));
check(
  'son commerce est validé d’office',
  (await sqlScalaire(`SELECT "approvedAt" FROM "Organization" WHERE id = '${plateforme.organization?.id}'`)) !== ''
);

// ===== Un commerce qui s'inscrit =====

titre('Un commerce naît en attente de validation');
const commerce = await inscrireCommerce('commerce');
const T = commerce.accessToken;
const orgId = commerce.organization?.id;
const storeId = commerce.store?.id;
const emailCommerce = `commerce-${uniq}@t.fr`;

check('le commerce est inscrit', !!orgId && !!storeId, JSON.stringify(commerce)?.slice(0, 200));
check(
  'il n’est pas validé',
  (await sqlScalaire(`SELECT "approvedAt" FROM "Organization" WHERE id = '${orgId}'`)) === ''
);
check(
  'sa boutique naît fermée',
  (await sqlScalaire(`SELECT "isOpen" FROM "Store" WHERE id = '${storeId}'`)) === 'false'
);

const compte = await j(await get(`/api/support/compte/${orgId}`, T));
check('l’état du compte dit « non validé »', compte?.validation?.valide === false, JSON.stringify(compte));
check(
  'il dit aussi ce qui manque',
  (compte?.validation?.piecesManquantes || []).map((p) => p.type).join(',') === 'registration,identity,bank',
  JSON.stringify(compte?.validation?.piecesManquantes)
);
check(
  'tout est à fournir, rien en examen',
  (compte?.validation?.piecesAFournir || []).length === 3 &&
    (compte?.validation?.piecesEnExamen || []).length === 0,
  JSON.stringify(compte?.validation)
);

titre('Il prépare sa boutique');
const categorie = await j(await post('/api/categories', { storeId, name: 'Pizzas' }, T));
const categoryId = categorie?.category?.id || categorie?.id || categorie?.data?.id;
check('il crée une catégorie', !!categoryId, JSON.stringify(categorie)?.slice(0, 200));

const produit = await j(
  await post(
    '/api/products',
    { storeId, name: 'Margherita', price: 10, categoryId, status: 'ACTIVE', stock: 50 },
    T
  )
);
const productId = produit?.product?.id || produit?.id || produit?.data?.id;
check('il crée un produit', !!productId, JSON.stringify(produit)?.slice(0, 200));

titre('Il ne peut pas ouvrir');
const ouverture = await patch(`/api/store-hours/${storeId}/status`, { isOpen: true }, T);
const corpsOuverture = await j(ouverture);
check('l’ouverture est refusée', ouverture.status === 403, `${ouverture.status} ${JSON.stringify(corpsOuverture)}`);
check('avec un code que l’écran reconnaît', corpsOuverture?.code === 'MERCHANT_NOT_APPROVED', JSON.stringify(corpsOuverture));
check(
  'la boutique est restée fermée',
  (await sqlScalaire(`SELECT "isOpen" FROM "Store" WHERE id = '${storeId}'`)) === 'false'
);

const fermeture = await patch(`/api/store-hours/${storeId}/status`, { isOpen: false }, T);
check('fermer, lui, reste permis', fermeture.status === 200, String(fermeture.status));

const forcee = await post(`/api/superowner/stores/${storeId}/ouverture`, { ouvert: true }, TP);
check('la plateforme non plus ne force pas l’ouverture', forcee.status === 403, String(forcee.status));

titre('Il ne vend pas, même boutique ouverte en base');
await sqlExec(`UPDATE "Store" SET "isOpen" = true WHERE id = '${storeId}'`);
const commande = await post('/api/orders', {
  storeId,
  customerName: 'Client Test',
  customerEmail: `client-${uniq}@t.fr`,
  customerPhone: '0611111111',
  deliveryType: 'PICKUP',
  totalAmount: 10,
  items: [{ productId, quantity: 1, price: 10 }],
});
const corpsCommande = await j(commande);
check('la commande est refusée', corpsCommande?.code === 'MERCHANT_NOT_APPROVED', `${commande.status} ${JSON.stringify(corpsCommande)}`);
check(
  'aucune commande n’est enregistrée',
  (await sqlScalaire(`SELECT COUNT(*) FROM "Order" WHERE "storeId" = '${storeId}'`)) === '0'
);
await sqlExec(`UPDATE "Store" SET "isOpen" = false WHERE id = '${storeId}'`);

titre('Les clients ne le voient pas');
const liste = await j(await get('/api/client/stores'));
check(
  'absent de la liste des commerces',
  Array.isArray(liste?.data) && !liste.data.some((b) => b.id === storeId),
  JSON.stringify(liste)?.slice(0, 200)
);
const recherche = await j(await get(`/api/client/stores/search?q=commerce`));
check(
  'absent de la recherche',
  Array.isArray(recherche?.data) && !recherche.data.some((b) => b.id === storeId)
);
const fiche = await j(await get(`/api/client/stores/${storeId}`));
check('sa fiche reste lisible, pour qu’il la prévisualise', !!fiche?.data?.id, JSON.stringify(fiche)?.slice(0, 200));
check('elle se dit en attente de validation', fiche?.data?.enAttenteDeValidation === true);
check('et jamais ouverte', fiche?.data?.isOpenNow === false);

// ===== Le dossier =====

titre('La plateforme ne valide pas un dossier incomplet');
const tropTot = await post(`/api/superowner/organizations/${orgId}/approve`, {}, TP);
const corpsTropTot = await j(tropTot);
check('validation refusée', tropTot.status === 400 && corpsTropTot?.code === 'INCOMPLETE_FILE', JSON.stringify(corpsTropTot));

const intrus = await post(`/api/superowner/organizations/${orgId}/approve`, {}, T);
check('le commerçant ne se valide pas lui-même', intrus.status === 403, String(intrus.status));

titre('Il dépose ses pièces');
const dansVingtJours = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
const dansUnAn = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
for (const [type, expiryDate] of [
  ['registration', dansVingtJours],
  ['identity', dansUnAn],
  ['bank', null],
]) {
  const depot = await post(
    `/api/merchant-profile/${orgId}/documents`,
    { type, documentUrl: `https://exemple.fr/${type}.pdf`, expiryDate },
    T
  );
  check(`${type} déposé`, depot.status === 201, String(depot.status));
}

const emailPlateforme = `plateforme-${uniq}@t.fr`;
check(
  'la plateforme apprend qu’un dossier l’attend',
  Number(await notifications(emailPlateforme, 'Dossier à examiner%')) >= 1
);

titre('Une pièce déposée n’est plus « à fournir »');
const apresDepot = (await j(await get(`/api/support/compte/${orgId}`, T)))?.validation;
check(
  'plus rien à fournir',
  (apresDepot?.piecesAFournir || []).length === 0,
  JSON.stringify(apresDepot?.piecesAFournir)
);
check(
  'les trois sont en examen',
  (apresDepot?.piecesEnExamen || []).map((p) => p.type).join(',') === 'registration,identity,bank',
  JSON.stringify(apresDepot?.piecesEnExamen)
);

const aRefuser = (await j(await get(`/api/superowner/organizations/${orgId}/profile`, TP)))?.data?.documents?.find(
  (piece) => piece.type === 'bank'
);
await patch(
  `/api/superowner/organizations/${orgId}/documents/${aRefuser?.id}`,
  { approuve: false, note: 'RIB illisible' },
  TP
);
const apresRefus = (await j(await get(`/api/support/compte/${orgId}`, T)))?.validation;
check(
  'une pièce refusée redevient « à fournir »',
  (apresRefus?.piecesAFournir || []).map((p) => p.type).join(',') === 'bank' &&
    (apresRefus?.piecesEnExamen || []).length === 2,
  JSON.stringify(apresRefus)
);
await post(
  `/api/merchant-profile/${orgId}/documents`,
  { type: 'bank', documentUrl: 'https://exemple.fr/rib-2.pdf' },
  T
);

titre('La plateforme examine et valide');
const dossier = await j(await get(`/api/superowner/organizations/${orgId}/profile`, TP));
check(
  'le dossier montre l’état de la validation',
  dossier?.data?.validation?.valide === false && dossier?.data?.validation?.dossierComplet === false,
  JSON.stringify(dossier?.data?.validation)
);
for (const piece of dossier?.data?.documents || []) {
  await patch(`/api/superowner/organizations/${orgId}/documents/${piece.id}`, { approuve: true }, TP);
}

const validation = await post(`/api/superowner/organizations/${orgId}/approve`, {}, TP);
check('le commerce est validé', validation.status === 200, `${validation.status} ${JSON.stringify(await j(validation))}`);
check(
  'la validation est en base, avec son auteur',
  (await sqlScalaire(`SELECT "approvedBy" FROM "Organization" WHERE id = '${orgId}'`)) === plateforme.user?.id
);
check('le commerçant est prévenu', Number(await notifications(emailCommerce, 'Votre commerce est validé')) === 1);
check(
  'le geste part au journal',
  Number(await sqlScalaire(`SELECT COUNT(*) FROM "SystemAuditLog" WHERE action = 'APPROVE_MERCHANT' AND target = '${orgId}'`)) === 1
);
const deuxFois = await post(`/api/superowner/organizations/${orgId}/approve`, {}, TP);
check('pas de seconde validation', deuxFois.status === 400, String(deuxFois.status));

titre('Il ouvre et vend');
const ouvre = await patch(`/api/store-hours/${storeId}/status`, { isOpen: true }, T);
check('l’ouverture passe', ouvre.status === 200, String(ouvre.status));
const listeApres = await j(await get('/api/client/stores'));
check('il apparaît aux clients', (listeApres?.data || []).some((b) => b.id === storeId));
const commandeApres = await post('/api/orders', {
  storeId,
  customerName: 'Client Test',
  customerEmail: `client-${uniq}@t.fr`,
  customerPhone: '0611111111',
  deliveryType: 'PICKUP',
  totalAmount: 10,
  items: [{ productId, quantity: 1, price: 10 }],
});
const corpsCommandeApres = await j(commandeApres);
check(
  'la commande n’est plus bloquée par la validation',
  corpsCommandeApres?.code !== 'MERCHANT_NOT_APPROVED',
  `${commandeApres.status} ${JSON.stringify(corpsCommandeApres)?.slice(0, 200)}`
);

// ===== L'expiration =====

titre('Une pièce qui expire dans vingt jours est annoncée, une fois');
const premier = JSON.parse(surveiller().trim().split('\n').pop());
check('un rappel est envoyé', premier.rappels >= 1, JSON.stringify(premier));
check(
  'le commerçant le reçoit',
  Number(await notifications(emailCommerce, '%expire dans%')) === 1
);
check(
  'le rappel est noté sur la pièce',
  (await sqlScalaire(
    `SELECT "expiryReminderAt" FROM "OrganizationDocument" WHERE "orgId" = '${orgId}' AND type = 'registration'`
  )) !== ''
);
check(
  'la pièce d’identité, à un an, n’est pas concernée',
  (await sqlScalaire(
    `SELECT "expiryReminderAt" FROM "OrganizationDocument" WHERE "orgId" = '${orgId}' AND type = 'identity'`
  )) === ''
);
surveiller();
check(
  'un second passage ne relance pas',
  Number(await notifications(emailCommerce, '%expire dans%')) === 1
);

titre('Le jour venu, elle expire');
await sqlExec(
  `UPDATE "OrganizationDocument" SET "expiryDate" = NOW() - INTERVAL '1 hour' WHERE "orgId" = '${orgId}' AND type = 'registration'`
);
surveiller();
check(
  'la pièce passe « expirée »',
  (await sqlScalaire(
    `SELECT status FROM "OrganizationDocument" WHERE "orgId" = '${orgId}' AND type = 'registration'`
  )) === 'EXPIRED'
);
check('le commerçant est prévenu', Number(await notifications(emailCommerce, '%document expiré')) === 1);
check('la plateforme aussi', Number(await notifications(emailPlateforme, 'Pièce expirée%')) === 1);
check(
  'le commerce n’est pas fermé d’office',
  (await sqlScalaire(`SELECT "approvedAt" FROM "Organization" WHERE id = '${orgId}'`)) !== '' &&
    (await sqlScalaire(`SELECT "isOpen" FROM "Store" WHERE id = '${storeId}'`)) === 'true'
);

titre('Une nouvelle pièce repart de zéro');
await post(
  `/api/merchant-profile/${orgId}/documents`,
  { type: 'registration', documentUrl: 'https://exemple.fr/kbis-2.pdf', expiryDate: dansUnAn },
  T
);
check(
  'elle attend son examen, sans rappel hérité',
  (await sqlScalaire(
    `SELECT status || '|' || COALESCE("expiryReminderAt"::text, '') FROM "OrganizationDocument" WHERE "orgId" = '${orgId}' AND type = 'registration'`
  )) === 'PENDING|'
);

await terminer();
