// Suppléments payants, pourboire du livreur, et notifications de boutique
// réservées à ses membres.
//
// Le pourboire ne se laisse que pour une livraison payée en ligne : les
// contrôles qui le concernent demandent une API lancée avec Stripe actif
// (ENABLE_STRIPE=true et une STRIPE_SECRET_KEY, même factice — aucune
// intention de paiement n'est créée ici).

import { inscription,
  API,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  put,
  patch,
  del,
  sqlScalaire,
  sqlExec,
  terminer,
  validerLivreur,
} from './outils.mjs';

const BOUTIQUE = { latitude: 45.764, longitude: 4.8357 };
const CLIENT = { latitude: 45.7665, longitude: 4.8365 };

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` })
);
const S = plateforme.accessToken;

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;

const voisin = await j(
  await inscription({ email: `v-${uniq}@t.fr`, password: 'Password123!', name: `V ${uniq}` })
);
const V = voisin.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Burger ${uniq}`,
      slug: `burger-${uniq}`,
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
await sqlExec(`UPDATE "Store" SET "isOpen" = true, "acceptsDelivery" = true, "minDeliveryAmount" = 0 WHERE id = '${storeId}'`);

const burger = await j(await post('/api/products', { storeId, name: 'Burger', price: 10, status: 'ACTIVE' }, T));
const burgerId = burger.product?.id || burger.id;

// ===== Le commerçant compose ses suppléments =====

titre('Le commerçant compose ses suppléments');
const groupes = [
  {
    name: 'Suppléments',
    maxChoices: 2,
    choices: [
      { label: 'Bacon', price: 1.5 },
      { label: 'Cheddar', price: 1 },
      { label: 'Oignons', price: 0.5 },
    ],
  },
  { name: 'Sauce', isRequired: true, maxChoices: 1, choices: [{ label: 'Ketchup', price: 0 }, { label: 'Barbecue', price: 0 }] },
];
const enregistre = await put(`/api/products/${burgerId}/supplements`, { groupes }, T);
const corpsEnregistre = await j(enregistre);
check('les suppléments sont enregistrés', enregistre.status === 200, `statut ${enregistre.status} ${JSON.stringify(corpsEnregistre)?.slice(0, 200)}`);
check('deux groupes', corpsEnregistre?.data?.length === 2, JSON.stringify(corpsEnregistre?.data)?.slice(0, 200));

const [supplements, sauces] = corpsEnregistre.data;
const bacon = supplements.choices.find((c) => c.label === 'Bacon');
const cheddar = supplements.choices.find((c) => c.label === 'Cheddar');
const oignons = supplements.choices.find((c) => c.label === 'Oignons');
const ketchup = sauces.choices.find((c) => c.label === 'Ketchup');
const barbecue = sauces.choices.find((c) => c.label === 'Barbecue');
check('chaque choix reçoit un identifiant', Boolean(bacon?.id && ketchup?.id), JSON.stringify(supplements.choices));

titre('Un identifiant survit à la réécriture');
const reecrits = await j(
  await put(
    `/api/products/${burgerId}/supplements`,
    { groupes: corpsEnregistre.data.map((g) => ({ ...g, choices: g.choices.map((c) => ({ ...c })) })) },
    T
  )
);
check(
  'le bacon garde le sien',
  reecrits?.data?.[0]?.choices?.find((c) => c.label === 'Bacon')?.id === bacon.id,
  JSON.stringify(reecrits?.data?.[0]?.choices)
);

titre('Chacun chez soi');
check(
  'un autre commerçant ne lit pas les suppléments',
  (await get(`/api/products/${burgerId}/supplements`, V)).status === 403,
  'lu à tort'
);
check(
  'ni ne les remplace',
  (await put(`/api/products/${burgerId}/supplements`, { groupes: [] }, V)).status === 403,
  'remplacé à tort'
);
check(
  'un prix négatif est refusé',
  (await put(`/api/products/${burgerId}/supplements`, { groupes: [{ name: 'X', choices: [{ label: 'Y', price: -1 }] }] }, T))
    .status === 400,
  'accepté à tort'
);

titre('Le menu du client les porte');
const menu = await j(await get(`/api/client/stores/${storeId}`));
const platDuMenu = Object.values(menu?.data?.menu || {}).flat().find((p) => p.id === burgerId);
check('le plat du menu a ses deux groupes', platDuMenu?.supplements?.length === 2, JSON.stringify(platDuMenu?.supplements)?.slice(0, 200));
check(
  'avec leurs prix',
  platDuMenu?.supplements?.[0]?.choices?.find((c) => c.id === bacon.id)?.price === 1.5,
  JSON.stringify(platDuMenu?.supplements?.[0]?.choices)
);

// ===== La commande =====

const commander = (items, extra = {}) =>
  post('/api/orders', {
    conditionsAcceptees: true,
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 1,
    items,
    ...extra,
  });

titre('Le serveur tarife les suppléments');
const commande = await commander([
  { productId: burgerId, quantity: 2, price: 0.01, supplements: [bacon.id, cheddar.id, ketchup.id] },
]);
const corpsCommande = await j(commande);
const orderId = corpsCommande.order?.id;
check('la commande passe', commande.status === 201 || Boolean(orderId), `statut ${commande.status} ${JSON.stringify(corpsCommande)?.slice(0, 200)}`);

const prixLigne = Number(await sqlScalaire(`SELECT price FROM "OrderItem" WHERE "orderId" = '${orderId}'`));
check('le prix annoncé (0,01 €) est ignoré : 10 + 1,50 + 1 = 12,50', prixLigne === 12.5, `${prixLigne}`);
const totalLigne = Number(await sqlScalaire(`SELECT total FROM "OrderItem" WHERE "orderId" = '${orderId}'`));
check('la ligne vaut deux burgers garnis : 25 €', totalLigne === 25, `${totalLigne}`);

const copie = await sqlScalaire(`SELECT "selectedOptions"::text FROM "OrderItem" WHERE "orderId" = '${orderId}'`);
check('la ligne garde la copie des suppléments', /Bacon/.test(copie) && /Ketchup/.test(copie), copie);

titre('Les règles de chaque groupe');
const sansSauce = await commander([{ productId: burgerId, quantity: 1, price: 10, supplements: [bacon.id] }]);
const corpsSansSauce = await j(sansSauce);
check('une sauce est obligatoire', sansSauce.status === 400 && corpsSansSauce?.code === 'SUPPLEMENT_REQUIRED', `${sansSauce.status} ${corpsSansSauce?.code}`);

const tropDeSup = await commander([
  { productId: burgerId, quantity: 1, price: 10, supplements: [bacon.id, cheddar.id, oignons.id, ketchup.id] },
]);
check('trois suppléments quand deux sont permis : refusé', tropDeSup.status === 400 && (await j(tropDeSup))?.code === 'SUPPLEMENT_TOO_MANY', `${tropDeSup.status}`);

const deuxSauces = await commander([
  { productId: burgerId, quantity: 1, price: 10, supplements: [ketchup.id, barbecue.id] },
]);
check('deux sauces quand une seule est permise : refusé', deuxSauces.status === 400, `${deuxSauces.status}`);

const inconnu = await commander([
  { productId: burgerId, quantity: 1, price: 10, supplements: [ketchup.id, 'supplement-invente'] },
]);
check('un supplément inventé est refusé', inconnu.status === 400 && (await j(inconnu))?.code === 'SUPPLEMENT_NOT_FOUND', `${inconnu.status}`);

// Le bacon épuisé.
await put(
  `/api/products/${burgerId}/supplements`,
  {
    groupes: reecrits.data.map((g) => ({
      ...g,
      choices: g.choices.map((c) => (c.id === bacon.id ? { ...c, isAvailable: false } : c)),
    })),
  },
  T
);
const epuise = await commander([{ productId: burgerId, quantity: 1, price: 10, supplements: [bacon.id, ketchup.id] }]);
check('un supplément épuisé est refusé', epuise.status === 400 && (await j(epuise))?.code === 'SUPPLEMENT_UNAVAILABLE', `${epuise.status}`);

// ===== L'historique du client =====

titre('« Commander à nouveau » trouve de quoi reconstituer le panier');
const client = await j(
  await post('/api/auth/signup', {
    conditionsAcceptees: true,
    email: `client-${uniq}@t.fr`,
    password: 'Password123!',
    name: `Client ${uniq}`,
  })
);
const C = client.accessToken;
await post(
  '/api/orders',
  {
    conditionsAcceptees: true,
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: `client-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 1,
    items: [{ productId: burgerId, quantity: 1, price: 10, supplements: [cheddar.id, barbecue.id] }],
  },
  C
);
const historique = await j(await get('/api/client/me/orders', C));
const ligneHistorique = historique?.data?.[0]?.items?.[0];
check('la ligne porte son plat', ligneHistorique?.productId === burgerId, JSON.stringify(ligneHistorique));
check(
  'et ses suppléments',
  ligneHistorique?.supplements?.map((s) => s.label).sort().join(',') === 'Barbecue,Cheddar',
  JSON.stringify(ligneHistorique?.supplements)
);
check('la commande nomme son commerce', historique?.data?.[0]?.store?.slug === `burger-${uniq}`, JSON.stringify(historique?.data?.[0]?.store));

// ===== Le pourboire =====

titre('Le pourboire');
const commanderLivre = (pourboire, extra = {}) =>
  commander([{ productId: burgerId, quantity: 1, price: 10, supplements: [ketchup.id] }], {
    deliveryType: 'DELIVERY',
    deliveryAddress: '20 rue de la Ré',
    deliveryCity: 'Lyon',
    deliveryPostal: '69002',
    deliveryLat: CLIENT.latitude,
    deliveryLng: CLIENT.longitude,
    feesAmount: 0,
    tipAmount: pourboire,
    ...extra,
  });

const aEmporter = await commander([{ productId: burgerId, quantity: 1, price: 10, supplements: [ketchup.id] }], { tipAmount: 2 });
check('pas de pourboire pour un retrait sur place', aEmporter.status === 400 && (await j(aEmporter))?.code === 'TIP_NOT_AVAILABLE', `${aEmporter.status}`);

const excessif = await commanderLivre(60);
check('un pourboire de 60 € est refusé', excessif.status === 400 && (await j(excessif))?.code === 'INVALID_TIP', `${excessif.status}`);

const avecPourboire = await commanderLivre(2);
const corpsPourboire = await j(avecPourboire);
const idPourboire = corpsPourboire.order?.id;
if (avecPourboire.status === 400 && corpsPourboire?.code === 'TIP_NOT_AVAILABLE') {
  console.log('   (API sans Stripe actif : les contrôles du pourboire accepté sont sautés)');
} else {
  check('le pourboire est accepté', Boolean(idPourboire), `${avecPourboire.status} ${JSON.stringify(corpsPourboire)?.slice(0, 200)}`);

  const [total, frais, service, tip] = (
    await sqlScalaire(
      `SELECT concat_ws('|', "totalAmount", "feesAmount", "serviceFeeAmount", "tipAmount") FROM "Order" WHERE id = '${idPourboire}'`
    )
  ).split('|').map(Number);
  check('il est gardé à part', tip === 2, `${tip}`);
  check(
    'et n’entre pas dans le total de la commande',
    Math.abs(total - (10 + frais + service)) < 0.001,
    `total ${total}, frais ${frais}, service ${service}`
  );
  // L'assiette de la commission : les articles, sans les frais de livraison
  // (au livreur), ni de service (à la plateforme), ni le pourboire.
  const [commission, taux] = (
    await sqlScalaire(`SELECT concat_ws('|', "commissionAmount", "commissionPercent") FROM "Order" WHERE id = '${idPourboire}'`)
  ).split('|').map(Number);
  check(
    'ni dans la commission : elle porte sur les 10 € d’articles',
    Math.abs(commission - (10 * taux) / 100) < 0.011,
    `${commission} € à ${taux} %`
  );

  titre('Le livreur reçoit le pourboire');
  const livreurCompte = await j(
    await post('/api/drivers/register', {
      conditionsAcceptees: true,
      name: `L ${uniq}`,
      email: `l-${uniq}@t.fr`,
      password: 'Password123!',
      phone: '0611111111',
      vehicleType: 'scooter',
      vehiclePlate: 'AB-123-CD',
    })
  );
  const L = livreurCompte.accessToken;
  await validerLivreur(L, S);
  await patch('/api/drivers/availability', { isAvailable: true, isOnline: true }, L);
  await patch('/api/drivers/location', { latitude: 45.766, longitude: 4.838 }, L);

  // Payée : la commande part au commerçant (le webhook Stripe le ferait).
  await sqlExec(`UPDATE "Order" SET "paymentStatus" = 'SUCCEEDED', "submittedAt" = NOW() WHERE id = '${idPourboire}'`);
  const recherche = await j(await post(`/api/orders/${idPourboire}/dispatch`, {}, T));
  check('une course est proposée', recherche?.data?.propose === true, JSON.stringify(recherche));

  const offres = await j(await get('/api/drivers/offers', L));
  const offre = (offres?.data || []).find((o) => o.deliveryId === recherche?.data?.deliveryId) || offres?.data?.[0];
  const fraisCommande = Number(await sqlScalaire(`SELECT "feesAmount" FROM "Order" WHERE id = '${idPourboire}'`));
  const gainPropose = Number(offre?.payout ?? offre?.remuneration ?? NaN);
  check(
    'la proposition compte le pourboire : frais + 2 €',
    Math.abs(gainPropose - (fraisCommande + 2)) < 0.001,
    `${gainPropose} pour ${fraisCommande} € de frais — ${JSON.stringify(offre)?.slice(0, 300)}`
  );

  if (offre?.id) {
    await post(`/api/drivers/offers/${offre.id}/accept`, null, L);
    const fige = Number(await sqlScalaire(`SELECT "driverPayout" FROM "OrderDelivery" WHERE "orderId" = '${idPourboire}'`));
    check('la rémunération figée le porte : c’est elle que le relevé versera', Math.abs(fige - (fraisCommande + 2)) < 0.001, `${fige}`);

    const course = await j(await get(`/api/drivers/deliveries/${recherche.data.deliveryId}`, L));
    check('le livreur voit la part du pourboire', course?.data?.pourboire === 2, JSON.stringify(course?.data)?.slice(0, 200));
  }

  // ===== Le pourboire laissé après la livraison =====

  titre('Le pourboire après la livraison n’est proposé qu’une fois livrée');
  const situation = async () => (await j(await get(`/api/orders/${idPourboire}/pourboire`)))?.data;
  const avantLivraison = await situation();
  check('déjà donné en commandant : rien à proposer', avantLivraison?.possible === false && avantLivraison?.raison === 'DEJA_DONNE', JSON.stringify(avantLivraison));

  // La commande livrée, sans pourboire en commandant : le cas à couvrir. Le
  // parcours de livraison lui-même se vérifie dans verif-parcours-livreur.
  await sqlExec(`UPDATE "Order" SET "tipAmount" = 0 WHERE id = '${idPourboire}'`);
  const pasLivree = await situation();
  check('pas encore livrée : pas encore proposé', pasLivree?.possible === false && pasLivree?.raison === 'PAS_LIVREE', JSON.stringify(pasLivree));

  await sqlExec(`UPDATE "OrderDelivery" SET status = 'DELIVERED', "deliveryTime" = NOW() WHERE "orderId" = '${idPourboire}'`);
  const livree = await situation();
  check('livrée : le pourboire est proposé', livree?.possible === true, JSON.stringify(livree));
  check('au nom du livreur', livree?.livreur === 'L', JSON.stringify(livree));
  check('les pourcentages portent sur les 10 € d’articles', livree?.montantArticles === 10, JSON.stringify(livree));

  const tropPetit = await post(`/api/orders/${idPourboire}/pourboire`, { montant: 0.2 });
  check('20 centimes : refusé', tropPetit.status === 400 && (await j(tropPetit))?.code === 'INVALID_TIP', `${tropPetit.status}`);
  const tropGrand = await post(`/api/orders/${idPourboire}/pourboire`, { montant: 60 });
  check('60 € : refusé', tropGrand.status === 400 && (await j(tropGrand))?.code === 'INVALID_TIP', `${tropGrand.status}`);

  titre('Le webhook encaisse le pourboire à part');
  // L'intention elle-même se crée chez Stripe ; la ligne qu'elle laisse est
  // posée ici, telle que PourboireService.creerIntention l'écrit.
  const driverId = await sqlScalaire(`SELECT "driverId" FROM "OrderDelivery" WHERE "orderId" = '${idPourboire}'`);
  const intention = `pi_pourboire_${uniq}`;
  await sqlExec(
    `INSERT INTO "DriverTip" (id, "orderId", "driverId", amount, status, "stripePaymentIntentId", "updatedAt")
     VALUES ('tip_${uniq}', '${idPourboire}', '${driverId}', 1.5, 'PENDING', '${intention}', NOW())`
  );
  const gainsAvant = Number(await sqlScalaire(`SELECT "totalEarnings" FROM "Driver" WHERE id = '${driverId}'`));

  const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!SECRET) {
    console.log('   (STRIPE_WEBHOOK_SECRET absent : le webhook n’est pas joué)');
  } else {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe('sk_test_verification');
    const evenement = {
      id: `evt_${uniq}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: intention,
          object: 'payment_intent',
          amount: 150,
          amount_received: 150,
          status: 'succeeded',
          metadata: { orderId: idPourboire, pourboire: '1', driverId },
        },
      },
    };
    const corps = JSON.stringify(evenement);
    const envoyer = () =>
      fetch(`${API}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: corps, secret: SECRET }),
        },
        body: corps,
      });
    const recu = await envoyer();
    check('le webhook l’accepte', recu.status === 200, `${recu.status} ${await recu.text()}`);
    await envoyer();

    check('le pourboire est payé', (await sqlScalaire(`SELECT status FROM "DriverTip" WHERE id = 'tip_${uniq}'`)) === 'PAID', '');
    check(
      'il n’est pas pris pour le paiement de la commande',
      (await sqlScalaire(`SELECT COUNT(*) FROM "Payment" WHERE "stripePaymentIntentId" = '${intention}'`)) === '0',
      'un paiement de commande a été créé'
    );
    const gainsApres = Number(await sqlScalaire(`SELECT "totalEarnings" FROM "Driver" WHERE id = '${driverId}'`));
    check('les gains du livreur grandissent une seule fois, webhook rejoué', Math.abs(gainsApres - gainsAvant - 1.5) < 0.001, `${gainsAvant} → ${gainsApres}`);

    const apres = await situation();
    check('il n’est plus proposé, et on remercie', apres?.possible === false && apres?.donne?.quand === 'APRES_LIVRAISON' && apres?.donne?.montant === 1.5, JSON.stringify(apres));
    const encore = await post(`/api/orders/${idPourboire}/pourboire`, { montant: 2 });
    check('un second pourboire est refusé', encore.status === 409, `${encore.status}`);

    titre('Il rejoint le relevé du livreur');
    const gains = await j(await get('/api/drivers/earnings', L));
    const ligne = (gains?.deliveries || []).find((c) => c.orderId === idPourboire);
    check('« Mes gains » le montre sur la course', ligne?.pourboireApres === 1.5, JSON.stringify(ligne));
    const du = await j(await get('/api/drivers/payouts', L));
    check('il est dû', (du?.data?.pourboires || du?.pourboires || []).some((p) => p.montant === 1.5), JSON.stringify(du)?.slice(0, 300));

    const debut = new Date(Date.now() - 86400000).toISOString();
    const fin = new Date(Date.now() + 60000).toISOString();
    const arrete = await j(await post('/api/superowner/payouts/draw', { periodStart: debut, periodEnd: fin, driverId }, S));
    check('un relevé est arrêté', arrete?.payouts === 1, JSON.stringify(arrete));
    const releveId = await sqlScalaire(`SELECT id FROM "DriverPayout" WHERE "driverId" = '${driverId}' ORDER BY "createdAt" DESC LIMIT 1`);
    check('le relevé porte le pourboire', (await sqlScalaire(`SELECT "payoutId" FROM "DriverTip" WHERE id = 'tip_${uniq}'`)) === releveId, JSON.stringify(arrete)?.slice(0, 300));
    const montantReleve = Number(await sqlScalaire(`SELECT amount FROM "DriverPayout" WHERE id = '${releveId}'`));
    check('et son montant l’inclut : course + 1,50 €', Math.abs(montantReleve - (fraisCommande + 2 + 1.5)) < 0.001, `${montantReleve}`);
  }
}

// ===== Les notifications d'une boutique =====

titre('Les notifications d’une boutique restent chez elle');
await post(
  `/api/notifications/${storeId}`,
  { type: 'STOCK_LOW', title: 'Stock', message: 'Plus de bacon', recipientEmail: `m-${uniq}@t.fr` },
  T
);
const notifs = await j(await get(`/api/notifications/${storeId}`, T));
const notifId = notifs?.data?.[0]?.id;
check('le commerçant lit les siennes', Boolean(notifId), JSON.stringify(notifs)?.slice(0, 200));
check('et une à une', (await j(await get(`/api/notifications/${storeId}/${notifId}`, T)))?.data?.id === notifId, 'illisible');

check('le voisin ne les liste pas', (await get(`/api/notifications/${storeId}`, V)).status === 403, 'lues à tort');
check('ni ne les compte', (await get(`/api/notifications/${storeId}/unread/count`, V)).status === 403, 'comptées à tort');
check('ni n’en lit une', (await get(`/api/notifications/${storeId}/${notifId}`, V)).status === 403, 'lue à tort');
check(
  'ni n’en crée',
  (await post(`/api/notifications/${storeId}`, { type: 'STOCK_LOW', title: 'x', message: 'x', recipientEmail: 'x@t.fr' }, V))
    .status === 403,
  'créée à tort'
);
const suppressionVoisin = await del(`/api/notifications/${storeId}/${notifId}`, null, V);
check('ni n’en supprime', suppressionVoisin.status === 403, `statut ${suppressionVoisin.status}`);

titre('« Tout marquer lu » marque vraiment');
const avant = (await j(await get(`/api/notifications/${storeId}/unread/count`, T)))?.count;
await patch(`/api/notifications/${storeId}/read-all`, {}, T);
const apres = (await j(await get(`/api/notifications/${storeId}/unread/count`, T)))?.count;
check('il restait des non lues', avant > 0, `${avant}`);
check('il n’en reste plus', apres === 0, `${apres}`);

await terminer();
