// Ce que le client voit du menu : l'ordre voulu par le commerçant, et les
// plats épuisés signalés plutôt que masqués.

import { inscription, titre, check, j, uniq, post, get, patch, put, terminer } from './outils.mjs';

await inscription({ email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` });

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;

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
      latitude: 45.764,
      longitude: 4.8357,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

// Deux catégories, volontairement dans un ordre inverse de l'alphabet pour
// que le tri par nom se distingue du tri voulu par le commerçant.
const creerCategorie = async (name, displayOrder) =>
  j(await post('/api/categories', { storeId, name, displayOrder }, T));

const plats = await creerCategorie(`Plats ${uniq}`, 1);
const desserts = await creerCategorie(`Amuse-bouches ${uniq}`, 2);

const idCategorie = (reponse) => reponse.category?.id || reponse.id;

const creerProduit = async (name, price, categoryId) =>
  j(await post('/api/products', { storeId, name, price, categoryId, status: 'ACTIVE' }, T));

// Noms choisis pour que l'alphabet donne Calzone, Margherita, Napolitaine.
const margherita = await creerProduit('Margherita', 12, idCategorie(plats));
const calzone = await creerProduit('Calzone', 14, idCategorie(plats));
const napolitaine = await creerProduit('Napolitaine', 13, idCategorie(plats));
const olives = await creerProduit('Olives', 4, idCategorie(desserts));

const idProduit = (reponse) => reponse.product?.id || reponse.id;

titre('Ordre choisi par le commerçant');
// Le commerçant range : Napolitaine, Margherita, Calzone — l'inverse de
// l'alphabet, pour que la différence se voie.
const reordonner = await post(
  '/api/products/reorder',
  {
    storeId,
    ordering: [
      { id: idProduit(napolitaine), displayOrder: 0 },
      { id: idProduit(margherita), displayOrder: 1 },
      { id: idProduit(calzone), displayOrder: 2 },
    ],
  },
  T
);
check('le réordonnancement est accepté', reordonner.status < 300, `statut=${reordonner.status}`);

const fiche = await j(await get(`/api/client/stores/${storeId}`));
const menu = fiche?.data?.menu || {};
const nomsPlats = (menu[`Plats ${uniq}`] || []).map((p) => p.name);

check(
  'le client voit l’ordre du commerçant, pas l’alphabet',
  JSON.stringify(nomsPlats) === JSON.stringify(['Napolitaine', 'Margherita', 'Calzone']),
  JSON.stringify(nomsPlats)
);

titre('Ordre des catégories');
const categories = Object.keys(menu);
check(
  'les catégories suivent leur propre ordre',
  categories.indexOf(`Plats ${uniq}`) < categories.indexOf(`Amuse-bouches ${uniq}`),
  JSON.stringify(categories)
);

titre('La route menu applique le même ordre');
const menuSeul = await j(await get(`/api/client/stores/${storeId}/menu`));
const nomsMenu = (menuSeul?.data?.[`Plats ${uniq}`] || []).map((p) => p.name);
check(
  'même ordre sur /menu',
  JSON.stringify(nomsMenu) === JSON.stringify(['Napolitaine', 'Margherita', 'Calzone']),
  JSON.stringify(nomsMenu)
);

titre('Un plat épuisé');
const epuisement = await patch(
  `/api/products/${idProduit(margherita)}/availability`,
  { isAvailable: false, storeId },
  T
);
check('le commerçant peut le marquer épuisé', epuisement.status === 200, `statut=${epuisement.status}`);

const apres = await j(await get(`/api/client/stores/${storeId}`));
const platsApres = apres?.data?.menu?.[`Plats ${uniq}`] || [];
const margheritaVue = platsApres.find((p) => p.name === 'Margherita');

check(
  'il reste visible dans le menu',
  !!margheritaVue,
  JSON.stringify(platsApres.map((p) => p.name))
);
check(
  'il est signalé comme indisponible',
  margheritaVue?.isAvailable === false,
  `isAvailable=${margheritaVue?.isAvailable}`
);
check(
  'les autres restent disponibles',
  platsApres.filter((p) => p.name !== 'Margherita').every((p) => p.isAvailable === true),
  JSON.stringify(platsApres.map((p) => [p.name, p.isAvailable]))
);
check(
  'l’ordre n’est pas bousculé par l’épuisement',
  JSON.stringify(platsApres.map((p) => p.name)) ===
    JSON.stringify(['Napolitaine', 'Margherita', 'Calzone']),
  JSON.stringify(platsApres.map((p) => p.name))
);

titre('Commander un plat épuisé');
const commande = await post('/api/orders', {
  storeId,
  customerName: 'Client Test',
  customerEmail: `c-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 12,
  items: [{ productId: idProduit(margherita), quantity: 1, price: 12 }],
});
const refus = await j(commande);

check('le serveur refuse la commande', commande.status === 400, `statut=${commande.status}`);
check('le motif nomme le plat', /Margherita/.test(refus?.error || ''), refus?.error);
check('le code est exploitable', refus?.code === 'PRODUCT_UNAVAILABLE', refus?.code);

titre('Retour en disponible');
await patch(`/api/products/${idProduit(margherita)}/availability`, { isAvailable: true, storeId }, T);

const denouveau = await post('/api/orders', {
  storeId,
  customerName: 'Client Test',
  customerEmail: `c2-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 12,
  items: [{ productId: idProduit(margherita), quantity: 1, price: 12 }],
});
check('la commande repasse', denouveau.status < 300, `statut=${denouveau.status}`);

titre('Un produit sans catégorie passe en dernier');
const divers = await creerProduit('Sans catégorie', 3, undefined);
const avecDivers = await j(await get(`/api/client/stores/${storeId}`));
const toutesCategories = Object.keys(avecDivers?.data?.menu || {});

check(
  '« Autres » ferme la marche',
  toutesCategories[toutesCategories.length - 1] === 'Autres',
  JSON.stringify(toutesCategories)
);

await terminer();
