// Une boutique naît située : sans coordonnées, personne ne la livre.
//
// La suite lance sa propre API branchée sur le faux service d'adresses : le
// fournisseur réel est sur Internet, et la vérification porte sur ce que fait
// la plateforme d'une adresse, pas sur la disponibilité d'un tiers.

import { inscription, titre, check, uniq, terminer, sqlScalaire } from './outils.mjs';
import { ouvrirApiGeocodante } from './api-geocodante.mjs';

const MDP = 'Password123!';

const api = await ouvrirApiGeocodante();
const { post, get } = api;

const j = async (reponse) => {
  try {
    return await reponse.json();
  } catch {
    return null;
  }
};

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

// ===== La création =====

titre('Créer une boutique la situe');
/**
 * Elle naissait sans coordonnées dès que le formulaire n'en fournissait pas.
 * Le commerçant créait son commerce, réglait ses zones de livraison, et aucun
 * livreur ne venait jamais — sans que rien ne le lui dise.
 */
const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Resto ${uniq}`,
      slug: `resto-${uniq}`,
      address: '20 Rue de la République',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;
check('la boutique est créée', !!storeId, JSON.stringify(boutique)?.slice(0, 200));

const latitude = await sqlScalaire(`SELECT latitude FROM "Store" WHERE id = '${storeId}'`);
check('elle a une latitude', latitude !== '', latitude);
check('qui situe bien à Lyon', latitude.startsWith('45.7'), latitude);

const longitude = await sqlScalaire(`SELECT longitude FROM "Store" WHERE id = '${storeId}'`);
check('et une longitude', longitude.startsWith('4.8'), longitude);

titre('La plateforme ne la signale plus');
const fiche = await j(await get(`/api/superowner/stores/${storeId}`, TP));
check('la fiche la dit située', fiche?.store?.situee === true, `${fiche?.store?.situee}`);

titre('Elle reçoit donc une course');
// C'est tout l'enjeu : l'attribution écarte une boutique sans coordonnées.
const produit = await j(
  await post('/api/products', { storeId, name: `Plat ${uniq}`, price: 15, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

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
    items: [{ productId, quantity: 1, price: 15 }],
  })
);
const orderId = commande.order?.id || commande.id;

const recherche = await post(`/api/orders/${orderId}/dispatch`, {}, T);
const lu = await j(recherche);
// Aucun livreur n'est en ligne ici : ce qu'on vérifie, c'est que la recherche
// aboutit au lieu d'être refusée faute de coordonnées.
check('la recherche de livreur aboutit', recherche.status < 400, `statut ${recherche.status}`);
check(
  'et ne se plaint pas de coordonnées manquantes',
  !/coordonnées/i.test(lu?.error || ''),
  lu?.error
);

// ===== Les coordonnées données priment =====

titre('Des coordonnées fournies sont respectées');
const voisin = await j(
  await inscription({ email: `v-${uniq}@t.fr`, password: MDP, name: `V ${uniq}` })
);

const precise = await j(
  await post(
    '/api/stores',
    {
      orgId: voisin.organization.id,
      name: `Precise ${uniq}`,
      slug: `precise-${uniq}`,
      address: '20 Rue de la République',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000001',
      latitude: 48.8566,
      longitude: 2.3522,
    },
    voisin.accessToken
  )
);
const preciseId = precise.store?.id || precise.id;

const latitudePrecise = await sqlScalaire(`SELECT latitude FROM "Store" WHERE id = '${preciseId}'`);
check('le géocodage ne les écrase pas', latitudePrecise.startsWith('48.85'), latitudePrecise);

// ===== Une adresse introuvable ne bloque pas =====

titre('Une adresse qu’on ne sait pas situer n’empêche pas d’ouvrir');
// Un service d'adresses en panne ne doit pas empêcher d'ouvrir un commerce :
// la fiche de la plateforme le signalera.
api.adresses.tomberEnPanne();

const tiers = await j(
  await inscription({ email: `t-${uniq}@t.fr`, password: MDP, name: `T ${uniq}` })
);

const enPanne = await post(
  '/api/stores',
  {
    orgId: tiers.organization.id,
    name: `Sans adresse ${uniq}`,
    slug: `sans-adresse-${uniq}`,
    address: '3 rue Inconnue',
    city: 'Nulle Part',
    postalCode: '00000',
    phone: '0400000002',
  },
  tiers.accessToken
);
check('la création passe quand même', enPanne.status === 201, `statut ${enPanne.status}`);

const sansId = (await j(enPanne))?.store?.id;
const ficheSans = await j(await get(`/api/superowner/stores/${sansId}`, TP));
check('et la plateforme la signale', ficheSans?.store?.situee === false, `${ficheSans?.store?.situee}`);

api.adresses.tomberEnPanne(false);

await api.fermer();
await terminer();
