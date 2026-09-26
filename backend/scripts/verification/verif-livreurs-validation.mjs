// Un livreur ne roule pas avant que la plateforme ait vu son dossier.

import { inscription, titre, check, j, uniq, post, get, patch, terminer, sqlScalaire } from './outils.mjs';

const MDP = 'Password123!';

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

// Un commerçant, sa boutique et une commande à livrer : de quoi vérifier
// qu'aucune course ne part vers un livreur non validé.
const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Resto ${uniq}`,
      slug: `resto-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
      latitude: 45.764,
      longitude: 4.8357,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post('/api/products', { storeId, name: `Plat ${uniq}`, price: 15, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

const commande = await j(
  await post('/api/orders', { conditionsAcceptees: true,
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '12 avenue Thiers',
    deliveryCity: 'Lyon',
    deliveryLat: 45.78,
    deliveryLng: 4.86,
    totalAmount: 15,
    items: [{ productId, quantity: 1, price: 15 }],
  })
);
const orderId = commande.order?.id || commande.id;

// ===== L'inscription ne suffit plus =====

titre('Un livreur qui s’inscrit attend');
const livreur = await j(
  await post('/api/drivers/register', { conditionsAcceptees: true,
    name: `Karim ${uniq}`,
    email: `d-${uniq}@t.fr`,
    password: MDP,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  })
);
const D = livreur.accessToken;

const etat = await sqlScalaire(`SELECT status FROM "Driver" WHERE email = 'd-${uniq}@t.fr'`);
// Il naissait ACTIVE : inscrit à 14 h, en course à 14 h 01, sans que personne
// n'ait vu son permis.
check('son dossier est en attente', etat === 'PENDING', etat);

const profil = await j(await get('/api/drivers/me', D));
check('son espace le lui dit', profil?.data?.status === 'PENDING', profil?.data?.status);
check(
  'et lui annonce les pièces attendues',
  (profil?.data?.piecesAttendues || []).includes('license'),
  JSON.stringify(profil?.data?.piecesAttendues)
);

titre('Il ne peut pas se mettre en ligne');
const enLigne = await patch('/api/drivers/availability', { isOnline: true }, D);
check('le passage en ligne est refusé', enLigne.status === 403, `statut ${enLigne.status}`);
check(
  'et on lui dit pourquoi',
  /dossier est en cours de validation/i.test((await j(enLigne))?.error || ''),
  (await j(enLigne))?.error
);

titre('Et aucune course ne lui est proposée');
await patch('/api/drivers/location', { latitude: 45.764, longitude: 4.8357 }, D);
const recherche = await j(await post(`/api/orders/${orderId}/dispatch`, {}, T));
check('personne n’est disponible', recherche?.data?.propose !== true, JSON.stringify(recherche?.data));

// ===== Le dossier =====

titre('Il dépose ses pièces');
const depot = await post(
  '/api/drivers/documents',
  { type: 'license', documentUrl: 'https://exemple.fr/permis.pdf', expiryDate: '2030-01-01T00:00:00.000Z' },
  D
);
check('la pièce est acceptée', depot.status === 201, `statut ${depot.status}`);

const expiree = await post(
  '/api/drivers/documents',
  { type: 'insurance', documentUrl: 'https://exemple.fr/assurance.pdf', expiryDate: '2020-01-01T00:00:00.000Z' },
  D
);
check('une pièce déjà expirée est refusée', expiree.status === 400, `statut ${expiree.status}`);

await post('/api/drivers/documents', { type: 'identity', documentUrl: 'https://exemple.fr/id.pdf' }, D);
await post('/api/drivers/documents', { type: 'insurance', documentUrl: 'https://exemple.fr/assur.pdf' }, D);
await post('/api/drivers/documents', { type: 'vehicle_registration', documentUrl: 'https://exemple.fr/cg.pdf' }, D);

const dossier = await j(await get('/api/drivers/documents', D));
check('ses quatre pièces sont au dossier', (dossier?.data?.documents || []).length === 4, `${(dossier?.data?.documents || []).length}`);
check('le dossier n’est pas complet tant que rien n’est validé', dossier?.data?.dossierComplet === false, `${dossier?.data?.dossierComplet}`);

// ===== La plateforme examine =====

titre('La plateforme voit les dossiers à traiter');
const liste = await j(await get('/api/superowner/drivers?status=PENDING', TP));
const enAttente = (liste?.drivers || []).find((l) => l.email === `d-${uniq}@t.fr`);

check('le livreur y figure', enAttente !== undefined, JSON.stringify((liste?.drivers || []).map((l) => l.email)));
check('avec le compte de ses pièces', enAttente?.piecesDeposees === 4, `${enAttente?.piecesDeposees}`);
check('et aucune validée', enAttente?.piecesValidees === 0, `${enAttente?.piecesValidees}`);
check('le décompte par état est rendu', Number(liste?.counts?.PENDING) >= 1, JSON.stringify(liste?.counts));

const vue = await j(await get(`/api/superowner/drivers/${enAttente.id}`, TP));
check('le dossier s’ouvre', vue?.driver?.id === enAttente.id, JSON.stringify(vue?.driver));
check('les pièces sont lisibles', (vue?.documents || []).length === 4, `${(vue?.documents || []).length}`);
check(
  'chacune porte son libellé en français',
  (vue?.documents || []).some((piece) => piece.libelle === 'Permis de conduire'),
  JSON.stringify((vue?.documents || []).map((p) => p.libelle))
);

titre('Valider sans dossier complet est refusé');
const trop = await post(`/api/superowner/drivers/${enAttente.id}/approve`, {}, TP);
check('la validation est refusée', trop.status === 400, `statut ${trop.status}`);
check(
  'et le message dit ce qui manque',
  /Permis de conduire/.test((await j(trop))?.error || ''),
  (await j(trop))?.error
);

titre('Un refus sans motif est refusé aussi');
const permis = (vue?.documents || []).find((piece) => piece.type === 'license');
const sansMotif = await patch(
  `/api/superowner/drivers/${enAttente.id}/documents/${permis.id}`,
  { approuve: false },
  TP
);
check('on exige un motif', sansMotif.status === 400, `statut ${sansMotif.status}`);

titre('Les pièces sont examinées une à une');
for (const piece of vue.documents) {
  await patch(
    `/api/superowner/drivers/${enAttente.id}/documents/${piece.id}`,
    { approuve: true },
    TP
  );
}

const apres = await j(await get(`/api/superowner/drivers/${enAttente.id}`, TP));
check('le dossier devient complet', apres?.dossierComplet === true, JSON.stringify(apres?.piecesManquantes));

titre('Puis le livreur est validé');
const validation = await post(`/api/superowner/drivers/${enAttente.id}/approve`, {}, TP);
check('la validation passe', validation.status === 200, `statut ${validation.status}`);

const etatApres = await sqlScalaire(`SELECT status FROM "Driver" WHERE email = 'd-${uniq}@t.fr'`);
check('il est actif', etatApres === 'ACTIVE', etatApres);

const dateValidation = await sqlScalaire(`SELECT "approvedAt" FROM "Driver" WHERE email = 'd-${uniq}@t.fr'`);
check('la date de validation est gardée', dateValidation !== '', dateValidation);

const prevenu = await sqlScalaire(
  `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = 'd-${uniq}@t.fr' AND title LIKE '%validé%'`
);
check('le livreur est prévenu', Number(prevenu) >= 1, prevenu);

titre('Maintenant il roule');
const enLigneApres = await patch('/api/drivers/availability', { isOnline: true }, D);
check('il se met en ligne', enLigneApres.status < 400, `statut ${enLigneApres.status}`);

await patch('/api/drivers/location', { latitude: 45.764, longitude: 4.8357 }, D);
const rechercheApres = await j(await post(`/api/orders/${orderId}/dispatch`, {}, T));
check('et la course lui est proposée', rechercheApres?.data?.propose === true, JSON.stringify(rechercheApres?.data));

// ===== Écarter, puis rétablir =====

titre('La plateforme peut le suspendre');
const suspension = await post(
  `/api/superowner/drivers/${enAttente.id}/reject`,
  { etat: 'SUSPENDED', raison: 'Assurance expirée' },
  TP
);
check('la suspension passe', suspension.status === 200, `statut ${suspension.status}`);

const suspendu = await sqlScalaire(`SELECT status FROM "Driver" WHERE email = 'd-${uniq}@t.fr'`);
check('il est suspendu', suspendu === 'SUSPENDED', suspendu);

// Un suspendu qui reste « en ligne » dans les listes est trompeur.
const encoreEnLigne = await sqlScalaire(
  `SELECT "isOnline" FROM "Driver" WHERE email = 'd-${uniq}@t.fr'`
);
check('et hors ligne', encoreEnLigne === 'false', encoreEnLigne);

const motif = await sqlScalaire(`SELECT "statusReason" FROM "Driver" WHERE email = 'd-${uniq}@t.fr'`);
check('le motif est conservé', motif === 'Assurance expirée', motif);

const retour = await patch('/api/drivers/availability', { isOnline: true }, D);
check('il ne peut plus se remettre en ligne', retour.status === 403, `statut ${retour.status}`);
check(
  'et le motif lui est dit',
  /Assurance expirée/.test((await j(retour))?.error || ''),
  (await j(retour))?.error
);

titre('Puis le rétablir');
const retabli = await post(`/api/superowner/drivers/${enAttente.id}/reactivate`, {}, TP);
check('le rétablissement passe', retabli.status === 200, `statut ${retabli.status}`);
check(
  'il est de nouveau actif',
  (await sqlScalaire(`SELECT status FROM "Driver" WHERE email = 'd-${uniq}@t.fr'`)) === 'ACTIVE',
  'état inattendu'
);

titre('Un dossier jamais validé ne se « rétablit » pas');
const autre = await j(
  await post('/api/drivers/register', { conditionsAcceptees: true,
    name: `Sami ${uniq}`,
    email: `d2-${uniq}@t.fr`,
    password: MDP,
    phone: '0622222222',
    vehicleType: 'bike',
  })
);
const listeBis = await j(await get('/api/superowner/drivers?status=PENDING', TP));
const jamaisValide = (listeBis?.drivers || []).find((l) => l.email === `d2-${uniq}@t.fr`);

const abusif = await post(`/api/superowner/drivers/${jamaisValide.id}/reactivate`, {}, TP);
check('le raccourci est refusé', abusif.status === 400, `statut ${abusif.status}`);
check(
  'et renvoie vers la validation',
  /validation/i.test((await j(abusif))?.error || ''),
  (await j(abusif))?.error
);

titre('À vélo, on n’exige ni permis ni carte grise');
check(
  'une seule pièce est attendue',
  jamaisValide?.piecesAttendues === 1,
  `${jamaisValide?.piecesAttendues}`
);

await terminer();
