// Une course acceptée reste surveillée : le livreur qui ne vient pas la perd,
// la livraison qui traîne alerte la plateforme, qui peut trancher.
//
// Le temps ne s'attend pas : on vieillit l'attribution ou la récupération en
// base, puis on laisse la surveillance de l'API (toutes les 30 s) faire son
// travail, comme en production.

import {
  inscription,
  declarerPrete,
  ouvrirBoutiqueLivrante,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  patch,
  terminer,
  sqlScalaire,
  sqlExec,
  validerLivreur,
} from './outils.mjs';

const MDP = 'Password123!';
const COMMERCE = { latitude: 45.764, longitude: 4.8357 };
// 3 km au sud du commerce : loin, mais dans le rayon d'attribution.
const LOIN = { latitude: 45.737, longitude: 4.8357 };

const plateforme = await j(await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` }));
const TP = plateforme.accessToken;

const commercant = await j(await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` }));
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
      ...COMMERCE,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;
await ouvrirBoutiqueLivrante(storeId, commercant.organization.id, COMMERCE);

const produit = await j(await post('/api/products', { storeId, name: `Plat ${uniq}`, price: 15, status: 'ACTIVE' }, T));
const productId = produit.product?.id || produit.id;

async function nouveauLivreur(prenom, position) {
  const livreur = await j(
    await post('/api/drivers/register', {
      conditionsAcceptees: true,
      name: `${prenom} ${uniq}`,
      email: `${prenom.toLowerCase()}-${uniq}@t.fr`,
      password: MDP,
      phone: '0611111111',
      vehicleType: 'scooter',
      vehiclePlate: 'AB-123-CD',
    })
  );
  const D = livreur.accessToken;
  await validerLivreur(D, TP);
  await patch('/api/drivers/availability', { isOnline: true }, D);
  await patch('/api/drivers/location', position, D);
  return D;
}

async function commander() {
  const commande = await j(
    await post('/api/orders', {
      conditionsAcceptees: true,
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
      feesAmount: 3,
      items: [{ productId, quantity: 1, price: 15 }],
    })
  );
  const orderId = commande.order?.id || commande.id;
  const attribution = await j(await post(`/api/orders/${orderId}/dispatch`, {}, T));
  return { orderId, courseId: attribution?.data?.deliveryId };
}

/** Attend qu'une condition en base soit vraie : la surveillance passe toutes les 30 s. */
async function attendre(requeteSql, attendu, delaiMs = 45000) {
  const fin = Date.now() + delaiMs;
  let valeur = '';
  while (Date.now() < fin) {
    valeur = await sqlScalaire(requeteSql);
    if (valeur === attendu) return valeur;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return valeur;
}

const incidents = async (etat = 'tous') => (await j(await get(`/api/superowner/delivery-incidents?etat=${etat}`, TP)))?.data || [];

// ===== Le livreur qui ne vient pas perd la course =====

titre('Livreur qui ne vient pas au commerce');
const A = await nouveauLivreur('Alain', COMMERCE);
const course1 = await commander();
const acceptee = await patch(`/api/drivers/deliveries/${course1.courseId}/accept`, null, A);
check('le livreur A accepte la course', acceptee.status === 200, `statut ${acceptee.status}`);
await declarerPrete(storeId, course1.orderId, T);

// Il part dans l'autre sens, et l'attribution date d'il y a 31 minutes.
await patch('/api/drivers/location', LOIN, A);
await sqlExec(`UPDATE "OrderDelivery" SET "assignedAt" = NOW() - INTERVAL '31 minutes' WHERE id = '${course1.courseId}'`);

// Un autre livreur, tout près, pour reprendre la course.
const B = await nouveauLivreur('Bruno', COMMERCE);

const statut1 = await attendre(`SELECT status FROM "OrderDelivery" WHERE id = '${course1.courseId}'`, 'PENDING');
check('la course est retirée et rendue à la recherche', statut1 === 'PENDING', statut1);
check(
  'le motif est enregistré',
  /Toujours pas au commerce/.test(await sqlScalaire(`SELECT "cancellationReason" FROM "OrderDelivery" WHERE id = '${course1.courseId}'`))
);

const vueA = await get(`/api/drivers/deliveries/${course1.courseId}`, A);
const changeA = await patch(`/api/drivers/deliveries/${course1.courseId}`, { status: 'PICKED_UP' }, A);
check('le livreur A ne peut plus la faire avancer', changeA.status === 403, `GET ${vueA.status}, PATCH ${changeA.status}`);

const historiqueA = await j(await get('/api/drivers/history?filtre=CANCELLED', A));
const ligneA = (historiqueA?.data || []).find((c) => c.id === course1.courseId);
check('elle reste dans son historique, annulée, avec le motif', ligneA?.status === 'CANCELLED' && !!ligneA?.cancellationReason, JSON.stringify(ligneA)?.slice(0, 200));

const offresB = await j(await get('/api/drivers/offers', B));
check(
  'elle est aussitôt proposée au livreur B',
  JSON.stringify(offresB).includes(course1.courseId),
  JSON.stringify(offresB)?.slice(0, 200)
);
const offresA = await j(await get('/api/drivers/offers', A));
check('et plus jamais d’office au livreur A', !JSON.stringify(offresA).includes(course1.courseId));

const liste1 = await incidents();
check(
  'la plateforme voit le retrait',
  liste1.some((i) => i.course.id === course1.courseId && i.type === 'COURSE_RETIREE' && i.closedAt)
);

// ===== La livraison qui traîne alerte, sans rien retirer =====

titre('Livraison en retard, commande dans le sac');
// B refuse la course 1 : elle n'est pas le sujet de la suite.
const offreB = (offresB?.data || []).find((o) => (o.deliveryId || o.delivery?.id) === course1.courseId);
if (offreB?.id) await post(`/api/drivers/offers/${offreB.id}/decline`, {}, B);

const course2 = await commander();
await patch(`/api/drivers/deliveries/${course2.courseId}/accept`, null, B);
await declarerPrete(storeId, course2.orderId, T);
const recuperee = await patch(`/api/drivers/deliveries/${course2.courseId}`, { status: 'PICKED_UP' }, B);
check('le livreur B récupère la commande', recuperee.status === 200, `statut ${recuperee.status}`);
await patch('/api/drivers/location', { latitude: 45.775, longitude: 4.85 }, B);
await sqlExec(`UPDATE "OrderDelivery" SET "pickupTime" = NOW() - INTERVAL '35 minutes' WHERE id = '${course2.courseId}'`);

const alerte = await attendre(
  `SELECT count(*) FROM "DeliveryIncident" WHERE "deliveryId" = '${course2.courseId}' AND type = 'RETARD_LIVRAISON' AND "closedAt" IS NULL`,
  '1'
);
check('un retard de livraison est ouvert pour la plateforme', alerte === '1', alerte);
check(
  'la course reste au livreur, commande dans le sac',
  (await sqlScalaire(`SELECT status FROM "OrderDelivery" WHERE id = '${course2.courseId}'`)) === 'PICKED_UP'
);
check(
  'le client est prévenu',
  Number(await sqlScalaire(`SELECT count(*) FROM "Notification" WHERE "relatedOrderId" = '${course2.orderId}' AND type = 'DELIVERY_LATE'`)) >= 1
);

// Rejouée, la surveillance ne renvoie rien de plus.
await new Promise((r) => setTimeout(r, 32000));
check(
  'pas d’alerte en double au passage suivant',
  (await sqlScalaire(`SELECT count(*) FROM "DeliveryIncident" WHERE "deliveryId" = '${course2.courseId}'`)) === '1'
);

// ===== La plateforme tranche =====

titre('Les gestes de la plateforme');
const interdit = await get('/api/superowner/delivery-incidents', T);
check('un commerçant n’y a pas accès', interdit.status === 403, `statut ${interdit.status}`);

const retrait = await post(`/api/superowner/delivery-incidents/courses/${course2.courseId}/retirer`, { motif: 'Injoignable' }, TP);
check('retirer une commande déjà dans le sac est refusé', retrait.status === 409, `statut ${retrait.status}`);

const echec = await post(`/api/superowner/delivery-incidents/courses/${course2.courseId}/echec`, { motif: 'Livreur injoignable' }, TP);
check('la plateforme déclare la course échouée', echec.status === 200, `statut ${echec.status}`);
check(
  'la course est échouée, par la plateforme',
  (await sqlScalaire(`SELECT status || '/' || "cancelledBy" FROM "OrderDelivery" WHERE id = '${course2.courseId}'`)) === 'FAILED/PLATFORM'
);
check('le retard est refermé', !(await incidents('ouverts')).some((i) => i.course.id === course2.courseId));

const tardive = await patch(`/api/drivers/deliveries/${course2.courseId}`, { status: 'DELIVERED' }, B);
check('le livreur ne peut plus la clore', tardive.status === 409, `statut ${tardive.status}`);
check(
  'le geste est journalisé',
  Number(await sqlScalaire(`SELECT count(*) FROM "SystemAuditLog" WHERE action = 'FAIL_DELIVERY' AND target = '${course2.courseId}'`)) === 1
);

await terminer();
