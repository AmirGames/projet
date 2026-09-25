// Chacun chez soi : aucune route de l'espace commerçant ne doit accepter le
// storeId d'un autre.

import { inscription,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  put,
  patch,
  del,
  terminer,
  sqlScalaire,
} from './outils.mjs';

await inscription({ email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` });

/** Un commerçant avec sa boutique et son catalogue. */
async function installer(suffixe) {
  const compte = await j(
    await inscription({
      email: `m${suffixe}-${uniq}@t.fr`,
      password: 'Password123!',
      name: `M${suffixe} ${uniq}`,
    })
  );
  const jeton = compte.accessToken;

  const boutique = await j(
    await post(
      '/api/stores',
      {
        orgId: compte.organization.id,
        name: `Boutique ${suffixe} ${uniq}`,
        slug: `boutique${suffixe.toLowerCase()}-${uniq}`,
        address: '1 place Bellecour',
        city: 'Lyon',
        postalCode: '69002',
        phone: '0400000000',
        latitude: 45.7578,
        longitude: 4.832,
      },
      jeton
    )
  );
  const storeId = boutique.store?.id || boutique.id;

  const produit = await j(
    await post('/api/products', { storeId, name: `Plat ${suffixe} ${uniq}`, price: 12, status: 'ACTIVE' }, jeton)
  );
  const categorie = await j(await post('/api/categories', { storeId, name: `Catégorie ${suffixe}` }, jeton));
  const zone = await j(
    await post('/api/delivery-zones', { storeId, name: `Zone ${suffixe}`, radiusKm: 5, baseFee: 3, minOrder: 10 }, jeton)
  );
  const promo = await j(
    await post('/api/promotions', { storeId, code: `PROMO${suffixe}${uniq}`, type: 'PERCENTAGE', discountValue: 10 }, jeton)
  );

  const commande = await j(
    await post('/api/orders', { conditionsAcceptees: true,
      storeId,
      customerName: `C ${uniq}`,
      customerEmail: `c${suffixe}-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'PICKUP',
      totalAmount: 12,
      items: [{ productId: produit.product?.id || produit.id, quantity: 1, price: 12 }],
    })
  );

  return {
    jeton,
    userId: compte.user.id,
    orgId: compte.organization.id,
    storeId,
    productId: produit.product?.id || produit.id,
    categoryId: categorie.category?.id || categorie.data?.id || categorie.id,
    zoneId: zone.zone?.id || zone.id,
    promoId: promo.promotion?.id || promo.data?.id || promo.id,
    orderId: commande.order?.id || commande.id,
  };
}

const alice = await installer('A');
const bob = await installer('B');

// ===== Ce qu'un intrus tentait, et réussissait =====

/**
 * Toutes les façons d'annoncer la boutique d'un autre : dans le corps, dans la
 * requête, dans le chemin.
 */
const TENTATIVES = [
  // Le corps de la requête
  ['créer un produit chez l’autre', () => post('/api/products', { storeId: alice.storeId, name: 'Intrusion', price: 1 }, bob.jeton)],
  ['créer une catégorie chez l’autre', () => post('/api/categories', { storeId: alice.storeId, name: 'Intrusion' }, bob.jeton)],
  ['créer une promotion chez l’autre', () => post('/api/promotions', { storeId: alice.storeId, code: `VOL${uniq}`, type: 'PERCENTAGE', discountValue: 50 }, bob.jeton)],
  ['créer une zone chez l’autre', () => post('/api/delivery-zones', { storeId: alice.storeId, name: 'Intrusion', radiusKm: 9, baseFee: 0, minOrder: 0 }, bob.jeton)],
  ['créer une taxe chez l’autre', () => post(`/api/tax-settings/${alice.storeId}`, { name: 'Vol', rate: 99, applicableTo: 'all' }, bob.jeton)],

  // La requête
  ['lire les produits de l’autre', () => get(`/api/products?storeId=${alice.storeId}`, bob.jeton)],
  ['lire les commandes de l’autre', () => get(`/api/orders?storeId=${alice.storeId}`, bob.jeton)],
  ['lire les clients de l’autre', () => get(`/api/customers/${alice.storeId}`, bob.jeton)],
  ['lire les zones de l’autre', () => get(`/api/delivery-zones?storeId=${alice.storeId}`, bob.jeton)],
  ['lire les avis de l’autre', () => get(`/api/reviews?storeId=${alice.storeId}`, bob.jeton)],

  // Le chemin
  ['lire les horaires de l’autre', () => get(`/api/store-hours/${alice.storeId}`, bob.jeton)],
  ['changer les horaires de l’autre', () => put(`/api/store-hours/${alice.storeId}/day/MON`, { open: '00:00', close: '23:59', closed: false }, bob.jeton)],
  ['fermer la boutique de l’autre', () => patch(`/api/store-hours/${alice.storeId}/status`, { isOpen: false }, bob.jeton)],
  ['lire les réglages de l’autre', () => get(`/api/store-settings/${alice.storeId}`, bob.jeton)],
  ['lire les rapports de l’autre', () => get(`/api/reports/sales?storeId=${alice.storeId}`, bob.jeton)],
  ['lire les étiquettes de l’autre', () => get(`/api/product-tags/${alice.storeId}`, bob.jeton)],
  ['lire les moyens de paiement de l’autre', () => get(`/api/payment-methods/${alice.storeId}`, bob.jeton)],
  ['lire le marketing de l’autre', () => get(`/api/marketing/campaigns?storeId=${alice.storeId}`, bob.jeton)],
  ['lire l’équipe de l’autre', () => get(`/api/staff?storeId=${alice.storeId}`, bob.jeton)],

  // Le chemin, quand l'identifiant n'est pas en première position
  ['lire les avis de l’autre par le chemin', () => get(`/api/reviews/${alice.storeId}`, bob.jeton)],
  ['signaler un avis de l’autre', () => post(`/api/reviews/${alice.storeId}/x/report`, { reason: 'Intrusion dans la boutique voisine' }, bob.jeton)],
  ['lire les factures de l’autre', () => get(`/api/invoices/${alice.storeId}`, bob.jeton)],
  ['lire le chiffre d’affaires de l’autre', () => get(`/api/invoices/${alice.storeId}/stats/revenue`, bob.jeton)],
  ['lire les commandes de l’autre par le chemin', () => get(`/api/order-management/${alice.storeId}`, bob.jeton)],
  ['changer l’état d’une commande de l’autre', () => patch(`/api/order-management/${alice.storeId}/${alice.orderId}/status`, { status: 'READY' }, bob.jeton)],
  ['lire la journée de l’autre', () => get(`/api/order-management/${alice.storeId}/today`, bob.jeton)],
  ['lire les stocks bas de l’autre', () => get(`/api/products/low-stock/by-store/${alice.storeId}`, bob.jeton)],
  ['lire les stocks bas de l’autre par organisation', () => get(`/api/products/low-stock/by-org/${alice.orgId}`, bob.jeton)],
  ['lire les commandes d’une boutique de l’autre', () => get(`/api/orders/store/${alice.storeId}`, bob.jeton)],
  ['lire l’état des commandes de l’autre', () => get(`/api/orders/status/${alice.storeId}`, bob.jeton)],

  // La ressource désignée par son propre identifiant
  ['modifier un produit de l’autre', () => put(`/api/products/${alice.productId}`, { name: 'Volé' }, bob.jeton)],
  ['supprimer un produit de l’autre', () => del(`/api/products/${alice.productId}`, null, bob.jeton)],
  ['épuiser un produit de l’autre', () => patch(`/api/products/${alice.productId}/availability`, { isAvailable: false, storeId: bob.storeId }, bob.jeton)],
  ['modifier une catégorie de l’autre', () => put(`/api/categories/${alice.categoryId}`, { name: 'Volée' }, bob.jeton)],
  ['modifier une zone de l’autre', () => put(`/api/delivery-zones/${alice.zoneId}`, { baseFee: 0 }, bob.jeton)],
  ['supprimer une zone de l’autre', () => del(`/api/delivery-zones/${alice.zoneId}`, null, bob.jeton)],
  ['modifier la boutique de l’autre', () => put(`/api/stores/${alice.storeId}`, { name: 'Volée' }, bob.jeton)],
  ['supprimer la boutique de l’autre', () => del(`/api/stores/${alice.storeId}`, null, bob.jeton)],
  ['modifier l’organisation de l’autre', () => put(`/api/organizations/${alice.orgId}`, { name: 'Volée' }, bob.jeton)],
  ['lire l’organisation de l’autre', () => get(`/api/organizations/${alice.orgId}`, bob.jeton)],
  ['voir la formule de l’autre', () => get(`/api/plans/${alice.orgId}`, bob.jeton)],
  ['voir le quota de l’autre', () => get(`/api/stores/org/${alice.orgId}/quota`, bob.jeton)],
];

titre('Un commerçant chez son voisin');
const passees = [];

for (const [nom, appel] of TENTATIVES) {
  const reponse = await appel();
  const refusee = reponse.status === 403;

  check(nom, refusee, `statut ${reponse.status}`);
  if (!refusee) passees.push([nom, reponse.status]);
}

check('aucune tentative ne passe', passees.length === 0, JSON.stringify(passees));

titre('Et rien n’a bougé');
const nomProduit = await sqlScalaire(`SELECT "name" FROM "Product" WHERE id = '${alice.productId}'`);
check('le produit garde son nom', nomProduit === `Plat A ${uniq}`, nomProduit);

const existeProduit = await sqlScalaire(`SELECT COUNT(*) FROM "Product" WHERE id = '${alice.productId}'`);
check('il n’a pas été supprimé', existeProduit === '1', existeProduit);

const dispo = await sqlScalaire(`SELECT "isAvailable" FROM "Product" WHERE id = '${alice.productId}'`);
check('il n’a pas été épuisé', dispo === 'true', dispo);

const nomBoutique = await sqlScalaire(`SELECT "name" FROM "Store" WHERE id = '${alice.storeId}'`);
check('la boutique garde son nom', nomBoutique === `Boutique A ${uniq}`, nomBoutique);

const supprimee = await sqlScalaire(`SELECT "deletedAt" FROM "Store" WHERE id = '${alice.storeId}'`);
check('elle n’a pas été supprimée', supprimee === '', supprimee);

const nomOrg = await sqlScalaire(`SELECT "name" FROM "Organization" WHERE id = '${alice.orgId}'`);
check('l’organisation garde son nom', nomOrg !== 'Volée', nomOrg);

const fraisZone = await sqlScalaire(`SELECT "baseFee" FROM "DeliveryZone" WHERE id = '${alice.zoneId}'`);
check('la zone garde ses frais', Number(fraisZone) === 3, fraisZone);

const produitsIntrus = await sqlScalaire(
  `SELECT COUNT(*) FROM "Product" WHERE "storeId" = '${alice.storeId}' AND "name" = 'Intrusion'`
);
check('aucun produit intrus n’a été créé', produitsIntrus === '0', produitsIntrus);

const zonesIntruses = await sqlScalaire(
  `SELECT COUNT(*) FROM "DeliveryZone" WHERE "storeId" = '${alice.storeId}' AND "name" = 'Intrusion'`
);
check('aucune zone intruse n’a été créée', zonesIntruses === '0', zonesIntruses);

// ===== Le locataire légitime travaille normalement =====

/** Les mêmes gestes, mais chez soi. */
const CHEZ_SOI = [
  ['créer un produit', () => post('/api/products', { storeId: bob.storeId, name: `Nouveau ${uniq}`, price: 9 }, bob.jeton)],
  ['créer une catégorie', () => post('/api/categories', { storeId: bob.storeId, name: `Cat ${uniq}` }, bob.jeton)],
  ['créer une zone', () => post('/api/delivery-zones', { storeId: bob.storeId, name: `Zone bis ${uniq}`, radiusKm: 8, baseFee: 5, minOrder: 15 }, bob.jeton)],
  ['lire ses produits', () => get(`/api/products?storeId=${bob.storeId}`, bob.jeton)],
  ['lire ses commandes', () => get(`/api/orders?storeId=${bob.storeId}`, bob.jeton)],
  ['lire ses clients', () => get(`/api/customers/${bob.storeId}`, bob.jeton)],
  ['lire ses zones', () => get(`/api/delivery-zones?storeId=${bob.storeId}`, bob.jeton)],
  ['lire ses horaires', () => get(`/api/store-hours/${bob.storeId}`, bob.jeton)],
  ['changer ses horaires', () => put(`/api/store-hours/${bob.storeId}/day/TUE`, { open: '09:00', close: '18:00', closed: false }, bob.jeton)],
  ['lire ses réglages', () => get(`/api/store-settings/${bob.storeId}`, bob.jeton)],
  ['lire ses rapports', () => get(`/api/reports/sales?storeId=${bob.storeId}`, bob.jeton)],
  ['modifier son produit', () => put(`/api/products/${bob.productId}`, { name: `Renommé ${uniq}` }, bob.jeton)],
  ['épuiser son produit', () => patch(`/api/products/${bob.productId}/availability`, { isAvailable: false, storeId: bob.storeId }, bob.jeton)],
  ['modifier sa catégorie', () => put(`/api/categories/${bob.categoryId}`, { name: `Renommée ${uniq}` }, bob.jeton)],
  ['modifier sa zone', () => put(`/api/delivery-zones/${bob.zoneId}`, { baseFee: 4 }, bob.jeton)],
  ['modifier sa boutique', () => put(`/api/stores/${bob.storeId}`, { name: `Boutique B ${uniq} bis` }, bob.jeton)],
  ['lire ses avis par le chemin', () => get(`/api/reviews/${bob.storeId}`, bob.jeton)],
  ['lire ses factures', () => get(`/api/invoices/${bob.storeId}`, bob.jeton)],
  ['lire son chiffre d’affaires', () => get(`/api/invoices/${bob.storeId}/stats/revenue`, bob.jeton)],
  ['lire ses commandes par le chemin', () => get(`/api/order-management/${bob.storeId}`, bob.jeton)],
  ['lire sa journée', () => get(`/api/order-management/${bob.storeId}/today`, bob.jeton)],
  ['lire ses moyens de paiement actifs', () => get(`/api/payment-methods/${bob.storeId}/active`, bob.jeton)],
  ['lire ses stocks bas', () => get(`/api/products/low-stock/by-store/${bob.storeId}`, bob.jeton)],
  ['lire ses stocks bas par organisation', () => get(`/api/products/low-stock/by-org/${bob.orgId}`, bob.jeton)],
  ['lire les commandes de sa boutique', () => get(`/api/orders/store/${bob.storeId}`, bob.jeton)],
  ['lire son organisation', () => get(`/api/organizations/${bob.orgId}`, bob.jeton)],
  ['voir sa formule', () => get(`/api/plans/${bob.orgId}`, bob.jeton)],
  ['voir son quota', () => get(`/api/stores/org/${bob.orgId}/quota`, bob.jeton)],
];

titre('Chez soi, rien ne change');
const bloquees = [];

for (const [nom, appel] of CHEZ_SOI) {
  const reponse = await appel();
  const passe = reponse.status < 400;

  check(nom, passe, `statut ${reponse.status} ${JSON.stringify(await j(reponse))?.slice(0, 120)}`);
  if (!passe) bloquees.push([nom, reponse.status]);
}

check('aucun geste légitime n’est bloqué', bloquees.length === 0, JSON.stringify(bloquees));

const renomme = await sqlScalaire(`SELECT "name" FROM "Product" WHERE id = '${bob.productId}'`);
check('sa modification a bien pris', renomme === `Renommé ${uniq}`, renomme);

// ===== La vitrine reste publique =====

titre('La vitrine ne demande pas de compte');
check(
  'le menu d’une boutique est public',
  (await get(`/api/client/stores/${alice.storeId}`)).status === 200,
  'refusé à tort'
);
check(
  'les zones sont publiques',
  (await get(`/api/client/stores/${alice.storeId}/zones`)).status === 200,
  'refusé à tort'
);
check(
  'les créneaux de retrait sont publics',
  (await get(`/api/client/stores/${alice.storeId}/pickup-slots`)).status === 200,
  'refusé à tort'
);
check(
  'les déclinaisons sont publiques',
  (await get(`/api/products/${alice.productId}/variants`)).status === 200,
  'refusé à tort'
);

titre('Un client commande sans compte');
const commandeClient = await post('/api/orders', { conditionsAcceptees: true,
  storeId: alice.storeId,
  customerName: `Visiteur ${uniq}`,
  customerEmail: `v-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 12,
  items: [{ productId: alice.productId, quantity: 1, price: 12 }],
});
check('la commande passe', commandeClient.status < 400, `statut ${commandeClient.status}`);

// ===== Un client connecté n'est pas un intrus =====

// Le piège du cloisonnement : un client n'appartient à aucune organisation. Pris
// au mot, le verrou lui refusait tout — commander et suivre sa commande chez un
// commerçant compris, alors que le même geste passait sans compte.
titre('Un client connecté commande et suit sa commande');
const clientConnecte = await j(
  await inscription({
    email: `cl-${uniq}@t.fr`,
    password: 'Password123!',
    name: `Client ${uniq}`,
  })
);
const TC = clientConnecte.accessToken;

const sienne = await post(
  '/api/orders',
  { conditionsAcceptees: true,
    storeId: alice.storeId,
    customerName: `Client ${uniq}`,
    customerEmail: `cl-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 12,
    items: [{ productId: alice.productId, quantity: 1, price: 12 }],
  },
  TC
);
check('il peut commander', sienne.status < 400, `statut ${sienne.status}`);

const corpsSienne = await j(sienne);
const idSienne = corpsSienne?.order?.id || corpsSienne?.id;

check(
  'il peut suivre sa commande',
  (await get(`/api/orders/${idSienne}`, TC)).status === 200,
  'refusé à tort'
);
check(
  'il peut lire le plat qu’il a commandé',
  (await get(`/api/products/${alice.productId}`, TC)).status === 200,
  'refusé à tort'
);
check(
  'il peut lire ses déclinaisons',
  (await get(`/api/products/${alice.productId}/variants`, TC)).status === 200,
  'refusé à tort'
);
check(
  'il peut retrouver la boutique par son nom d’adresse',
  (await get(`/api/stores/slug/boutiquea-${uniq}`, TC)).status === 200,
  'refusé à tort'
);

titre('Mais il n’entre pas dans l’arrière-boutique');
check(
  'il ne lit pas les commandes de la boutique',
  (await get(`/api/orders?storeId=${alice.storeId}`, TC)).status === 403,
  'passé à tort'
);
check(
  'il ne change pas l’état de sa commande',
  (await patch(`/api/orders/${idSienne}/status`, { status: 'DELIVERED' }, TC)).status === 403,
  'passé à tort'
);
check(
  'il ne crée pas de produit',
  (await post('/api/products', { storeId: alice.storeId, name: 'Intrusion', price: 1 }, TC)).status === 403,
  'passé à tort'
);

const etatSienne = await sqlScalaire(`SELECT "status" FROM "Order" WHERE id = '${idSienne}'`);
check('sa commande garde son état', etatSienne === 'PENDING', etatSienne);

// ===== La plateforme garde la main =====

titre('La plateforme n’est pas cloisonnée');
const plateforme = await j(
  await post('/api/auth/login', { email: `p-${uniq}@t.fr`, password: 'Password123!' })
);
const TP = plateforme.accessToken;

check(
  'elle lit tous les commerçants',
  (await get('/api/superowner/organizations', TP)).status === 200,
  'bloquée à tort'
);
check(
  'elle lit la boutique d’un commerçant',
  (await get(`/api/stores/${alice.storeId}`, TP)).status === 200,
  'bloquée à tort'
);
check(
  'elle lit les produits d’un commerçant',
  (await get(`/api/products?storeId=${alice.storeId}`, TP)).status === 200,
  'bloquée à tort'
);

// ===== Une organisation au nom d'un autre =====

titre('Une organisation ne se crée qu’au nom de l’appelant');
// La route prenait le compte dans le corps : Bob pouvait faire d'Alice
// l'administratrice d'une organisation qu'elle n'avait jamais demandée.
const imposee = await j(
  await post('/api/organizations', { name: `Imposée ${uniq}`, slug: `imposee-${uniq}`, userId: alice.userId }, bob.jeton)
);
const idImposee = imposee?.org?.id;
check('la création aboutit', !!idImposee, JSON.stringify(imposee));
check(
  'Alice n’en est pas membre',
  (await sqlScalaire(`SELECT count(*) FROM "Membership" WHERE "orgId" = '${idImposee}' AND "userId" = '${alice.userId}'`)) === '0'
);
check(
  'elle revient à Bob, qui l’a créée',
  (await sqlScalaire(`SELECT count(*) FROM "Membership" WHERE "orgId" = '${idImposee}' AND "userId" = '${bob.userId}'`)) === '1'
);

// ===== Le message du refus =====

titre('Le refus est lisible');
const corps = await j(await get(`/api/products?storeId=${alice.storeId}`, bob.jeton));
check('il est en français', /autre commerçant/i.test(corps?.error || ''), corps?.error);
check('il porte un code', corps?.code === 'CROSS_TENANT_DENIED', corps?.code);

titre('Une boutique inexistante reste un 404');
// Un identifiant inconnu n'est pas une intrusion : la route doit pouvoir le
// dire, sinon on ne distingue plus une faute de frappe d'un vol.
const inconnue = await get('/api/store-hours/cmuinexistantxxxxxxxxxx', bob.jeton);
check('ce n’est pas un refus de cloisonnement', inconnue.status !== 403, `statut ${inconnue.status}`);

await terminer();
