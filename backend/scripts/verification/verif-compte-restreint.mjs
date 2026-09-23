// Suspension et fermeture d'un compte : appliquées partout, immédiatement, et
// ne laissant qu'une porte — le support.

import { inscription, titre, check, j, uniq, post, get, put, patch, del, terminer, sqlScalaire } from './outils.mjs';

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;
const ORG = commercant.organization.id;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: ORG,
      name: `Pizzeria ${uniq}`,
      slug: `pizzeria-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post('/api/products', { storeId, name: 'Margherita', price: 12, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

/**
 * Un échantillon représentatif de ce qu'un commerçant fait de sa journée.
 *
 * Le contrôle n'était branché que sur trois routes : créer une boutique,
 * créer un produit, basculer sa disponibilité. Tout le reste passait.
 */
const TRAVAIL_COURANT = [
  ['modifier un produit', () => put(`/api/products/${productId}`, { name: 'Margherita bis' }, T)],
  ['créer un produit', () => post('/api/products', { storeId, name: `Reine ${uniq}`, price: 13 }, T)],
  ['passer un plat en épuisé', () => patch(`/api/products/${productId}/availability`, { isAvailable: false, storeId }, T)],
  ['créer une catégorie', () => post('/api/categories', { storeId, name: `Pizzas ${uniq}` }, T)],
  ['lire ses commandes', () => get(`/api/orders?storeId=${storeId}`, T)],
  ['lire ses statistiques', () => get(`/api/reports/sales?storeId=${storeId}`, T)],
  ['changer ses horaires', () => put(`/api/store-hours/${storeId}/day/MON`, { open: '09:00', close: '18:00', closed: false }, T)],
  ['modifier sa boutique', () => put(`/api/stores/${storeId}`, { name: `Pizzeria bis ${uniq}` }, T)],
  ['créer une promotion', () => post('/api/promotions', { storeId, code: `PROMO${uniq}`, type: 'PERCENTAGE', value: 10 }, T)],
  ['ouvrir une boutique de plus', () => post('/api/stores', { orgId: ORG, name: `Autre ${uniq}`, slug: `autre-${uniq}`, address: '2 rue', city: 'Lyon', postalCode: '69003', phone: '0400000001' }, T)],
  ['voir sa formule', () => get(`/api/plans/${ORG}`, T)],
  ['lire son organisation', () => get(`/api/organizations/${ORG}`, T)],
];

/** Ce qui doit rester ouvert : le support, et ce qui le sert. */
const PORTES_OUVERTES = [
  ['lire l’état de son compte', () => get(`/api/support/compte/${ORG}`, T)],
  ['lister ses tickets', () => get(`/api/support/tickets?orgId=${ORG}`, T)],
  ['lire ses notifications', () => get('/api/notifications', T)],
];

/**
 * Joue tout le travail courant et rend, pour chaque action, le code de refus.
 *
 * Le statut HTTP ne suffit pas : le quota de boutiques répond 403 lui aussi,
 * et c'est légitime. Seul le code distingue un refus dû au compte.
 */
const CODES_DE_COMPTE = ['ACCOUNT_SUSPENDED', 'ACCOUNT_CLOSED', 'ACCOUNT_INACTIVE'];

async function jouerLeTravail() {
  const resultats = [];

  for (const [nom, appel] of TRAVAIL_COURANT) {
    const reponse = await appel();
    const corps = reponse.status >= 400 ? await j(reponse) : null;
    resultats.push([nom, reponse.status, corps?.code || '']);
  }

  return resultats;
}

const bloqueesParLeCompte = (resultats) =>
  resultats.filter(([, , code]) => CODES_DE_COMPTE.includes(code));

// ===== Compte actif : tout fonctionne =====

titre('Un compte actif travaille');
const avant = await jouerLeTravail();

check(
  'aucune action n’est refusée pour cause de compte',
  bloqueesParLeCompte(avant).length === 0,
  JSON.stringify(bloqueesParLeCompte(avant))
);

// ===== Suspension =====

titre('Suspension');
const suspension = await post(`/api/superowner/organizations/${ORG}/suspend`, { reason: `Fraude ${uniq}` }, TP);
check('la plateforme peut suspendre', suspension.status === 200, `statut ${suspension.status}`);

const enBase = await sqlScalaire(`SELECT "status" FROM "Organization" WHERE id = '${ORG}'`);
check('le statut est écrit', enBase === 'SUSPENDED', enBase);

const motif = await sqlScalaire(`SELECT "suspensionReason" FROM "Organization" WHERE id = '${ORG}'`);
check('le motif est conservé', motif === `Fraude ${uniq}`, motif);

titre('Tout est bloqué, sans reconnexion');
// Le même jeton qu'avant : l'effet doit être immédiat, pas au prochain
// identifiant.
const apres = await jouerLeTravail();
const passees = apres.filter(([, , code]) => !CODES_DE_COMPTE.includes(code));

check(
  'chaque action est refusée avec le même jeton',
  passees.length === 0,
  JSON.stringify(passees)
);

const refus = await j(await put(`/api/products/${productId}`, { name: 'Test' }, T));
check('le refus est en français', /suspendu/i.test(refus?.error || ''), refus?.error);
check('il nomme le support', /support/i.test(refus?.error || ''), refus?.error);
check('il porte un code lisible', refus?.code === 'ACCOUNT_SUSPENDED', refus?.code);
check('il dit à la page quoi montrer', refus?.accountStatus === 'SUSPENDED', JSON.stringify(refus));
check('il signale l’accès au seul support', refus?.supportOnly === true, JSON.stringify(refus));

// L'effet doit être réel, pas seulement annoncé.
const nomProduit = await sqlScalaire(`SELECT "name" FROM "Product" WHERE id = '${productId}'`);
check('le produit n’a pas été modifié', nomProduit !== 'Test', nomProduit);

titre('Le support reste ouvert');
for (const [nom, appel] of PORTES_OUVERTES) {
  const reponse = await appel();
  check(nom, reponse.status === 200, `statut ${reponse.status}`);
}

const ticket = await post(
  '/api/support/tickets',
  {
    orgId: ORG,
    subject: `Contestation ${uniq}`,
    description: 'Je conteste cette suspension et demande un réexamen.',
    priority: 'HIGH',
    category: 'ACCOUNT',
  },
  T
);
check('il peut ouvrir un ticket', ticket.status === 201, `statut ${ticket.status}`);

const corpsTicket = await j(ticket);
const ticketId = corpsTicket?.data?.id;

const reponseMarchand = await post(
  `/api/support/tickets/${ticketId}/messages`,
  { body: 'Voici les justificatifs demandés.' },
  T
);
check('il peut écrire dans le fil', reponseMarchand.status < 400, `statut ${reponseMarchand.status}`);

titre('Et il reçoit les réponses');
await post(
  `/api/superowner/support-tickets/${ticketId}/messages`,
  { body: 'Nous examinons votre dossier.' },
  TP
);

const fil = await j(await get(`/api/support/tickets/${ticketId}/messages`, T));
const messages = fil?.data || fil?.messages || [];
check(
  'la réponse du support lui parvient',
  messages.some?.((m) => (m.body || '').includes('Nous examinons')),
  JSON.stringify(messages)?.slice(0, 300)
);

titre('Il est prévenu');
const annonce = await sqlScalaire(
  `SELECT "title" FROM "Notification" WHERE "recipientEmail" = '${commercant.user.email}' AND "title" LIKE '%suspendu%' LIMIT 1`
);
check('une notification l’annonce', annonce.includes('suspendu'), annonce || 'aucune');

const lien = await sqlScalaire(
  `SELECT "link" FROM "Notification" WHERE "recipientEmail" = '${commercant.user.email}' AND "title" LIKE '%suspendu%' LIMIT 1`
);
check('elle mène au support', lien === `/merchant/${ORG}/support`, lien);

titre('La vitrine ne sert plus la boutique');
const vitrine = await get(`/api/client/stores/${storeId}`);
check('le client ne voit plus le menu', vitrine.status === 423, `statut ${vitrine.status}`);

titre('La plateforme garde la main');
check(
  'elle lit toujours le commerçant',
  (await get('/api/superowner/organizations', TP)).status === 200,
  'bloquée à tort'
);
check(
  'elle voit le ticket ouvert',
  (await get('/api/superowner/support-tickets', TP)).status === 200,
  'bloquée à tort'
);

// ===== Le dossier reste ouvert =====

titre('Un suspendu garde la main sur son dossier');
/**
 * Une suspension tient le plus souvent à ce qui manque : un justificatif, un
 * numéro de TVA, une coordonnée bancaire. Fermer au suspendu la page où il
 * complète tout cela faisait de la suspension une impasse — le support lui
 * disait quoi faire, et il n'avait nulle part où le faire.
 */
const dossier = await get(`/api/merchant-profile/${ORG}`, T);
check('il lit son profil', dossier.status === 200, `statut ${dossier.status}`);

const complete = await put(
  `/api/merchant-profile/${ORG}`,
  { legalName: `Regularise ${uniq}`, vatNumber: 'FR12345678901' },
  T
);
check('il complète ce qui manque', complete.status === 200, `statut ${complete.status}`);

const raisonSociale = await sqlScalaire(`SELECT "legalName" FROM "Organization" WHERE id = '${ORG}'`);
check('et la correction est bien enregistrée', raisonSociale === `Regularise ${uniq}`, raisonSociale);

const piece = await post(
  `/api/merchant-profile/${ORG}/documents`,
  { type: 'registration', documentUrl: 'https://exemple.fr/kbis.pdf' },
  T
);
check('il dépose la pièce demandée', piece.status === 201, `statut ${piece.status}`);

const deposees = await sqlScalaire(
  `SELECT COUNT(*) FROM "OrganizationDocument" WHERE "orgId" = '${ORG}'`
);
check('elle arrive au dossier', deposees === '1', deposees);

// La porte est étroite : elle ne rouvre pas le commerce.
const catalogue = await put(`/api/products/${productId}`, { name: `Contournement ${uniq}` }, T);
check('le catalogue reste fermé', catalogue.status === 403, `statut ${catalogue.status}`);

// ===== Réactivation =====

titre('Réactivation');
const reprise = await post(`/api/superowner/organizations/${ORG}/unsuspend`, {}, TP);
check('la plateforme peut réactiver', reprise.status === 200, `statut ${reprise.status}`);

const repriseTravail = await jouerLeTravail();

check(
  'tout redevient accessible, sans reconnexion',
  bloqueesParLeCompte(repriseTravail).length === 0,
  JSON.stringify(bloqueesParLeCompte(repriseTravail))
);

const repriseAnnonce = await sqlScalaire(
  `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = '${commercant.user.email}' AND "title" LIKE '%réactivé%'`
);
check('la reprise est annoncée', repriseAnnonce === '1', repriseAnnonce);

// ===== Fermeture =====

titre('Fermeture');
const fermeture = await post(`/api/superowner/organizations/${ORG}/close`, { reason: `Cessation ${uniq}` }, TP);
check('la plateforme peut fermer', fermeture.status < 400, `statut ${fermeture.status}`);

const statutFerme = await sqlScalaire(`SELECT "status" FROM "Organization" WHERE id = '${ORG}'`);
check('le statut est écrit', statutFerme === 'CLOSED', statutFerme);

const apresFermeture = await jouerLeTravail();
const echappees = apresFermeture.filter(([, , code]) => code !== 'ACCOUNT_CLOSED');

check('tout est bloqué là aussi', echappees.length === 0, JSON.stringify(echappees));

// Un compte fermé n'a plus de dossier à tenir : la porte se referme aussi.
const dossierFerme = await get(`/api/merchant-profile/${ORG}`, T);
check('le dossier se referme à la fermeture', dossierFerme.status === 403, `statut ${dossierFerme.status}`);

const refusFerme = await j(await get(`/api/orders?storeId=${storeId}`, T));
check('le refus parle de fermeture', /fermé/i.test(refusFerme?.error || ''), refusFerme?.error);
check('le code le dit aussi', refusFerme?.code === 'ACCOUNT_CLOSED', refusFerme?.code);

titre('Le support reste ouvert, même fermé');
for (const [nom, appel] of PORTES_OUVERTES) {
  const reponse = await appel();
  check(nom, reponse.status === 200, `statut ${reponse.status}`);
}

const ticketFerme = await post(
  '/api/support/tickets',
  {
    orgId: ORG,
    subject: `Réouverture ${uniq}`,
    description: 'Je souhaite rouvrir mon compte.',
    priority: 'MEDIUM',
    category: 'ACCOUNT',
  },
  T
);
check('il peut encore écrire au support', ticketFerme.status === 201, `statut ${ticketFerme.status}`);

const annonceFermeture = await sqlScalaire(
  `SELECT "title" FROM "Notification" WHERE "recipientEmail" = '${commercant.user.email}' AND "title" LIKE '%fermé%' LIMIT 1`
);
check('la fermeture est annoncée', annonceFermeture.includes('fermé'), annonceFermeture || 'aucune');

titre('Le chemin qui porte l’état reste joignable');
// Sans cela, le bandeau qui explique la suspension disparaissait au moment
// précis où il devient utile.
const etat = await j(await get(`/api/support/compte/${ORG}`, T));
check('le statut est lisible', etat?.status === 'CLOSED', JSON.stringify(etat)?.slice(0, 200));
check('le motif est rendu', (etat?.closureReason || '').includes(`Cessation ${uniq}`), etat?.closureReason);
check('la date limite est rendue', Boolean(etat?.closedUntil), `${etat?.closedUntil}`);

titre('Un étranger ne lit pas cet état');
const intrus = await j(
  await inscription({ email: `x-${uniq}@t.fr`, password: 'Password123!', name: `X ${uniq}` })
);
check(
  'l’accès est refusé',
  (await get(`/api/support/compte/${ORG}`, intrus.accessToken)).status === 403,
  'accepté à tort'
);

titre('Un compte actif n’est pas gêné');
check(
  'l’intrus travaille normalement',
  (await get('/api/notifications', intrus.accessToken)).status === 200,
  'bloqué à tort'
);

// Le décor sert aussi à ne pas laisser de variable inutilisée.
check(
  'la suppression est bloquée par le compte, pas par un hasard',
  (await j(await del(`/api/products/${productId}`, null, T)))?.code === 'ACCOUNT_CLOSED',
  'refus d’une autre nature'
);

await terminer();
