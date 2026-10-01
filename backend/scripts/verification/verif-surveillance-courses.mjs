// Une course acceptée reste surveillée : le livreur qui ne vient pas la perd,
// la livraison qui traîne alerte la plateforme, qui peut trancher.
//
// Le temps ne s'attend pas : on vieillit l'attribution ou la récupération en
// base, puis on laisse la surveillance de l'API (toutes les 30 s) faire son
// travail, comme en production.

import {
  attenteClientEcoulee,
  codeDeRemise,
  jetonDeSuivi,
  inscription,
  declarerPrete,
  ouvrirBoutiqueLivrante,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  lireSuivi,
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

const suivi1 = await j(await lireSuivi(course1.orderId));
check('le client voit qu’un nouveau livreur prend le relais', suivi1?.retard?.motif === 'NOUVEAU_LIVREUR', JSON.stringify(suivi1?.retard));

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

const suivi2 = await j(await lireSuivi(course2.orderId));
check('le suivi du client affiche le retard', suivi2?.retard?.motif === 'LIVRAISON', JSON.stringify(suivi2?.retard));
check('sans rien dire du livreur ni de sa position', !JSON.stringify(suivi2?.retard ?? {}).includes('km'));

// Personne ne traite : la plateforme est relancée, sans nouveau constat.
await sqlExec(
  `UPDATE "DeliveryIncident" SET "lastAlertAt" = NOW() - INTERVAL '16 minutes' WHERE "deliveryId" = '${course2.courseId}'`
);
const relances = await attendre(
  `SELECT "alertCount" FROM "DeliveryIncident" WHERE "deliveryId" = '${course2.courseId}' AND type = 'RETARD_LIVRAISON'`,
  '2'
);
check('la plateforme est relancée tant que la commande reste dans le sac', relances === '2', `alertes ${relances}`);
check(
  'sans constat en double',
  (await sqlScalaire(`SELECT count(*) FROM "DeliveryIncident" WHERE "deliveryId" = '${course2.courseId}'`)) === '1'
);
check(
  'et la page de la plateforme compte les relances',
  (await incidents('ouverts')).find((i) => i.course.id === course2.courseId)?.alertes === 2
);

// ===== L'attente du client ne couvre que le livreur à la porte =====

titre('Attente du client : devant chez lui, et seulement là');
// La course 1, toujours en recherche, partirait dans le même lot (tournée) :
// elle n'est pas le sujet ici.
await sqlExec(`UPDATE "OrderDelivery" SET status = 'FAILED' WHERE id = '${course1.courseId}'`);
const C = await nouveauLivreur('Chloe', COMMERCE);
const course3 = await commander();
const acceptee3 = await patch(`/api/drivers/deliveries/${course3.courseId}/accept`, null, C);
await declarerPrete(storeId, course3.orderId, T);
const prise3 = await patch(`/api/drivers/deliveries/${course3.courseId}`, { status: 'PICKED_UP' }, C);
check('la livreuse C prend la commande', acceptee3.status === 200 && prise3.status === 200, `${acceptee3.status} ${JSON.stringify(await j(acceptee3))} / ${prise3.status} ${JSON.stringify(await j(prise3))}`);

const deLoin = await post(`/api/drivers/deliveries/${course3.courseId}/attente`, {}, C);
const refus = await j(deLoin);
check(
  'lancée du commerce, l’attente est refusée',
  deLoin.status === 409 && refus?.code === 'NOT_AT_CUSTOMER',
  `statut ${deLoin.status} ${JSON.stringify(refus)}`
);

await patch('/api/drivers/location', { latitude: 45.7801, longitude: 4.8601 }, C);
const aLaPorte = await post(`/api/drivers/deliveries/${course3.courseId}/attente`, {}, C);
check('devant chez le client, elle commence', aLaPorte.status === 200, `statut ${aLaPorte.status} ${JSON.stringify(await j(aLaPorte))}`);

// Il repart avec la commande : l'attente ne le couvre plus.
await patch('/api/drivers/location', LOIN, C);
await sqlExec(`UPDATE "OrderDelivery" SET "driftStartedAt" = NOW() - INTERVAL '6 minutes' WHERE id = '${course3.courseId}'`);
const abandon = await attendre(
  `SELECT count(*) FROM "DeliveryIncident" WHERE "deliveryId" = '${course3.courseId}' AND type = 'ECART_LIVRAISON' AND detail LIKE '%pendant l''attente%'`,
  '1'
);
check('le livreur qui quitte l’adresse pendant l’attente est signalé', abandon === '1', abandon);

// ===== La plateforme tranche =====

titre('Les gestes de la plateforme');
const interdit = await get('/api/superowner/delivery-incidents', T);
check('un commerçant n’y a pas accès', interdit.status === 403, `statut ${interdit.status}`);

const retrait = await post(`/api/superowner/delivery-incidents/courses/${course2.courseId}/retirer`, { motif: 'Injoignable' }, TP);
check('retirer une commande déjà dans le sac est refusé', retrait.status === 409, `statut ${retrait.status}`);

const echec = await post(`/api/superowner/delivery-incidents/courses/${course2.courseId}/echec`, { motif: 'Livreur injoignable' }, TP);
check('la plateforme déclare la course échouée', echec.status === 200, `statut ${echec.status}`);
const bilanEchec = (await j(echec))?.data;
check(
  'sans paiement en ligne, rien à rembourser',
  bilanEchec?.remboursement === 'SANS_PAIEMENT_EN_LIGNE',
  JSON.stringify(bilanEchec)
);
check('le livreur est suspendu d’office', bilanEchec?.suspendu === true);
check(
  'en base aussi, avec le motif',
  /Course échouée/.test(
    await sqlScalaire(`SELECT status || ' ' || "statusReason" FROM "Driver" WHERE id = '${bilanEchec?.driverId}' AND status = 'SUSPENDED'`)
  )
);
check(
  'la course est échouée, par la plateforme',
  (await sqlScalaire(`SELECT status || '/' || "cancelledBy" FROM "OrderDelivery" WHERE id = '${course2.courseId}'`)) === 'FAILED/PLATFORM'
);
check('le retard est refermé', !(await incidents('ouverts')).some((i) => i.course.id === course2.courseId));

const suivi3 = await j(await lireSuivi(course2.orderId));
check('une course close n’affiche plus de retard', suivi3?.retard == null, JSON.stringify(suivi3?.retard));

const tardive = await patch(`/api/drivers/deliveries/${course2.courseId}`, { status: 'DELIVERED' }, B);
check('le livreur ne peut plus la clore', tardive.status === 409, `statut ${tardive.status}`);
check(
  'le geste est journalisé',
  Number(await sqlScalaire(`SELECT count(*) FROM "SystemAuditLog" WHERE action = 'FAIL_DELIVERY' AND target = '${course2.courseId}'`)) === 1
);

// ===== Le dépôt en photo n'est pas un passe-droit =====

titre('Dépôt en photo pendant un incident : paiement suspendu');
// Seule D roule désormais : A se déconnecte, B est suspendu, C est occupée.
await patch('/api/drivers/availability', { isOnline: false }, A);
const D = await nouveauLivreur('Dina', COMMERCE);
const CHEZ_LE_CLIENT = { latitude: 45.7801, longitude: 4.8601 };

async function enRoute(prenom) {
  const course = await commander();
  await patch('/api/drivers/location', COMMERCE, D);
  const ok = await patch(`/api/drivers/deliveries/${course.courseId}/accept`, null, D);
  await declarerPrete(storeId, course.orderId, T);
  const prise = await patch(`/api/drivers/deliveries/${course.courseId}`, { status: 'PICKED_UP' }, D);
  check(`${prenom} : D prend la commande`, ok.status === 200 && prise.status === 200, `${ok.status} ${prise.status}`);
  return course;
}

async function attendreALaPorte(courseId) {
  await patch('/api/drivers/location', CHEZ_LE_CLIENT, D);
  const attente = await post(`/api/drivers/deliveries/${courseId}/attente`, {}, D);
  await attenteClientEcoulee(courseId);
  return attente.status;
}

const deposer = (courseId) =>
  patch(`/api/drivers/deliveries/${courseId}`, { status: 'DELIVERED', photoUrl: 'https://exemple.fr/depot.jpg', note: 'Devant la porte' }, D);

const course4 = await enRoute('Course 4');
await sqlExec(`UPDATE "OrderDelivery" SET "pickupTime" = NOW() - INTERVAL '40 minutes' WHERE id = '${course4.courseId}'`);
const retard4 = await attendre(
  `SELECT count(*) FROM "DeliveryIncident" WHERE "deliveryId" = '${course4.courseId}' AND type = 'RETARD_LIVRAISON'`,
  '1'
);
check('la livraison en retard est constatée', retard4 === '1', retard4);
check('l’attente se lance à la porte', (await attendreALaPorte(course4.courseId)) === 200);
const depot4 = await deposer(course4.courseId);
check('le dépôt en photo est accepté', depot4.status === 200, `statut ${depot4.status}`);
check(
  'mais son paiement est suspendu',
  (await sqlScalaire(`SELECT "payoutHold" FROM "OrderDelivery" WHERE id = '${course4.courseId}'`)) === 'REVIEW'
);
const situation = (await j(await get('/api/drivers/payouts', D)))?.data;
check('le livreur le voit « en examen », pas dû', situation?.coursesEnExamen === 1 && situation?.coursesDues === 0, JSON.stringify(situation)?.slice(0, 200));

const idD = await sqlScalaire(`SELECT "driverId" FROM "OrderDelivery" WHERE id = '${course4.courseId}'`);
const periode = { periodStart: new Date(Date.now() - 3600_000).toISOString(), periodEnd: new Date(Date.now() + 3600_000).toISOString() };
const avantDecision = await post('/api/superowner/payouts/draw', { ...periode, driverId: idD }, TP);
check('aucun relevé ne la paie avant la décision', avantDecision.status === 400, `statut ${avantDecision.status}`);

const aExaminer = (await incidents('ouverts')).find((i) => i.course.id === course4.courseId && i.type === 'DEPOT_CONTESTE');
check('la plateforme voit le dépôt à examiner, photo comprise', aExaminer?.course?.actions?.depot === true && Boolean(aExaminer?.course?.depot?.photo));
const fermeture = await post(`/api/superowner/delivery-incidents/${aExaminer?.id}/clore`, { resolution: 'Dépôt regardé' }, TP);
check('il ne se clôt pas sans décision', fermeture.status === 409, `statut ${fermeture.status}`);

const validation = await post(`/api/superowner/delivery-incidents/courses/${course4.courseId}/depot`, { decision: 'VALIDER', motif: 'Photo devant la bonne porte' }, TP);
check('la plateforme valide le dépôt', validation.status === 200, `statut ${validation.status}`);
const apresDecision = await post('/api/superowner/payouts/draw', { ...periode, driverId: idD }, TP);
check('la course entre alors dans un relevé', apresDecision.status === 201, `statut ${apresDecision.status}`);

titre('Parti pendant l’attente : plus de dépôt en photo');
const course5 = await enRoute('Course 5');
check('l’attente se lance à la porte', (await attendreALaPorte(course5.courseId)) === 200);
await patch('/api/drivers/location', LOIN, D);
await patch('/api/drivers/location', CHEZ_LE_CLIENT, D);
const depot5 = await deposer(course5.courseId);
check(
  'revenu à la porte, le dépôt en photo lui est refusé',
  depot5.status === 409 && (await j(depot5))?.code === 'LEFT_DURING_WAIT',
  `statut ${depot5.status}`
);
const remise5 = await patch(`/api/drivers/deliveries/${course5.courseId}`, { status: 'DELIVERED', code: await codeDeRemise(course5.courseId) }, D);
check('le code du client, lui, reste possible', remise5.status === 200, `statut ${remise5.status}`);

titre('« Je n’ai pas reçu ma commande »');
const course6 = await enRoute('Course 6');
await attendreALaPorte(course6.courseId);
check('un dépôt sans incident se fait normalement', (await deposer(course6.courseId)).status === 200);
check(
  'et se paie normalement',
  (await sqlScalaire(`SELECT coalesce("payoutHold", 'aucun') FROM "OrderDelivery" WHERE id = '${course6.courseId}'`)) === 'aucun'
);
const suivi6 = await j(await lireSuivi(course6.orderId));
check('le client peut le contester', suivi6?.reclamation?.possible === true, JSON.stringify(suivi6?.reclamation));

const parLeCommerce = await post(`/api/orders/${course6.orderId}/reclamation-livraison`, {}, T);
check('le commerce ne réclame pas à la place du client', parLeCommerce.status === 404, `statut ${parLeCommerce.status}`);
const reclamation = await post(
  `/api/orders/${course6.orderId}/reclamation-livraison?t=${encodeURIComponent(jetonDeSuivi(course6.orderId))}`,
  { message: 'Rien devant ma porte' }
);
check('le client réclame avec son lien de suivi', reclamation.status === 200, `statut ${reclamation.status}`);
const encore = await post(`/api/orders/${course6.orderId}/reclamation-livraison?t=${encodeURIComponent(jetonDeSuivi(course6.orderId))}`, {});
check('une seule fois', encore.status === 409, `statut ${encore.status}`);
check(
  'le paiement du livreur est suspendu',
  (await sqlScalaire(`SELECT "payoutHold" FROM "OrderDelivery" WHERE id = '${course6.courseId}'`)) === 'REVIEW'
);

const refusDepot = await post(`/api/superowner/delivery-incidents/courses/${course6.courseId}/depot`, { decision: 'REFUSER', motif: 'Photo prise ailleurs' }, TP);
const bilanRefus = (await j(refusDepot))?.data;
check('la plateforme refuse le dépôt', refusDepot.status === 200 && bilanRefus?.suspendu === true, JSON.stringify(bilanRefus));
check(
  'la course ne sera jamais payée',
  (await sqlScalaire(`SELECT "payoutHold" FROM "OrderDelivery" WHERE id = '${course6.courseId}'`)) === 'REFUSED'
);
check(
  'la commande est annulée, livraison échouée, toujours due au commerçant',
  (await sqlScalaire(`SELECT status || '/' || "rejectionReason" FROM "Order" WHERE id = '${course6.orderId}'`)) === 'REJECTED/DELIVERY_FAILED'
);
check(
  'le geste est journalisé',
  Number(await sqlScalaire(`SELECT count(*) FROM "SystemAuditLog" WHERE action = 'REFUSE_DELIVERY_DEPOSIT' AND target = '${course6.courseId}'`)) === 1
);

await terminer();
