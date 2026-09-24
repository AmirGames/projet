// Le parcours du livreur, de la porte du commerce à celle du client :
//   - le client est prévenu une seule fois, à 300 m, une fois la commande récupérée ;
//   - la photo du dépôt part de l'appareil du téléphone, reste chez nous et se
//     montre au client ;
//   - les frais d'une course faite par la plateforme ne comptent plus dans le
//     chiffre du commerçant : ils lui sont réclamés avec la commission.

import {
  API,
  inscription,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  patch,
  terminer,
  sqlScalaire,
  validerLivreur,
  codeDeRemise,
} from './outils.mjs';

const MDP = 'Password123!';

// Le commerce, place Bellecour ; le client, 2 km au nord.
const COMMERCE = { latitude: 45.764, longitude: 4.8357 };
const CLIENT = { latitude: 45.782, longitude: 4.8357 };
/** Un point à `m` mètres au sud du client. */
const auSudDuClient = (m) => ({ latitude: CLIENT.latitude - m / 111320, longitude: CLIENT.longitude });

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;
const orgId = commercant.organization.id;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId,
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
await patch('/api/drivers/location', COMMERCE, D);

const clientEmail = `c-${uniq}@t.fr`;

const commande = await j(
  await post('/api/orders', {
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: clientEmail,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '12 avenue Thiers',
    deliveryCity: 'Lyon',
    deliveryLat: CLIENT.latitude,
    deliveryLng: CLIENT.longitude,
    totalAmount: 15,
    feesAmount: 3,
    items: [{ productId, quantity: 1, price: 15 }],
  })
);
const orderId = commande.order?.id || commande.id;
const attribution = await j(await post(`/api/orders/${orderId}/dispatch`, {}, T));
const courseId = attribution?.data?.deliveryId;
await patch(`/api/drivers/deliveries/${courseId}/accept`, null, D);

// sqlScalaire rend du texte.
const prevenu = async () =>
  'true' ===
  await sqlScalaire(`SELECT "nearCustomerNotifiedAt" IS NOT NULL FROM "OrderDelivery" WHERE id = '${courseId}'`);
const messagesProches = async () =>
  Number(await sqlScalaire(
    `SELECT COUNT(*)::int FROM "Notification" WHERE type = 'DRIVER_NEARBY' AND "relatedOrderId" = '${orderId}'`
  ));

// ===== À 300 m du client =====

titre('En route vers le commerce, passer près du client ne le prévient pas');
await patch(`/api/drivers/deliveries/${courseId}/location`, auSudDuClient(100), D);
check('pas encore prévenu', (await prevenu()) === false, `${await prevenu()}`);

titre('Commande récupérée : loin du client, rien');
await patch(`/api/drivers/deliveries/${courseId}`, { status: 'PICKED_UP' }, D);
await patch(`/api/drivers/deliveries/${courseId}/location`, auSudDuClient(1200), D);
check('à 1,2 km : pas prévenu', (await prevenu()) === false, `${await prevenu()}`);

titre('À moins de 300 m, le client est prévenu');
await patch(`/api/drivers/deliveries/${courseId}/location`, auSudDuClient(250), D);
check('la marque est posée', (await prevenu()) === true, `${await prevenu()}`);
check('un message dans sa cloche', (await messagesProches()) === 1, `${await messagesProches()}`);

const suivi = await j(await get(`/api/orders/${orderId}`));
check('son suivi le dit', suivi?.livreurProche === true, `${suivi?.livreurProche}`);

titre('Une seule fois, même si le livreur tourne dans le quartier');
await patch(`/api/drivers/deliveries/${courseId}/location`, auSudDuClient(150), D);
await patch(`/api/drivers/deliveries/${courseId}/location`, auSudDuClient(50), D);
check('toujours un seul message', (await messagesProches()) === 1, `${await messagesProches()}`);

// ===== La photo du dépôt =====

titre('La photo part de l’appareil du téléphone');
// Le plus petit PNG valide : un pixel.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function envoyerPhoto(contenu, type, jeton = D) {
  const formulaire = new FormData();
  formulaire.append('photo', new Blob([contenu], { type }), 'depot.png');
  return fetch(`${API}/api/drivers/deliveries/${courseId}/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}` },
    body: formulaire,
  });
}

const pdf = await envoyerPhoto(Buffer.from('%PDF-1.4'), 'application/pdf');
check('un PDF n’est pas une photo', pdf.status === 400, `statut ${pdf.status}`);

const autre = await j(
  await post('/api/drivers/register', {
    name: `Autre ${uniq}`,
    email: `d2-${uniq}@t.fr`,
    password: MDP,
    phone: '0622222222',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-456-CD',
  })
);
const intrus = await envoyerPhoto(PIXEL, 'image/png', autre.accessToken);
check('un autre livreur ne dépose rien', intrus.status === 403, `statut ${intrus.status}`);

const envoi = await envoyerPhoto(PIXEL, 'image/png');
const photoUrl = (await j(envoi))?.data?.photoUrl;
check('la photo est reçue', envoi.status === 201 && Boolean(photoUrl), `statut ${envoi.status}`);

const servie = photoUrl ? await fetch(photoUrl) : null;
check('et se sert telle quelle', servie?.status === 200, `statut ${servie?.status}`);
check(
  'au même octet près',
  servie ? Buffer.from(await servie.arrayBuffer()).equals(PIXEL) : false
);

titre('Elle clôt la course, et le client la voit');
const cloture = await patch(
  `/api/drivers/deliveries/${courseId}`,
  { status: 'DELIVERED', photoUrl, note: 'Devant la porte' },
  D
);
check('la remise passe', cloture.status === 200, `statut ${cloture.status}`);

const apres = await j(await get(`/api/orders/${orderId}`));
check('le client voit la photo', apres?.photoDepot === photoUrl, `${apres?.photoDepot}`);
check('et où elle a été déposée', apres?.noteDepot === 'Devant la porte', `${apres?.noteDepot}`);

const tard = await envoyerPhoto(PIXEL, 'image/png');
check('course close : plus de photo', tard.status === 400, `statut ${tard.status}`);

// ===== Le code ne sert que chez le client =====

titre('Le code du client reste la preuve normale');
const seconde = await j(
  await post('/api/orders', {
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: clientEmail,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '12 avenue Thiers',
    deliveryCity: 'Lyon',
    deliveryLat: CLIENT.latitude,
    deliveryLng: CLIENT.longitude,
    totalAmount: 15,
    feesAmount: 3,
    items: [{ productId, quantity: 1, price: 15 }],
  })
);
const orderId2 = seconde.order?.id || seconde.id;
const course2 = (await j(await post(`/api/orders/${orderId2}/dispatch`, {}, T)))?.data?.deliveryId;
await patch(`/api/drivers/deliveries/${course2}/accept`, null, D);
await patch(`/api/drivers/deliveries/${course2}`, { status: 'PICKED_UP' }, D);
const code = await codeDeRemise(course2);
const parCode = await patch(`/api/drivers/deliveries/${course2}`, { status: 'DELIVERED', code }, D);
check('la remise passe au code', parCode.status === 200, `statut ${parCode.status}`);

// ===== Les frais de livraison =====

titre('Les frais d’une course de la plateforme ne sont pas au commerçant');
const mode = await sqlScalaire(`SELECT "deliveryMode" FROM "Order" WHERE id = '${orderId}'`);
check('la commande est livrée par la plateforme', mode === 'PLATFORM', mode);

const frais1 = Number(await sqlScalaire(`SELECT "feesAmount" FROM "Order" WHERE id = '${orderId}'`));
const frais2 = Number(await sqlScalaire(`SELECT "feesAmount" FROM "Order" WHERE id = '${orderId2}'`));
const totaux = Number(
  await sqlScalaire(
    `SELECT SUM("totalAmount") FROM "Order" WHERE id IN ('${orderId}', '${orderId2}')`
  )
);
check('des frais ont été facturés au client', frais1 > 0 && frais2 > 0, `${frais1} / ${frais2}`);

const stats = await j(await get(`/api/order-management/${storeId}/stats/overview`, T));
check(
  'son tableau de bord les met à part',
  Math.abs(stats?.platformDeliveryFees - (frais1 + frais2)) < 0.01,
  `${stats?.platformDeliveryFees}`
);
check(
  'et son chiffre ne les compte plus',
  Math.abs(stats?.totalRevenue - (totaux - frais1 - frais2)) < 0.01,
  `${stats?.totalRevenue} ≠ ${totaux - frais1 - frais2}`
);

titre('La plateforme les lui réclame avec la commission');
const facturation = await j(await get('/api/superowner/billing', TP));
const ligne = (facturation?.billings || []).find((l) => l.id === orgId);
check(
  'les frais dus sont comptés',
  Math.abs(ligne?.deliveryFeesDue - (frais1 + frais2)) < 0.01,
  `${ligne?.deliveryFeesDue}`
);
check(
  'le total dû ajoute commission et frais',
  Math.abs(ligne?.totalDue - (ligne?.amount + frais1 + frais2)) < 0.01,
  `${ligne?.totalDue}`
);

const detail = await j(await get(`/api/superowner/billing/${orgId}`, TP));
const ligneCommande = (detail?.orders || []).find((l) => l.id === orderId);
check('le détail le porte par commande', Math.abs(ligneCommande?.livraisonDue - frais1) < 0.01, `${ligneCommande?.livraisonDue}`);
check(
  'et au total',
  Math.abs(detail?.summary?.totalDue - (detail?.summary?.commission + frais1 + frais2)) < 0.01,
  JSON.stringify(detail?.summary)
);

await terminer();
