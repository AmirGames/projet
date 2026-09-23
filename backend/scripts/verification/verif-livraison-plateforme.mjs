// Qui livre : le commerçant avec ses propres livreurs, ou les livreurs de la
// plateforme. Le choix décide de la commission, du rayon, des frais de
// livraison et de ce que touche le livreur.

import {
  titre,
  check,
  j,
  uniq,
  post,
  put,
  patch,
  get,
  sqlScalaire,
  sqlExec,
  terminer,
  validerLivreur,
} from './outils.mjs';

// Place Bellecour, Lyon.
const BOUTIQUE = { latitude: 45.7578, longitude: 4.832 };

/** Un point à peu près à la distance voulue, plein nord de la boutique. */
const aKm = (km) => ({ latitude: BOUTIQUE.latitude + km / 111.32, longitude: BOUTIQUE.longitude });

// ===== La plateforme =====

const plateforme = await j(
  await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` })
);
await sqlExec(`UPDATE "User" SET "isSuperOwner" = true WHERE email = 'p-${uniq}@t.fr'`);
const S = plateforme.accessToken;

// Rayon de 5 km, 2 € la course plus 1 € du kilomètre.
const config = await put(
  '/api/superowner/system-config',
  { driverMaxRadiusKm: 5, driverBaseFee: 2, driverPerKmFee: 1 },
  S
);
check('la configuration est enregistrée', config.status < 400, `statut ${config.status}`);

// ===== Les formules =====

titre('La commission des livreurs de la plateforme');
const trop = await patch('/api/superowner/plans/FREE', { commission: 8, commissionLivreursPlateforme: 6 }, S);
check('inférieure à la commission de base : refusée', trop.status === 400, `statut ${trop.status}`);

const reglee = await j(
  await patch('/api/superowner/plans/FREE', { commission: 8, commissionLivreursPlateforme: 15 }, S)
);
check('réglée à 15 %', reglee?.data?.commissionLivreursPlateforme === 15, JSON.stringify(reglee?.data));

const grille = await j(await get('/api/superowner/plans', S));
check(
  'la grille la rend',
  grille?.data?.find((f) => f.code === 'FREE')?.commissionLivreursPlateforme === 15,
  JSON.stringify(grille?.data?.[0])
);

// ===== Le commerçant =====

const inscription = await j(
  await post('/api/auth/merchant-register', {
    businessName: `Pizzeria ${uniq}`,
    email: `m-${uniq}@t.fr`,
    password: 'Password123!',
    businessType: 'restaurant',
    phone: '0400000000',
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    description: 'Pizzas',
    storeName: `Pizzeria ${uniq}`,
    storeSlug: `pizzeria-${uniq}`,
  })
);
const T = inscription.accessToken;
const storeId = inscription.store?.id;
const orgId = await sqlScalaire(`SELECT "orgId" FROM "Store" WHERE id = '${storeId}'`);

// Validé, ouvert, situé, et livrant : ce script ne vérifie pas ces verrous-là.
await sqlExec(`UPDATE "Organization" SET "approvedAt" = NOW(), tier = 'FREE' WHERE id = '${orgId}'`);
await sqlExec(
  `UPDATE "Store" SET "isOpen" = true, "acceptsDelivery" = true, "minDeliveryAmount" = 0,
     latitude = ${BOUTIQUE.latitude}, longitude = ${BOUTIQUE.longitude} WHERE id = '${storeId}'`
);

const produit = await j(await post('/api/products', { storeId, name: 'Margherita', price: 20, status: 'ACTIVE' }, T));
const productId = produit.product?.id || produit.id;

// Une zone du commerçant : elle ne vaut que s'il livre lui-même.
await post('/api/delivery-zones', { storeId, name: 'Ville', radiusKm: 10, baseFee: 1, minOrder: 0 }, T);

const formule = await j(await get(`/api/plans/${orgId}`, T));
check('le commerçant voit ses deux taux', formule?.data?.quota?.tierCommission === 8 &&
  formule?.data?.quota?.tierPlatformDeliveryCommission === 15, JSON.stringify(formule?.data?.quota));

const verdict = async (km) =>
  (await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(km).latitude}&lng=${aKm(km).longitude}`)))?.data;

const commander = (km) =>
  post('/api/orders', {
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '2 rue de la Ré',
    deliveryCity: 'Lyon',
    deliveryLat: aKm(km).latitude,
    deliveryLng: aKm(km).longitude,
    totalAmount: 1,
    feesAmount: 0,
    items: [{ productId, quantity: 1, price: 1 }],
  });

// ===== Par défaut : les livreurs de la plateforme =====

titre('Livreurs de la plateforme : rayon et frais de la plateforme');
const pres = await verdict(3);
check('le mode est PLATFORM', pres?.mode === 'PLATFORM', JSON.stringify(pres));
check('à 3 km : livrable', pres?.livrable === true, JSON.stringify(pres));
check('la zone du commerçant est ignorée', pres?.zone === null, JSON.stringify(pres?.zone));
check(
  'les frais suivent la distance : 2 € + 1 €/km',
  Math.abs(pres?.frais - (2 + pres?.distanceKm)) < 0.011 && pres?.frais > 4.9 && pres?.frais < 5.1,
  `${pres?.frais} pour ${pres?.distanceKm} km`
);

const loin = await verdict(7);
check('à 7 km : hors du rayon de la plateforme', loin?.livrable === false, JSON.stringify(loin));
check('le refus cite le rayon', /5 km/.test(loin?.raison || ''), loin?.raison);

titre('La commande avec un livreur de la plateforme');
const cmdPlateforme = await j(await commander(3));
const idPlateforme = cmdPlateforme.order?.id || cmdPlateforme.id;
check('la commande passe', Boolean(idPlateforme), JSON.stringify(cmdPlateforme)?.slice(0, 200));

const fraisPlateforme = Number(await sqlScalaire(`SELECT "feesAmount" FROM "Order" WHERE id = '${idPlateforme}'`));
check('les frais facturés sont ceux du verdict', Math.abs(fraisPlateforme - pres?.frais) < 0.011, `${fraisPlateforme}`);
check('le mode est figé', (await sqlScalaire(`SELECT "deliveryMode" FROM "Order" WHERE id = '${idPlateforme}'`)) === 'PLATFORM');
check('le taux majoré s’applique', Number(await sqlScalaire(`SELECT "commissionPercent" FROM "Order" WHERE id = '${idPlateforme}'`)) === 15);
const commissionPlateforme = Number(await sqlScalaire(`SELECT "commissionAmount" FROM "Order" WHERE id = '${idPlateforme}'`));
check('hors frais de livraison : 15 % de 20 €', commissionPlateforme === 3, `${commissionPlateforme}`);

titre('Le livreur touche les frais payés par le client');
const livreur = await j(
  await post('/api/drivers/register', {
    name: `L ${uniq}`,
    email: `l-${uniq}@t.fr`,
    password: 'Password123!',
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  })
);
await validerLivreur(livreur.accessToken, S);
await patch('/api/drivers/availability', { isAvailable: true, isOnline: true }, livreur.accessToken);
await patch('/api/drivers/location', aKm(0.3), livreur.accessToken);

const envoi = await j(await post(`/api/orders/${idPlateforme}/dispatch`, {}, T));
check('la course est proposée', envoi?.data?.propose === true, JSON.stringify(envoi));
const payout = Number(await sqlScalaire(
  `SELECT o.payout FROM "DeliveryOffer" o JOIN "OrderDelivery" d ON d.id = o."deliveryId" WHERE d."orderId" = '${idPlateforme}'`
));
check('sa paie égale les frais de livraison', Math.abs(payout - fraisPlateforme) < 0.001, `${payout} ≠ ${fraisPlateforme}`);

// ===== Le commerçant livre lui-même =====

titre('Propre livraison : zones et commission de la formule');
const bascule = await put(`/api/store-settings/${storeId}`, { delivery: { useOwnDelivery: true } }, T);
check('le réglage est enregistré', bascule.status < 400, `statut ${bascule.status}`);

const propre = await verdict(7);
check('le mode est OWN', propre?.mode === 'OWN', JSON.stringify(propre));
check('à 7 km : livrable par sa zone de 10 km', propre?.livrable === true && propre?.zone?.name === 'Ville', JSON.stringify(propre));
check('ses frais sont ceux de la zone', propre?.frais === 1, `${propre?.frais}`);

const cmdPropre = await j(await commander(7));
const idPropre = cmdPropre.order?.id || cmdPropre.id;
check('la commande passe', Boolean(idPropre), JSON.stringify(cmdPropre)?.slice(0, 200));
check('le mode est figé', (await sqlScalaire(`SELECT "deliveryMode" FROM "Order" WHERE id = '${idPropre}'`)) === 'OWN');
check('le taux de la formule s’applique', Number(await sqlScalaire(`SELECT "commissionPercent" FROM "Order" WHERE id = '${idPropre}'`)) === 8);

const refus = await post(`/api/orders/${idPropre}/dispatch`, {}, T);
const corpsRefus = await j(refus);
check('pas de livreur de la plateforme pour cette commande', refus.status === 400 && corpsRefus?.code === 'OWN_DELIVERY', `${refus.status} ${corpsRefus?.code}`);

await terminer();
