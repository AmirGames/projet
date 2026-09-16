// Attribution automatique des courses : position du livreur, proposition au
// plus proche, refus, expiration, rémunération.

import {
  titre,
  check,
  j,
  uniq,
  post,
  get,
  patch,
  sqlScalaire,
  sqlExec,
  terminer,
  validerLivreur,
} from './outils.mjs';

// Lyon : la boutique au centre, les livreurs à des distances croissantes.
const BOUTIQUE = { latitude: 45.764, longitude: 4.8357 };
const PRES = { latitude: 45.766, longitude: 4.838 };   // ~300 m
const LOIN = { latitude: 45.79, longitude: 4.87 };     // ~4 km
const TRES_LOIN = { latitude: 45.95, longitude: 5.3 };  // ~40 km, hors rayon

const plateforme = await j(
  await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` })
);
const S = plateforme.accessToken;

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;
const orgId = commercant.organization.id;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId,
      name: `Pizza ${uniq}`,
      slug: `pizza-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
      latitude: BOUTIQUE.latitude,
      longitude: BOUTIQUE.longitude,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post('/api/products', { storeId, name: 'Margherita', price: 12, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

// La boutique doit porter ses coordonnées : sans elles, aucune recherche de
// livreur n'est possible.
const coordonnees = await sqlScalaire(`SELECT latitude FROM "Store" WHERE id = '${storeId}'`);
check('la boutique a des coordonnées', coordonnees.startsWith('45.76'), coordonnees);

// ===== Les livreurs =====

async function creerLivreur(prefixe, position, enLigne = true) {
  const compte = await j(
    await post('/api/drivers/register', {
      name: `${prefixe} ${uniq}`,
      email: `${prefixe}-${uniq}@t.fr`,
      password: 'Password123!',
      phone: '0611111111',
      vehicleType: 'scooter',
      vehiclePlate: 'AB-123-CD',
    })
  );

  const jeton = compte.accessToken;

  // Un livreur s'inscrit en attente de validation : tant qu'il n'est pas
  // validé, il ne peut pas se mettre en ligne et l'attribution l'ignore.
  await validerLivreur(jeton, S);

  if (enLigne) {
    await patch('/api/drivers/availability', { isAvailable: true, isOnline: true }, jeton);
  }

  if (position) {
    await patch('/api/drivers/location', position, jeton);
  }

  return { jeton, email: `${prefixe}-${uniq}@t.fr` };
}

titre('Position du livreur');
const pres = await creerLivreur('pres', PRES);
const positionEnBase = await sqlScalaire(
  `SELECT latitude FROM "Driver" WHERE email = 'pres-${uniq}@t.fr'`
);
check('la position est enregistrée', positionEnBase.startsWith('45.766'), positionEnBase);

const horodatage = await sqlScalaire(
  `SELECT "lastLocationUpdate" IS NOT NULL FROM "Driver" WHERE email = 'pres-${uniq}@t.fr'`
);
check('elle est horodatée', horodatage === 'true', horodatage);

const positionInvalide = await patch('/api/drivers/location', { latitude: 200, longitude: 0 }, pres.jeton);
check('une latitude impossible est refusée', positionInvalide.status === 400, `statut=${positionInvalide.status}`);

const loin = await creerLivreur('loin', LOIN);
const tresLoin = await creerLivreur('tresloin', TRES_LOIN);
const horsLigne = await creerLivreur('horsligne', PRES, false);

// ===== La commande =====

const commande = await j(
  await post('/api/orders', {
    storeId,
    customerName: 'Client Test',
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '20 rue de la Ré',
    deliveryCity: 'Lyon',
    deliveryPostal: '69002',
    totalAmount: 12,
    feesAmount: 0,
    items: [{ productId, quantity: 1, price: 12 }],
  })
);
const orderId = commande.order?.id || commande.id;
check('commande créée', !!orderId, JSON.stringify(commande)?.slice(0, 150));

titre('Recherche d\'un livreur');
const recherche = await j(await post(`/api/orders/${orderId}/dispatch`, {}, T));
check('une course est créée', !!recherche?.data?.deliveryId, JSON.stringify(recherche));
check('elle est proposée', recherche?.data?.propose === true, JSON.stringify(recherche?.data));

const deliveryId = recherche.data.deliveryId;

titre('C\'est le plus proche qui reçoit');
const vuePres = await j(await get('/api/drivers/offers', pres.jeton));
const vueLoin = await j(await get('/api/drivers/offers', loin.jeton));
const vueTresLoin = await j(await get('/api/drivers/offers', tresLoin.jeton));
const vueHorsLigne = await j(await get('/api/drivers/offers', horsLigne.jeton));

check('le plus proche a la proposition', (vuePres?.data || []).length === 1, `n=${vuePres?.data?.length}`);
check('le plus éloigné n\'a rien', (vueLoin?.data || []).length === 0, `n=${vueLoin?.data?.length}`);
check('celui hors rayon n\'a rien', (vueTresLoin?.data || []).length === 0, `n=${vueTresLoin?.data?.length}`);
check('celui hors ligne n\'a rien', (vueHorsLigne?.data || []).length === 0, `n=${vueHorsLigne?.data?.length}`);

const proposition = vuePres.data[0];
check('la distance est annoncée', proposition.distanceKm > 0 && proposition.distanceKm < 1, `=${proposition.distanceKm}`);
check('la rémunération est annoncée', proposition.payout > 0, `=${proposition.payout}`);
check('la boutique est nommée', proposition.boutique?.name?.includes('Pizza'), JSON.stringify(proposition.boutique));
check('l\'adresse de livraison est donnée', proposition.adresse === '20 rue de la Ré', proposition.adresse);

// Base : 2,50 € + 0,80 €/km. Une course de ~300 m tourne autour de 2,75 €.
check(
  'le montant suit le barème (base + distance)',
  Math.abs(proposition.payout - (2.5 + proposition.distanceKm * 0.8)) < 0.02,
  `payout=${proposition.payout} distance=${proposition.distanceKm}`
);

titre('Un refus passe au suivant');
const refus = await j(await post(`/api/drivers/offers/${proposition.id}/decline`, null, pres.jeton));
check('le refus est accepté', refus?.success === true, JSON.stringify(refus));
check('la course est reproposée', refus?.reproposee === true, JSON.stringify(refus));

const apresRefusPres = await j(await get('/api/drivers/offers', pres.jeton));
const apresRefusLoin = await j(await get('/api/drivers/offers', loin.jeton));
check('celui qui a refusé n\'est pas resollicité', (apresRefusPres?.data || []).length === 0, `n=${apresRefusPres?.data?.length}`);
check('le suivant reçoit la course', (apresRefusLoin?.data || []).length === 1, `n=${apresRefusLoin?.data?.length}`);

const propositionLoin = apresRefusLoin.data[0];
check(
  'sa rémunération tient compte de sa distance',
  propositionLoin.payout > proposition.payout,
  `loin=${propositionLoin.payout} pres=${proposition.payout}`
);

titre('Acceptation');
const autre = await post(`/api/drivers/offers/${propositionLoin.id}/accept`, null, pres.jeton);
check('un autre livreur ne peut pas accepter', autre.status === 404, `statut=${autre.status}`);

const acceptation = await j(await post(`/api/drivers/offers/${propositionLoin.id}/accept`, null, loin.jeton));
check('la course est acceptée', acceptation?.success === true, JSON.stringify(acceptation)?.slice(0, 150));

const attribue = await sqlScalaire(`SELECT "driverId" IS NOT NULL FROM "OrderDelivery" WHERE id = '${deliveryId}'`);
check('la course a un livreur', attribue === 'true', attribue);

const statutCourse = await sqlScalaire(`SELECT status FROM "OrderDelivery" WHERE id = '${deliveryId}'`);
check('son statut passe à ACCEPTED', statutCourse === 'ACCEPTED', statutCourse);

const remunerationFigee = await sqlScalaire(
  `SELECT "driverPayout" FROM "OrderDelivery" WHERE id = '${deliveryId}'`
);
check(
  'la rémunération est figée à l\'attribution',
  Math.abs(Number(remunerationFigee) - propositionLoin.payout) < 0.01,
  `base=${remunerationFigee} proposée=${propositionLoin.payout}`
);

const occupe = await sqlScalaire(
  `SELECT "isAvailable" FROM "Driver" WHERE email = 'loin-${uniq}@t.fr'`
);
check('le livreur est marqué occupé', occupe === 'false', occupe);

const rejeu = await post(`/api/drivers/offers/${propositionLoin.id}/accept`, null, loin.jeton);
check('accepter deux fois est refusé', rejeu.status === 409, `statut=${rejeu.status}`);

titre('Une course attribuée ne repart pas');
const secondeRecherche = await j(await post(`/api/orders/${orderId}/dispatch`, {}, T));
check('la relance ne reproposera rien', secondeRecherche?.data?.propose === false, JSON.stringify(secondeRecherche?.data));

titre('Position pendant la course');
const suivi = await j(await patch('/api/drivers/location', { latitude: 45.77, longitude: 4.84 }, loin.jeton));
check('la position est rattachée à la course', suivi?.suivie === true, JSON.stringify(suivi));

const positionCourse = await sqlScalaire(
  `SELECT "driverLat" FROM "OrderDelivery" WHERE id = '${deliveryId}'`
);
check('elle est enregistrée sur la course', positionCourse.startsWith('45.77'), positionCourse);

// Le défaut corrigé : la position écrasait l'adresse du client.
const adresseClient = await sqlScalaire(
  `SELECT "deliveryLat" IS NULL FROM "OrderDelivery" WHERE id = '${deliveryId}'`
);
check(
  'elle n\'écrase pas l\'adresse de livraison du client',
  adresseClient === 'true',
  `deliveryLat vaut ${adresseClient === 'true' ? 'NULL' : 'la position du livreur'}`
);

titre('Livraison et rémunération');
await patch(`/api/drivers/deliveries/${deliveryId}`, { status: 'PICKED_UP' }, loin.jeton);
const livraison = await patch(`/api/drivers/deliveries/${deliveryId}`, { status: 'DELIVERED' }, loin.jeton);
check('la course est livrée', livraison.status === 200, `statut=${livraison.status}`);

const gains = await sqlScalaire(`SELECT "totalEarnings" FROM "Driver" WHERE email = 'loin-${uniq}@t.fr'`);
check(
  'le livreur est payé le montant annoncé',
  Math.abs(Number(gains) - propositionLoin.payout) < 0.01,
  `gains=${gains} annoncé=${propositionLoin.payout}`
);

const courses = await sqlScalaire(`SELECT "totalDeliveries" FROM "Driver" WHERE email = 'loin-${uniq}@t.fr'`);
check('son compteur de courses augmente', courses === '1', courses);

const redevenuLibre = await sqlScalaire(
  `SELECT "isAvailable" FROM "Driver" WHERE email = 'loin-${uniq}@t.fr'`
);
check('il redevient disponible', redevenuLibre === 'true', redevenuLibre);

titre('Expiration d\'une proposition');
// Une deuxième commande, proposée puis laissée sans réponse.
const commande2 = await j(
  await post('/api/orders', {
    storeId,
    customerName: 'Client Deux',
    customerEmail: `c2-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '5 rue Victor Hugo',
    deliveryCity: 'Lyon',
    deliveryPostal: '69002',
    totalAmount: 20,
    items: [{ productId, quantity: 1, price: 20 }],
  })
);
const orderId2 = commande2.order?.id || commande2.id;

const recherche2 = await j(await post(`/api/orders/${orderId2}/dispatch`, {}, T));
const deliveryId2 = recherche2.data.deliveryId;
check('la deuxième course est proposée', recherche2?.data?.propose === true, JSON.stringify(recherche2?.data));

// On avance l'échéance plutôt que d'attendre trente secondes.
await sqlExec(
  `UPDATE "DeliveryOffer" SET "expiresAt" = NOW() - INTERVAL '1 minute'
   WHERE "deliveryId" = '${deliveryId2}' AND status = 'PENDING'`
);

const destinataireInitial = await sqlScalaire(
  `SELECT d.email FROM "DeliveryOffer" o JOIN "Driver" d ON d.id = o."driverId"
   WHERE o."deliveryId" = '${deliveryId2}' ORDER BY o."offeredAt" DESC LIMIT 1`
);

// Le balayage tourne toutes les cinq secondes côté serveur.
await new Promise((r) => setTimeout(r, 7000));

const expiree = await sqlScalaire(
  `SELECT count(*) FROM "DeliveryOffer" WHERE "deliveryId" = '${deliveryId2}' AND status = 'EXPIRED'`
);
check('la proposition sans réponse expire', expiree === '1', expiree);

const nouvelleProposition = await sqlScalaire(
  `SELECT d.email FROM "DeliveryOffer" o JOIN "Driver" d ON d.id = o."driverId"
   WHERE o."deliveryId" = '${deliveryId2}' AND o.status = 'PENDING' LIMIT 1`
);
check(
  'la course repart vers un autre livreur',
  nouvelleProposition !== '' && nouvelleProposition !== destinataireInitial,
  `initial=${destinataireInitial} suivant=${nouvelleProposition || '(aucun)'}`
);

titre('Commande à emporter');
const emporter = await j(
  await post('/api/orders', {
    storeId,
    customerName: 'Client Trois',
    customerEmail: `c3-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 10,
    items: [{ productId, quantity: 1, price: 10 }],
  })
);
const sansLivraison = await post(`/api/orders/${emporter.order?.id || emporter.id}/dispatch`, {}, T);
check(
  'une commande à emporter n\'a pas de course',
  sansLivraison.status === 400,
  `statut=${sansLivraison.status}`
);

await terminer();
