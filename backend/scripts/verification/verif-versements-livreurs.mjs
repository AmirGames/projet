// Ce qu'on doit à un livreur, et ce qu'on lui a versé.

import {
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

const plateforme = await j(
  await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
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

const livreur = await j(
  await post('/api/drivers/register', {
    name: `Karim ${uniq}`,
    email: `d-${uniq}@t.fr`,
    password: MDP,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  })
);
const D = livreur.accessToken;

await validerLivreur(D, TP);
await patch('/api/drivers/availability', { isOnline: true }, D);
await patch('/api/drivers/location', { latitude: 45.764, longitude: 4.8357 }, D);

const driverId = (await j(await get('/api/drivers/me', D)))?.data?.id;

/** Une commande livrée de bout en bout, pour créer une course à payer. */
async function courseLivree() {
  const commande = await j(
    await post('/api/orders', {
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
  const courseId = attribution?.data?.deliveryId;

  await patch(`/api/drivers/deliveries/${courseId}/accept`, null, D);
  await patch(`/api/drivers/deliveries/${courseId}`, { status: 'PICKED_UP' }, D);
  await patch(`/api/drivers/deliveries/${courseId}`, { status: 'DELIVERED' }, D);

  return courseId;
}

// ===== Ce qui est dû =====

titre('Deux courses livrées, et rien de versé');
const course1 = await courseLivree();
const course2 = await courseLivree();

const situation = await j(await get('/api/drivers/payouts', D));
// Le livreur voyait « 340 € gagnés » sans savoir si l'argent était arrivé.
check('deux courses sont dues', situation?.data?.coursesDues === 2, `${situation?.data?.coursesDues}`);
check('un montant dû est annoncé', situation?.data?.duNonArrete > 0, `${situation?.data?.duNonArrete}`);
check('rien n’attend de versement', situation?.data?.enAttenteDeVersement === 0, `${situation?.data?.enAttenteDeVersement}`);
check('rien n’a été versé', situation?.data?.verse === 0, `${situation?.data?.verse}`);
check('aucun relevé encore', (situation?.data?.releves || []).length === 0, `${(situation?.data?.releves || []).length}`);

const attendu = situation?.data?.courses?.reduce((somme, c) => somme + c.montant, 0);
check('le dû est la somme des courses', Math.abs(attendu - situation.data.duNonArrete) < 0.01, `${attendu} vs ${situation.data.duNonArrete}`);

titre('La plateforme voit ce qu’elle doit');
const vue = await j(await get('/api/superowner/payouts', TP));
check('un reste à devoir est chiffré', vue?.reste?.montant > 0, JSON.stringify(vue?.reste));
check('avec le nombre de courses', vue?.reste?.courses >= 2, `${vue?.reste?.courses}`);
check('et le nombre de livreurs', vue?.reste?.livreurs >= 1, `${vue?.reste?.livreurs}`);
check('une période est proposée', !!vue?.periodeProposee?.periodStart, JSON.stringify(vue?.periodeProposee));
check('les moyens de versement sont listés', (vue?.moyens || []).includes('BANK_TRANSFER'), JSON.stringify(vue?.moyens));

// ===== L'arrêté =====

titre('Une période sans course ne s’arrête pas');
const vide = await post(
  '/api/superowner/payouts/draw',
  { driverId, periodStart: '2020-01-01T00:00:00.000Z', periodEnd: '2020-01-08T00:00:00.000Z' },
  TP
);
check('l’arrêté est refusé', vide.status === 400, `statut ${vide.status}`);
check(
  'et on dit qu’il n’y a rien à payer',
  /rien à arrêter|Aucune course/i.test((await j(vide))?.error || ''),
  (await j(vide))?.error
);

titre('Une période à l’envers est refusée');
const envers = await post(
  '/api/superowner/payouts/draw',
  { driverId, periodStart: '2030-01-08T00:00:00.000Z', periodEnd: '2030-01-01T00:00:00.000Z' },
  TP
);
check('l’arrêté est refusé', envers.status === 400, `statut ${envers.status}`);

titre('La plateforme arrête le relevé');
const demain = new Date(Date.now() + 86400000).toISOString();
const arrete = await post(
  '/api/superowner/payouts/draw',
  { periodStart: '2020-01-01T00:00:00.000Z', periodEnd: demain },
  TP
);
check('l’arrêté passe', arrete.status === 201, `statut ${arrete.status}`);
check('un relevé est créé', (await j(arrete))?.payouts === 1, JSON.stringify(await j(arrete)));

const apres = await j(await get('/api/drivers/payouts', D));
check('plus rien n’est dû', apres?.data?.duNonArrete === 0, `${apres?.data?.duNonArrete}`);
check('le montant attend le versement', apres?.data?.enAttenteDeVersement > 0, `${apres?.data?.enAttenteDeVersement}`);
check(
  'le montant arrêté est celui qui était dû',
  Math.abs(apres.data.enAttenteDeVersement - situation.data.duNonArrete) < 0.01,
  `${apres.data.enAttenteDeVersement} vs ${situation.data.duNonArrete}`
);
check('le relevé apparaît', (apres?.data?.releves || []).length === 1, `${(apres?.data?.releves || []).length}`);

const releve = apres.data.releves[0];
check('il porte les deux courses', releve.deliveryCount === 2, `${releve.deliveryCount}`);
check('il est en attente', releve.status === 'PENDING', releve.status);

const prevenu = await sqlScalaire(
  `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = 'd-${uniq}@t.fr' AND title LIKE '%relevé%'`
);
check('le livreur est prévenu', Number(prevenu) >= 1, prevenu);

titre('Une course déjà portée n’est jamais reprise');
// C'est l'invariant du modèle : payer deux fois la même course serait le
// défaut le plus coûteux du lot.
const encore = await post(
  '/api/superowner/payouts/draw',
  { driverId, periodStart: '2020-01-01T00:00:00.000Z', periodEnd: demain },
  TP
);
check('un second arrêté ne trouve rien', encore.status === 400, `statut ${encore.status}`);

const portees = await sqlScalaire(
  `SELECT COUNT(*) FROM "OrderDelivery" WHERE id IN ('${course1}', '${course2}') AND "payoutId" IS NOT NULL`
);
check('les deux courses sont rattachées au relevé', portees === '2', portees);

titre('Le détail du relevé est lisible');
const detail = await j(await get(`/api/drivers/payouts/${releve.id}`, D));
check('les courses payées sont listées', (detail?.data?.deliveries || []).length === 2, `${(detail?.data?.deliveries || []).length}`);
check('chacune porte son montant', (detail?.data?.deliveries || []).every((c) => c.montant > 0), JSON.stringify(detail?.data?.deliveries));

titre('Le relevé d’un autre livreur reste fermé');
const autre = await j(
  await post('/api/drivers/register', {
    name: `Sami ${uniq}`,
    email: `d2-${uniq}@t.fr`,
    password: MDP,
    phone: '0622222222',
    vehicleType: 'bike',
  })
);
const fouille = await get(`/api/drivers/payouts/${releve.id}`, autre.accessToken);
check('l’accès est refusé', fouille.status === 404, `statut ${fouille.status}`);

// ===== Le versement =====

titre('Un moyen de versement inconnu est refusé');
const inconnu = await post(`/api/superowner/payouts/${releve.id}/pay`, { method: 'BITCOIN' }, TP);
check('le versement est refusé', inconnu.status === 400, `statut ${inconnu.status}`);

titre('La plateforme verse');
const versement = await post(
  `/api/superowner/payouts/${releve.id}/pay`,
  { method: 'BANK_TRANSFER', reference: `VIR-${uniq}` },
  TP
);
check('le versement passe', versement.status === 200, `statut ${versement.status}`);

const paye = await j(await get('/api/drivers/payouts', D));
check('le relevé est versé', paye?.data?.releves?.[0]?.status === 'PAID', paye?.data?.releves?.[0]?.status);
check('la référence est gardée', paye?.data?.releves?.[0]?.reference === `VIR-${uniq}`, paye?.data?.releves?.[0]?.reference);
check('le moyen est dit en français', paye?.data?.releves?.[0]?.methodLibelle === 'Virement bancaire', paye?.data?.releves?.[0]?.methodLibelle);
check('le montant passe en versé', paye?.data?.verse > 0, `${paye?.data?.verse}`);
check('et quitte l’attente', paye?.data?.enAttenteDeVersement === 0, `${paye?.data?.enAttenteDeVersement}`);

const dateVersement = await sqlScalaire(`SELECT "paidAt" FROM "DriverPayout" WHERE id = '${releve.id}'`);
check('la date du versement est gardée', dateVersement !== '', dateVersement);

const avis = await sqlScalaire(
  `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = 'd-${uniq}@t.fr' AND title LIKE '%ersement%'`
);
check('le livreur est prévenu du versement', Number(avis) >= 1, avis);

titre('Verser deux fois est refusé');
const rebelote = await post(
  `/api/superowner/payouts/${releve.id}/pay`,
  { method: 'CASH' },
  TP
);
check('le second versement est refusé', rebelote.status === 400, `statut ${rebelote.status}`);
check(
  'et dit que c’est déjà versé',
  /déjà versé/i.test((await j(rebelote))?.error || ''),
  (await j(rebelote))?.error
);

titre('Un relevé versé ne s’annule pas');
const annulationTardive = await post(
  `/api/superowner/payouts/${releve.id}/cancel`,
  { raison: 'Erreur' },
  TP
);
check('l’annulation est refusée', annulationTardive.status === 400, `statut ${annulationTardive.status}`);
check(
  'et rappelle que l’argent est parti',
  /argent est parti/i.test((await j(annulationTardive))?.error || ''),
  (await j(annulationTardive))?.error
);

// ===== L'annulation d'un relevé non versé =====

titre('Un relevé non versé s’annule, et ses courses redeviennent dues');
await courseLivree();

const second = await post(
  '/api/superowner/payouts/draw',
  { driverId, periodStart: '2020-01-01T00:00:00.000Z', periodEnd: demain },
  TP
);
check('un nouveau relevé est arrêté', second.status === 201, `statut ${second.status}`);

const liste = await j(await get('/api/superowner/payouts?status=PENDING', TP));
const aAnnuler = (liste?.payouts || []).find((p) => p.driverEmail === `d-${uniq}@t.fr`);
check('il figure dans la liste de la plateforme', aAnnuler !== undefined, JSON.stringify((liste?.payouts || []).map((p) => p.driverEmail)));
check('avec le nom du livreur', aAnnuler?.driverName === `Karim ${uniq}`, aAnnuler?.driverName);

titre('Une annulation sans motif est refusée');
const sansMotif = await post(`/api/superowner/payouts/${aAnnuler.id}/cancel`, {}, TP);
check('on exige un motif', sansMotif.status === 400, `statut ${sansMotif.status}`);

const annulation = await post(
  `/api/superowner/payouts/${aAnnuler.id}/cancel`,
  { raison: 'Montant à revoir' },
  TP
);
check('l’annulation passe', annulation.status === 200, `statut ${annulation.status}`);

const rendu = await j(await get('/api/drivers/payouts', D));
check('la course redevient due', rendu?.data?.coursesDues === 1, `${rendu?.data?.coursesDues}`);
check('et son montant aussi', rendu?.data?.duNonArrete > 0, `${rendu?.data?.duNonArrete}`);
check(
  'le relevé annulé disparaît de l’historique du livreur',
  (rendu?.data?.releves || []).every((r) => r.id !== aAnnuler.id),
  JSON.stringify((rendu?.data?.releves || []).map((r) => r.id))
);

// Elle peut donc repartir dans un arrêté suivant : c'est tout l'intérêt.
const reprise = await post(
  '/api/superowner/payouts/draw',
  { driverId, periodStart: '2020-01-01T00:00:00.000Z', periodEnd: demain },
  TP
);
check('elle repart dans un nouvel arrêté', reprise.status === 201, `statut ${reprise.status}`);

// ===== Les décomptes de la plateforme =====

titre('La plateforme compte ses relevés');
const bilan = await j(await get('/api/superowner/payouts?status=ALL', TP));
check('le décompte par état est rendu', Number(bilan?.counts?.ALL) >= 3, JSON.stringify(bilan?.counts));
check('un relevé versé est compté', Number(bilan?.counts?.PAID) >= 1, JSON.stringify(bilan?.counts));
check('un relevé annulé aussi', Number(bilan?.counts?.CANCELLED) >= 1, JSON.stringify(bilan?.counts));
check('le montant versé est totalisé', Number(bilan?.totals?.PAID) > 0, JSON.stringify(bilan?.totals));

titre('Chaque geste laisse une trace');
const trace = await sqlScalaire(
  `SELECT COUNT(*) FROM "SystemAuditLog" WHERE action IN ('DRAW_DRIVER_PAYOUTS', 'PAY_DRIVER_PAYOUT', 'CANCEL_DRIVER_PAYOUT')`
);
check('les arrêtés, versements et annulations sont journalisés', Number(trace) >= 3, trace);

titre('Une course non livrée n’est jamais due');
// Seules les courses menées à leur terme se paient : une course acceptée mais
// abandonnée ne doit rien.
const enCours = await j(
  await post('/api/orders', {
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: `c2-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '3 rue Garibaldi',
    deliveryCity: 'Lyon',
    deliveryLat: 45.77,
    deliveryLng: 4.85,
    totalAmount: 20,
    feesAmount: 4,
    items: [{ productId, quantity: 1, price: 15 }],
  })
);
const orderEnCours = enCours.order?.id || enCours.id;
const attribuee = await j(await post(`/api/orders/${orderEnCours}/dispatch`, {}, T));
await patch(`/api/drivers/deliveries/${attribuee?.data?.deliveryId}/accept`, null, D);

const avant = await j(await get('/api/drivers/payouts', D));
await sqlExec(`SELECT 1`);
check(
  'la course acceptée mais non livrée n’est pas due',
  (avant?.data?.courses || []).every((c) => c.id !== attribuee?.data?.deliveryId),
  JSON.stringify((avant?.data?.courses || []).map((c) => c.id))
);

await terminer();
