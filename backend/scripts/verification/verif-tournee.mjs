// Plusieurs courses pour un même livreur : un lot proposé d'un coup, une
// course ajoutée sur le trajet, trois au plus, et le livreur libéré seulement
// à la dernière remise.

import {
  inscription,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  patch,
  put,
  sqlScalaire,
  terminer,
  validerLivreur,
  codeDeRemise,
} from './outils.mjs';

// Bordeaux : loin des autres suites (Lyon), dont les livreurs restent en ligne.
const COMMERCE_A = { latitude: 44.8378, longitude: -0.5792 };
const COMMERCE_B = { latitude: 44.842, longitude: -0.574 }; // ~600 m, sur le trajet
const CLIENT_1 = { latitude: 44.85, longitude: -0.57 }; // ~1,5 km du commerce
const CLIENT_2 = { latitude: 44.851, longitude: -0.568 }; // ~200 m du client 1
const CLIENT_3 = { latitude: 44.849, longitude: -0.572 };
const CLIENT_4 = { latitude: 44.8505, longitude: -0.5695 };
const CLIENT_LOIN = { latitude: 44.8, longitude: -0.62 }; // ~5 km, à l'opposé

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` })
);
const S = plateforme.accessToken;
const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;
const orgId = commercant.organization.id;

async function creerBoutique(nom, point) {
  const b = await j(
    await post(
      '/api/stores',
      {
        orgId,
        name: `${nom} ${uniq}`,
        slug: `${nom.toLowerCase()}-${uniq}`,
        address: '1 place de la Bourse',
        city: 'Bordeaux',
        postalCode: '33000',
        phone: '0500000000',
        latitude: point.latitude,
        longitude: point.longitude,
      },
      T
    )
  );
  const storeId = b.store?.id || b.id;
  const p = await j(await post('/api/products', { storeId, name: 'Plat', price: 12, status: 'ACTIVE' }, T));
  return { storeId, productId: p.product?.id || p.id };
}

// Une seule boutique par formule d'essai : la seconde vient d'un autre commerçant.
const boutiqueA = await creerBoutique('Resto', COMMERCE_A);
const commercantB = await j(
  await inscription({ email: `mb-${uniq}@t.fr`, password: 'Password123!', name: `MB ${uniq}` })
);
const TB = commercantB.accessToken;
const bB = await j(
  await post(
    '/api/stores',
    {
      orgId: commercantB.organization.id,
      name: `Boulangerie ${uniq}`,
      slug: `boulangerie-${uniq}`,
      address: '3 cours de l’Intendance',
      city: 'Bordeaux',
      postalCode: '33000',
      phone: '0500000001',
      latitude: COMMERCE_B.latitude,
      longitude: COMMERCE_B.longitude,
    },
    TB
  )
);
const boutiqueB = { storeId: bB.store?.id || bB.id };
boutiqueB.productId = (
  await j(await post('/api/products', { storeId: boutiqueB.storeId, name: 'Pain', price: 12, status: 'ACTIVE' }, TB))
).product?.id;

let n = 0;
async function commander(boutique, client, jeton = T) {
  n += 1;
  const c = await j(
    await post('/api/orders', {
      conditionsAcceptees: true,
      storeId: boutique.storeId,
      customerName: `Client ${n}`,
      customerEmail: `c${n}-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'DELIVERY',
      deliveryAddress: `${n} rue Sainte-Catherine`,
      deliveryCity: 'Bordeaux',
      deliveryPostal: '33000',
      deliveryLat: client.latitude,
      deliveryLng: client.longitude,
      totalAmount: 12,
      feesAmount: 4,
      items: [{ productId: boutique.productId, quantity: 1, price: 12 }],
    })
  );
  const orderId = c.order?.id || c.id;
  if (!orderId) throw new Error(`Commande refusée : ${JSON.stringify(c).slice(0, 300)}`);
  // Le commerçant l'accepte (préparation longue : la recherche ne part pas
  // d'elle-même), puis on lance la recherche comme le fait son bouton.
  await post(`/api/order-management/${boutique.storeId}/${orderId}/accept`, { preparationMinutes: 45 }, jeton);
  const recherche = await j(await post(`/api/orders/${orderId}/dispatch`, {}, jeton));
  return { orderId, deliveryId: recherche?.data?.deliveryId, propose: recherche?.data?.propose, jeton };
}

async function creerLivreur(prefixe, position) {
  const compte = await j(
    await post('/api/drivers/register', {
      conditionsAcceptees: true,
      name: `${prefixe} ${uniq}`,
      email: `${prefixe}-${uniq}@t.fr`,
      password: 'Password123!',
      phone: '0611111111',
      vehicleType: 'scooter',
      vehiclePlate: 'AB-123-CD',
    })
  );
  await validerLivreur(compte.accessToken, S);
  return { jeton: compte.accessToken, email: `${prefixe}-${uniq}@t.fr`, position };
}
async function mettreEnLigne(livreur) {
  await patch('/api/drivers/availability', { isOnline: true }, livreur.jeton);
  await patch('/api/drivers/location', livreur.position, livreur.jeton);
}
const offresDe = async (livreur) => (await j(await get('/api/drivers/offers', livreur.jeton)))?.data || [];
const champ = (sql) => sqlScalaire(sql);

// ===== Un lot : deux commandes qui attendent, au même endroit =====

titre('Deux commandes du même commerce pour la même rue partent ensemble');
const un = await creerLivreur('un', COMMERCE_A);
const deux = await creerLivreur('deux', COMMERCE_A);
const c1 = await commander(boutiqueA, CLIENT_1);
const c2 = await commander(boutiqueA, CLIENT_2);
check('sans livreur, rien n’est proposé', c1.propose === false && c2.propose === false, JSON.stringify([c1, c2]));

await mettreEnLigne(un);
await post(`/api/orders/${c1.orderId}/dispatch`, {}, T);
let offres = await offresDe(un);
check('le livreur reçoit les deux courses', offres.length === 2, JSON.stringify(offres.map((o) => o.deliveryId)));
check(
  'en un seul lot',
  offres.length === 2 && offres[0].batchId && offres[0].batchId === offres[1].batchId,
  JSON.stringify(offres.map((o) => o.batchId))
);

titre('Refuser une course du lot refuse le lot');
const refus = await post(`/api/drivers/offers/${offres[0].id}/decline`, null, un.jeton);
check('le refus passe', refus.status === 200, `statut ${refus.status}`);
const refusees = await champ(
  `SELECT count(*) FROM "DeliveryOffer" o JOIN "Driver" d ON d.id = o."driverId"
   WHERE d.email = '${un.email}' AND o.status = 'DECLINED'`
);
check('les deux propositions sont refusées', refusees === '2', refusees);

titre('Accepter une course du lot prend tout le lot');
await mettreEnLigne(deux);
await post(`/api/orders/${c1.orderId}/dispatch`, {}, T);
offres = await offresDe(deux);
check('le lot repart vers le livreur suivant', offres.length === 2, JSON.stringify(offres.map((o) => o.deliveryId)));
const acceptation = await j(await post(`/api/drivers/offers/${offres[0].id}/accept`, null, deux.jeton));
check('l’acceptation passe', acceptation?.success === true, JSON.stringify(acceptation)?.slice(0, 200));
check('elle porte sur les deux courses', acceptation?.data?.lot?.length === 2, JSON.stringify(acceptation?.data?.lot));
const aDeux = await champ(
  `SELECT count(*) FROM "OrderDelivery" od JOIN "Driver" d ON d.id = od."driverId"
   WHERE d.email = '${deux.email}' AND od.status = 'ACCEPTED'`
);
check('les deux courses sont à lui', aDeux === '2', aDeux);
check(
  'il est marqué occupé',
  (await champ(`SELECT "isAvailable" FROM "Driver" WHERE email = '${deux.email}'`)) === 'false'
);

// ===== Une course ajoutée sur le trajet =====

titre('Une commande d’un commerce sur le trajet s’ajoute à la tournée');
// Le livreur « un » est libre, au commerce : la course va pourtant à celui
// qui passe déjà par là.
const c3 = await commander(boutiqueB, CLIENT_3, TB);
offres = await offresDe(deux);
check('elle est proposée au livreur en tournée', offres.length === 1 && offres[0].deliveryId === c3.deliveryId,
  JSON.stringify(offres.map((o) => o.deliveryId)));
check('comme un ajout', offres[0]?.ajout === true, JSON.stringify(offres[0]));
check('le livreur libre ne la reçoit pas', (await offresDe(un)).length === 0);
const ajout = await post(`/api/drivers/offers/${offres[0]?.id}/accept`, null, deux.jeton);
check('l’ajout est accepté', ajout.status === 200, `statut ${ajout.status}`);

titre('Trois courses au plus');
const c4 = await commander(boutiqueA, CLIENT_4);
offres = await offresDe(deux);
check('la quatrième ne lui est pas proposée', offres.length === 0, JSON.stringify(offres));
const pourUn = await offresDe(un);
check(
  'elle va au livreur libre, en course simple',
  pourUn.length === 1 && pourUn[0].deliveryId === c4.deliveryId && !pourUn[0].ajout && !pourUn[0].batchId,
  JSON.stringify(pourUn)
);
await post(`/api/drivers/offers/${pourUn[0]?.id}/accept`, null, un.jeton);

titre('Un client trop loin ne s’ajoute pas');
const c5 = await commander(boutiqueA, CLIENT_LOIN);
check('rien n’est proposé au livreur en course', (await offresDe(un)).length === 0);
check('la course attend un livreur libre', c5.propose === false, JSON.stringify(c5));

// ===== La tournée =====

titre('Les arrêts de la tournée, dans l’ordre');
const tournee = (await j(await get('/api/drivers/tournee', deux.jeton)))?.data;
const arrets = tournee?.arrets || [];
check('six arrêts : trois retraits, trois remises', arrets.length === 6, JSON.stringify(arrets.map((a) => a.type)));
const retraitAvantRemise = arrets.every(
  (a, i) => a.type === 'RETRAIT' || arrets.slice(0, i).some((b) => b.deliveryId === a.deliveryId && b.type === 'RETRAIT')
);
check('chaque commande est prise avant d’être remise', retraitAvantRemise, JSON.stringify(arrets.map((a) => `${a.type}:${a.deliveryId.slice(-4)}`)));
check('la longueur de la tournée est donnée', typeof tournee?.km === 'number' && tournee.km > 0, JSON.stringify(tournee?.km));

titre('Chaque client suit le livreur');
await patch('/api/drivers/location', { latitude: 44.845, longitude: -0.573 }, deux.jeton);
const suivies = await champ(
  `SELECT count(*) FROM "OrderDelivery" WHERE id IN ('${c1.deliveryId}','${c2.deliveryId}','${c3.deliveryId}')
   AND "driverLat" BETWEEN 44.8449 AND 44.8451`
);
check('la position arrive sur les trois courses', suivies === '3', suivies);

// ===== Le livreur libéré à la dernière remise =====

titre('Une remise ne libère pas un livreur qui a encore des courses');
async function livrer(course, livreur, jeton) {
  // Déjà acceptée : il reste à la passer en préparation, puis prête.
  for (const status of ['PREPARING', 'READY']) {
    await patch(`/api/order-management/${course.storeId}/${course.orderId}/status`, { status }, jeton);
  }
  await patch(`/api/drivers/deliveries/${course.deliveryId}`, { status: 'PICKED_UP' }, livreur.jeton);
  return patch(
    `/api/drivers/deliveries/${course.deliveryId}`,
    { status: 'DELIVERED', code: await codeDeRemise(course.deliveryId) },
    livreur.jeton
  );
}
const premiere = await livrer({ ...c1, storeId: boutiqueA.storeId }, deux, T);
check('la première remise passe', premiere.status === 200, `statut ${premiere.status}`);
check(
  'il reste occupé',
  (await champ(`SELECT "isAvailable" FROM "Driver" WHERE email = '${deux.email}'`)) === 'false'
);
const courante = await champ(`SELECT "currentOrderId" FROM "Driver" WHERE email = '${deux.email}'`);
check('sa course en cours est une de celles qui restent', [c2.deliveryId, c3.deliveryId].includes(courante), courante);

titre('Annuler une course de la tournée garde les autres');
const annulation = await patch(`/api/drivers/deliveries/${c2.deliveryId}/cancel`, { reason: 'Problème véhicule' }, deux.jeton);
check('l’annulation passe', annulation.status === 200, `statut ${annulation.status}`);
check(
  'il reste occupé',
  (await champ(`SELECT "isAvailable" FROM "Driver" WHERE email = '${deux.email}'`)) === 'false'
);

titre('La dernière remise le libère');
const derniere = await livrer({ ...c3, storeId: boutiqueB.storeId }, deux, TB);
check('la dernière remise passe', derniere.status === 200, `statut ${derniere.status}`);
check(
  'il redevient disponible',
  (await champ(`SELECT "isAvailable" FROM "Driver" WHERE email = '${deux.email}'`)) === 'true'
);
check(
  'sans course en cours',
  (await champ(`SELECT "currentOrderId" IS NULL FROM "Driver" WHERE email = '${deux.email}'`)) === 'true'
);
const gains = await champ(`SELECT "totalEarnings" FROM "Driver" WHERE email = '${deux.email}'`);
const annonce = await champ(
  `SELECT sum("driverPayout") FROM "OrderDelivery" WHERE id IN ('${c1.deliveryId}','${c3.deliveryId}')`
);
check('chaque course livrée est payée ce qui était annoncé', Math.abs(Number(gains) - Number(annonce)) < 0.01, `${gains} / ${annonce}`);

// ===== Les règles se règlent dans l'espace plateforme =====

titre('La plateforme règle la tournée');
const regler = (corps) => put('/api/superowner/system-config', corps, S);
check('zéro course par livreur est refusé', (await regler({ driverMaxCourses: 0 })).status === 400);
check('six courses par livreur est refusé', (await regler({ driverMaxCourses: 6 })).status === 400);
check('un commerçant ne peut pas les changer', (await put('/api/superowner/system-config', { driverMaxCourses: 5 }, T)).status === 403);
const lu = (await j(await get('/api/superowner/system-config', S)))?.config;
check(
  'les réglages se lisent',
  lu?.driverMaxCourses === 3 && lu?.driverGroupClientKm === 2 && lu?.driverGroupDetourKm === 2,
  JSON.stringify({ max: lu?.driverMaxCourses, clients: lu?.driverGroupClientKm, detour: lu?.driverGroupDetourKm })
);

titre('Une course à la fois : plus de regroupement');
check('le réglage passe', (await regler({ driverMaxCourses: 1 })).status === 200);
const moi = (await j(await get('/api/drivers/me', un.jeton)))?.data;
check('le livreur connaît la limite', moi?.maxCourses === 1, JSON.stringify(moi?.maxCourses));
const c6 = await commander(boutiqueA, CLIENT_4);
const pourUnSeul = await offresDe(un);
check('le livreur en course ne reçoit rien', pourUnSeul.length === 0, JSON.stringify(pourUnSeul.map((o) => o.deliveryId)));
check('la course part à un livreur libre', c6.propose === true, JSON.stringify(c6.propose));

titre('Des clients plus proches exigés, sans détour');
await regler({ driverMaxCourses: 3, driverGroupClientKm: 0.1, driverGroupDetourKm: 0 });
// Même commerce que la course du livreur, client à ~150 m du sien : trop loin
// avec 100 m exigés, et sans détour permis.
const c7 = await commander(boutiqueA, { latitude: 44.8518, longitude: -0.5695 });
const pourUnSerre = await offresDe(un);
check('elle ne s’ajoute plus', !pourUnSerre.some((o) => o.deliveryId === c7.deliveryId), JSON.stringify(pourUnSerre));

// Les autres suites comptent sur les valeurs d'origine.
await regler({ driverMaxCourses: 3, driverGroupClientKm: 2, driverGroupDetourKm: 2 });

await terminer();
