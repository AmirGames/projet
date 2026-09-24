// Les zones de livraison : des anneaux avec leurs frais et leur montant
// minimum, réellement appliqués à la commande.

import { inscription,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  put,
  del,
  terminer,
  sqlScalaire,
} from './outils.mjs';

await inscription({ email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` });

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;

// Place Bellecour, Lyon.
const BOUTIQUE = { latitude: 45.7578, longitude: 4.832 };

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Pizzeria ${uniq}`,
      slug: `pizzeria-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
      ...BOUTIQUE,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

// Les zones sont celles du commerçant qui livre lui-même : avec les livreurs
// de la plateforme, les frais suivent la distance et les zones ne jouent pas.
// Le commerçant coche « J'utilise ma propre livraison » dans ses réglages.
const propreLivraison = await put(`/api/store-settings/${storeId}`, { delivery: { useOwnDelivery: true } }, T);
check('le commerçant livre lui-même', propreLivraison.status < 400, `statut ${propreLivraison.status}`);

const produit = await j(
  await post('/api/products', { storeId, name: 'Margherita', price: 10, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

/** Un point à peu près à la distance voulue, plein nord de la boutique. */
const aKm = (km) => ({
  latitude: BOUTIQUE.latitude + km / 111.32,
  longitude: BOUTIQUE.longitude,
});

const commander = (position, quantite) =>
  post('/api/orders', {
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '2 rue de la Ré',
    deliveryCity: 'Lyon',
    deliveryLat: position?.latitude,
    deliveryLng: position?.longitude,
    totalAmount: 1,
    feesAmount: 0,
    items: [{ productId, quantity: quantite, price: 1 }],
  });

// ===== Sans zone : le forfait de la boutique =====

titre('Sans zone réglée');
const sansZone = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(2).latitude}&lng=${aKm(2).longitude}`));

check('la boutique livre quand même', sansZone?.data?.livrable === true, JSON.stringify(sansZone?.data));
check('le forfait boutique est signalé', sansZone?.data?.forfaitBoutique === true, JSON.stringify(sansZone?.data));

const avantZones = await commander(aKm(2), 1);
check('une commande passe', avantZones.status < 400, `statut ${avantZones.status}`);

// ===== Les anneaux =====

titre('Le commerçant règle ses anneaux');
const creerZone = (nom, rayon, frais, minimum, minutes) =>
  post(
    '/api/delivery-zones',
    { storeId, name: nom, radiusKm: rayon, baseFee: frais, minOrder: minimum, deliveryMinutes: minutes },
    T
  );

const proche = await j(await creerZone('Centre', 2, 2.5, 12, 20));
const moyenne = await j(await creerZone('Périphérie', 5, 4.5, 20, 35));
const loin = await j(await creerZone('Agglomération', 10, 7, 30, 50));

check('l’anneau proche est créé', Boolean(proche?.zone?.id), JSON.stringify(proche)?.slice(0, 200));
check('l’anneau moyen aussi', Boolean(moyenne?.zone?.id), JSON.stringify(moyenne)?.slice(0, 200));
check('le plus large aussi', Boolean(loin?.zone?.id), JSON.stringify(loin)?.slice(0, 200));

const enBase = await sqlScalaire(`SELECT COUNT(*) FROM "DeliveryZone" WHERE "storeId" = '${storeId}'`);
check('elles sont en base', enBase === '3', enBase);

const listees = await j(await get(`/api/delivery-zones?storeId=${storeId}`, T));
check(
  'elles sont rendues du plus petit au plus grand',
  listees?.zones?.map((zone) => zone.radiusKm).join(',') === '2,5,10',
  JSON.stringify(listees?.zones?.map((zone) => [zone.name, zone.radiusKm]))
);
check(
  'chacune porte ses frais et son minimum',
  listees?.zones?.every((zone) => typeof zone.baseFee === 'number' && typeof zone.minOrder === 'number'),
  JSON.stringify(listees?.zones)
);
check(
  'la durée annoncée est conservée',
  listees?.zones?.find((zone) => zone.name === 'Centre')?.deliveryMinutes === 20,
  JSON.stringify(listees?.zones?.find((zone) => zone.name === 'Centre'))
);

titre('Deux anneaux du même rayon');
const doublon = await creerZone('Doublon', 5, 3, 10, 20);
const corpsDoublon = await j(doublon);
check('le second est refusé', doublon.status === 409, `statut ${doublon.status}`);
check('le refus nomme celui qui occupe le rayon', /Périphérie/.test(corpsDoublon?.error || ''), corpsDoublon?.error);

check(
  'un rayon nul est refusé',
  (await creerZone('Nulle', 0, 3, 10, 20)).status === 400,
  'accepté à tort'
);
check(
  'des frais négatifs sont refusés',
  (await creerZone('Négative', 7, -3, 10, 20)).status === 400,
  'accepté à tort'
);

// ===== Le bon anneau s'applique =====

titre('L’anneau le plus petit qui contient l’adresse');
const verdictProche = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(1).latitude}&lng=${aKm(1).longitude}`));

check('à 1 km : zone Centre', verdictProche?.data?.zone?.name === 'Centre', JSON.stringify(verdictProche?.data));
check('ses frais sont ceux du Centre', verdictProche?.data?.frais === 2.5, `${verdictProche?.data?.frais}`);
check('son minimum aussi', verdictProche?.data?.minimum === 12, `${verdictProche?.data?.minimum}`);
check('la distance est rendue', verdictProche?.data?.distanceKm > 0.8 && verdictProche?.data?.distanceKm < 1.2, `${verdictProche?.data?.distanceKm}`);

const verdictMoyen = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(4).latitude}&lng=${aKm(4).longitude}`));
check('à 4 km : zone Périphérie', verdictMoyen?.data?.zone?.name === 'Périphérie', JSON.stringify(verdictMoyen?.data));
check('avec ses propres frais', verdictMoyen?.data?.frais === 4.5, `${verdictMoyen?.data?.frais}`);

const verdictLoin = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(8).latitude}&lng=${aKm(8).longitude}`));
check('à 8 km : zone Agglomération', verdictLoin?.data?.zone?.name === 'Agglomération', JSON.stringify(verdictLoin?.data));
check('son minimum est le plus élevé', verdictLoin?.data?.minimum === 30, `${verdictLoin?.data?.minimum}`);

titre('Hors de portée');
const dehors = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(25).latitude}&lng=${aKm(25).longitude}`));

check('l’adresse n’est pas livrable', dehors?.data?.livrable === false, JSON.stringify(dehors?.data));
check('aucune zone n’est rendue', dehors?.data?.zone === null, JSON.stringify(dehors?.data?.zone));
check(
  'le refus dit la distance et la portée',
  /km/.test(dehors?.data?.raison || '') && /10 km/.test(dehors?.data?.raison || ''),
  dehors?.data?.raison
);

titre('Sans coordonnées ni adresse');
const sansPoint = await j(await get(`/api/client/stores/${storeId}/zone-livraison`));
check('on ne devine pas la zone', sansPoint?.data?.livrable === false, JSON.stringify(sansPoint?.data));
check(
  'le message demande l’adresse',
  /[Ss]aisissez votre adresse/.test(sansPoint?.data?.raison || ''),
  sansPoint?.data?.raison
);

// ===== Appliqué à la commande =====

titre('Le minimum est appliqué');
// Une Margherita à 10 € dans la zone Centre, dont le minimum est 12 €.
const tropPetite = await commander(aKm(1), 1);
const corpsTropPetite = await j(tropPetite);

check('la commande est refusée', tropPetite.status === 400, `statut ${tropPetite.status}`);
check('le code le dit', corpsTropPetite?.code === 'DELIVERY_BELOW_MINIMUM', corpsTropPetite?.code);
check('le refus nomme la zone', /Centre/.test(corpsTropPetite?.error || ''), corpsTropPetite?.error);
check('il chiffre le minimum', /12/.test(corpsTropPetite?.error || ''), corpsTropPetite?.error);
check('et ce qui manque', /2[.,]00/.test(corpsTropPetite?.error || ''), corpsTropPetite?.error);

titre('Au-dessus du minimum');
const bonne = await j(await commander(aKm(1), 2));
const orderId = bonne.order?.id || bonne.id;
check('la commande passe', Boolean(orderId), JSON.stringify(bonne)?.slice(0, 200));

const frais = await sqlScalaire(`SELECT "feesAmount" FROM "Order" WHERE id = '${orderId}'`);
check('les frais de la zone sont facturés', Number(frais) === 2.5, frais);

const total = await sqlScalaire(`SELECT "totalAmount" FROM "Order" WHERE id = '${orderId}'`);
check('le total les comprend', Number(total) === 22.5, `${total} au lieu de 22.50`);

titre('Les frais suivent la zone');
// Même panier, plus loin : la zone Périphérie coûte 4,50 €.
const loinCommande = await j(await commander(aKm(4), 3));
const idLoin = loinCommande.order?.id || loinCommande.id;

const fraisLoin = await sqlScalaire(`SELECT "feesAmount" FROM "Order" WHERE id = '${idLoin}'`);
check('les frais de la zone éloignée sont facturés', Number(fraisLoin) === 4.5, fraisLoin);

const totalLoin = await sqlScalaire(`SELECT "totalAmount" FROM "Order" WHERE id = '${idLoin}'`);
check('le total suit', Number(totalLoin) === 34.5, `${totalLoin} au lieu de 34.50`);

titre('Des frais annoncés par le client sont ignorés');
const tricherie = await j(
  await post('/api/orders', {
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '2 rue',
    deliveryCity: 'Lyon',
    deliveryLat: aKm(4).latitude,
    deliveryLng: aKm(4).longitude,
    totalAmount: 1,
    feesAmount: 0,
    items: [{ productId, quantity: 3, price: 1 }],
  })
);
const idTricherie = tricherie.order?.id || tricherie.id;
const fraisTricherie = await sqlScalaire(`SELECT "feesAmount" FROM "Order" WHERE id = '${idTricherie}'`);
check('les frais annoncés à zéro sont remplacés', Number(fraisTricherie) === 4.5, fraisTricherie);

titre('Hors zone, la commande ne part pas');
const horsZone = await commander(aKm(25), 5);
const corpsHorsZone = await j(horsZone);
check('elle est refusée', horsZone.status === 400, `statut ${horsZone.status}`);
check('le code le dit', corpsHorsZone?.code === 'DELIVERY_OUT_OF_ZONE', corpsHorsZone?.code);

titre('Le retrait n’est pas concerné');
const retrait = await post('/api/orders', {
  storeId,
  customerName: `C ${uniq}`,
  customerEmail: `c-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 1,
  items: [{ productId, quantity: 1, price: 1 }],
});
check('une commande à emporter passe sous le minimum', retrait.status < 400, `statut ${retrait.status}`);

// ===== Désactiver une zone =====

titre('Désactiver un anneau');
await put(`/api/delivery-zones/${proche.zone.id}`, { isActive: false }, T);

const sansCentre = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(1).latitude}&lng=${aKm(1).longitude}`));
check(
  'l’anneau suivant prend le relais',
  sansCentre?.data?.zone?.name === 'Périphérie',
  JSON.stringify(sansCentre?.data?.zone)
);
check('avec ses frais', sansCentre?.data?.frais === 4.5, `${sansCentre?.data?.frais}`);

const grilleClient = await j(await get(`/api/client/stores/${storeId}/zones`));
check(
  'la zone désactivée n’est plus montrée au client',
  !grilleClient?.data?.some((zone) => zone.name === 'Centre'),
  JSON.stringify(grilleClient?.data?.map((zone) => zone.name))
);

await put(`/api/delivery-zones/${proche.zone.id}`, { isActive: true }, T);

// ===== Modifier, supprimer =====

titre('Modifier un anneau');
await put(`/api/delivery-zones/${proche.zone.id}`, { baseFee: 1.5, minOrder: 8 }, T);

const apresModif = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(1).latitude}&lng=${aKm(1).longitude}`));
check('les nouveaux frais s’appliquent', apresModif?.data?.frais === 1.5, `${apresModif?.data?.frais}`);
check('le nouveau minimum aussi', apresModif?.data?.minimum === 8, `${apresModif?.data?.minimum}`);

const desormaisPossible = await commander(aKm(1), 1);
check('une commande de 10 € passe maintenant', desormaisPossible.status < 400, `statut ${desormaisPossible.status}`);

titre('Supprimer un anneau');
const suppression = await del(`/api/delivery-zones/${loin.zone.id}`, null, T);
check('il disparaît', suppression.status === 200, `statut ${suppression.status}`);

const apresSuppression = await j(await get(`/api/client/stores/${storeId}/zone-livraison?lat=${aKm(8).latitude}&lng=${aKm(8).longitude}`));
check(
  'l’adresse qu’il couvrait n’est plus livrée',
  apresSuppression?.data?.livrable === false,
  JSON.stringify(apresSuppression?.data)
);

// ===== Qui peut régler quoi =====

titre('Un autre commerçant ne touche à rien');
const intrus = await j(
  await inscription({ email: `x-${uniq}@t.fr`, password: 'Password123!', name: `X ${uniq}` })
);
const TX = intrus.accessToken;

check(
  'il ne peut pas créer de zone',
  (await post('/api/delivery-zones', { storeId, name: 'Intrusion', radiusKm: 15, baseFee: 0, minOrder: 0 }, TX)).status === 403,
  'accepté à tort'
);
check(
  'ni en modifier une',
  (await put(`/api/delivery-zones/${proche.zone.id}`, { baseFee: 0 }, TX)).status === 403,
  'accepté à tort'
);
check(
  'ni en supprimer',
  (await del(`/api/delivery-zones/${proche.zone.id}`, null, TX)).status === 403,
  'accepté à tort'
);
check(
  'ni lister celles d’un autre',
  (await get(`/api/delivery-zones?storeId=${storeId}`, TX)).status === 403,
  'accepté à tort'
);

const inchangee = await sqlScalaire(`SELECT "baseFee" FROM "DeliveryZone" WHERE id = '${proche.zone.id}'`);
check('rien n’a bougé', Number(inchangee) === 1.5, inchangee);

check(
  'un anonyme ne peut rien écrire',
  (await post('/api/delivery-zones', { storeId, name: 'Anonyme', radiusKm: 20, baseFee: 0, minOrder: 0 })).status === 401,
  'accepté à tort'
);

titre('La grille reste publique');
check(
  'un visiteur peut consulter les zones',
  (await get(`/api/client/stores/${storeId}/zones`)).status === 200,
  'refusé à tort'
);

await terminer();
