// Ce que porte une commande : catégorie, déclinaison, code promo, moyen de
// paiement — et qui les calcule.

import { inscription, titre, check, j, uniq, post, get, patch, terminer, sqlScalaire } from './outils.mjs';

const MDP = 'Password123!';

// Le service met les codes promo en majuscules : autant le faire ici.
const CODE = `REMISE${uniq}`.toUpperCase();

await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` });

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Trattoria ${uniq}`,
      slug: `trattoria-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
      latitude: 45.7578,
      longitude: 4.832,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

// Deux catégories, et le même nom de plat dans chacune : c'est tout le problème
// du ticket qui n'affiche que « 4 fromages ».
const pizzas = await j(await post('/api/categories', { storeId, name: 'Pizzas' }, T));
const pates = await j(await post('/api/categories', { storeId, name: 'Pâtes' }, T));

const idCategorie = (lue) => lue.category?.id || lue.data?.id || lue.id;

const pizza = await j(
  await post(
    '/api/products',
    { storeId, name: '4 fromages', price: 13, status: 'ACTIVE', categoryId: idCategorie(pizzas) },
    T
  )
);
const plat = await j(
  await post(
    '/api/products',
    { storeId, name: '4 fromages', price: 11, status: 'ACTIVE', categoryId: idCategorie(pates) },
    T
  )
);

const idProduit = (lu) => lu.product?.id || lu.id;

// Une déclinaison sur la pizza : c'est elle qui ne s'affichait pas.
await post(`/api/products/${idProduit(pizza)}/variant-label`, { label: 'Taille' }, T);
const grande = await j(
  await post(
    `/api/products/${idProduit(pizza)}/variants`,
    { label: 'Grande', price: 16 },
    T
  )
);
const varianteId = grande.variante?.id || grande.data?.id || grande.id;

titre('Les moyens de paiement du commerçant sont publics');
// La route de l'espace commerçant exige un compte : le client n'en a pas
// forcément, et ne voyait donc aucun moyen de paiement.
await post(`/api/payment-methods/${storeId}`, { type: 'CASH', name: 'Espèces à la livraison', isDefault: true }, T);
await post(`/api/payment-methods/${storeId}`, { type: 'CREDIT_CARD', name: 'Carte bancaire' }, T);

const publics = await get(`/api/client/stores/${storeId}/payment-methods`);
const proposes = (await j(publics))?.data || [];

check('un visiteur les consulte', publics.status === 200, `statut ${publics.status}`);
check('les deux sont rendus', proposes.length === 2, JSON.stringify(proposes.map((m) => m.name)));
check(
  'celui par défaut vient en premier',
  proposes[0]?.name === 'Espèces à la livraison',
  JSON.stringify(proposes.map((m) => m.name))
);
check(
  'la configuration n’est jamais exposée',
  proposes.every((moyen) => moyen.config === undefined),
  'les clés d’API du commerçant fuiraient'
);

const inactif = proposes[1];
await patch(`/api/payment-methods/${storeId}/${inactif.id}/toggle`, {}, T);
const apresRetrait = (await j(await get(`/api/client/stores/${storeId}/payment-methods`)))?.data || [];
check(
  'un moyen désactivé disparaît',
  apresRetrait.length === 1,
  JSON.stringify(apresRetrait.map((m) => m.name))
);

titre('Un code promo, vérifié par le serveur');
await post(
  '/api/promotions',
  { storeId, code: CODE, type: 'PERCENTAGE', discountValue: 10 },
  T
);

const validation = await post(
  `/api/promotions/validate?storeId=${storeId}`,
  { code: CODE, cartTotal: 32, productIds: [idProduit(pizza)] }
);
const remise = await j(validation);
check('un visiteur peut le faire vérifier', validation.status === 200, `statut ${validation.status}`);
check('la remise est calculée', Number(remise?.discountAmount) === 3.2, `${remise?.discountAmount}`);

titre('La commande porte tout cela');
const commande = await post('/api/orders', {
  storeId,
  customerName: `Client ${uniq}`,
  customerEmail: `c-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 1,
  promoCode: CODE,
  paymentMethodId: proposes[0].id,
  items: [
    { productId: idProduit(pizza), variantId: varianteId, quantity: 2, price: 1 },
    { productId: idProduit(plat), quantity: 1, price: 1 },
  ],
});
const passee = await j(commande);
const orderId = passee?.order?.id;

check('elle est acceptée', commande.status < 400, `statut ${commande.status} ${passee?.error}`);

// 2 × 16 (grande) + 11 = 43, moins 10 % = 38,70.
check('le total tient la déclinaison', Number(passee?.order?.totalAmount) === 38.7, `${passee?.order?.totalAmount}`);
check('la remise est enregistrée', Number(passee?.order?.discountAmount) === 4.3, `${passee?.order?.discountAmount}`);
check('le code aussi', passee?.order?.promoCode === CODE, passee?.order?.promoCode);
check(
  'le moyen de paiement est retenu par son nom',
  passee?.order?.paymentMethodName === 'Espèces à la livraison',
  passee?.order?.paymentMethodName
);

const usages = await sqlScalaire(
  `SELECT "currentUses" FROM "Promotion" WHERE code = '${CODE}'`
);
check('le compteur d’utilisations avance', usages === '1', usages);

titre('Un code ou un moyen de paiement qui n’est pas le sien est refusé');
const autre = await j(
  await inscription({ email: `m2-${uniq}@t.fr`, password: MDP, name: `M2 ${uniq}` })
);
const boutique2 = await j(
  await post(
    '/api/stores',
    {
      orgId: autre.organization.id,
      name: `Ailleurs ${uniq}`,
      slug: `ailleurs-${uniq}`,
      address: '2 rue de la Ré',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000001',
      latitude: 45.76,
      longitude: 4.83,
    },
    autre.accessToken
  )
);
const storeId2 = boutique2.store?.id || boutique2.id;
const plat2 = await j(
  await post('/api/products', { storeId: storeId2, name: `Plat ${uniq}`, price: 10, status: 'ACTIVE' }, autre.accessToken)
);

const volee = await post('/api/orders', {
  storeId: storeId2,
  customerName: `Client ${uniq}`,
  customerEmail: `c2-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 10,
  paymentMethodId: proposes[0].id,
  items: [{ productId: idProduit(plat2), quantity: 1, price: 10 }],
});
check('le moyen de paiement du voisin est refusé', volee.status === 400, `statut ${volee.status}`);
check(
  'et le refus le dit',
  /moyen de paiement/i.test((await j(volee))?.error || ''),
  'message muet'
);

titre('Le ticket distingue les deux « 4 fromages »');
const detail = await j(await get(`/api/order-management/${storeId}/${orderId}`, T));
const lignes = detail?.items || detail?.order?.items || [];

check('les deux lignes sont là', lignes.length === 2, `${lignes.length}`);
check(
  'chaque plat porte sa catégorie',
  lignes.every((ligne) => typeof ligne.product?.category?.name === 'string'),
  JSON.stringify(lignes.map((l) => l.product?.category))
);
check(
  'la pizza est dans Pizzas',
  lignes.some((ligne) => ligne.product?.category?.name === 'Pizzas'),
  JSON.stringify(lignes.map((l) => l.product?.category?.name))
);
check(
  'les pâtes dans Pâtes',
  lignes.some((ligne) => ligne.product?.category?.name === 'Pâtes'),
  JSON.stringify(lignes.map((l) => l.product?.category?.name))
);
check(
  'la déclinaison accompagne la pizza',
  lignes.some((ligne) => ligne.variant?.label === 'Grande'),
  JSON.stringify(lignes.map((l) => l.variant))
);

titre('La liste des commandes aussi');
const liste = await j(await get(`/api/order-management/${storeId}`, T));
const premiere = (liste?.data || liste?.orders || [])[0];
const lignesListe = premiere?.items || [];

check(
  'la catégorie y est',
  lignesListe.every((ligne) => ligne.product?.category !== undefined),
  JSON.stringify(lignesListe.map((l) => l.product))
);
check(
  'la déclinaison y est',
  lignesListe.some((ligne) => ligne.variant?.label === 'Grande'),
  JSON.stringify(lignesListe.map((l) => l.variant))
);

titre('Et la facture');
const facture = await j(await get(`/api/invoices/${storeId}/${orderId}`, T));
const lignesFacture = facture?.items || facture?.data?.items || [];

check(
  'elle nomme la catégorie',
  lignesFacture.some((ligne) => ligne.category === 'Pizzas'),
  JSON.stringify(lignesFacture)
);
check(
  'et la déclinaison',
  lignesFacture.some((ligne) => ligne.variant === 'Grande'),
  JSON.stringify(lignesFacture)
);

await terminer();
