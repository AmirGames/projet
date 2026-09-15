// Les déclinaisons d'un plat — penne, spaghetti, tagliatelle — et le prix
// d'une ligne de commande, désormais calculé par le serveur.

import {
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

await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` });

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
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
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const plat = await j(
  await post('/api/products', { storeId, name: 'Pâtes 4 fromages', price: 14, status: 'ACTIVE' }, T)
);
const productId = plat.product?.id || plat.id;

const simple = await j(
  await post('/api/products', { storeId, name: 'Tiramisu', price: 6, status: 'ACTIVE' }, T)
);
const simpleId = simple.product?.id || simple.id;

// ===== Créer les déclinaisons =====

titre('Le commerçant décline son plat');
const intitule = await put(`/api/products/${productId}/variant-label`, { libelle: 'Type de pâtes' }, T);
check('il nomme le choix', intitule.status === 200, `statut ${intitule.status}`);

const penne = await j(await post(`/api/products/${productId}/variants`, { label: 'Penne' }, T));
const spaghetti = await j(await post(`/api/products/${productId}/variants`, { label: 'Spaghetti' }, T));
// Les tagliatelle sont plus chères : une déclinaison porte son propre tarif.
const tagliatelle = await j(
  await post(`/api/products/${productId}/variants`, { label: 'Tagliatelle', price: 16.5 }, T)
);

check('les penne sont créées', Boolean(penne?.data?.id), JSON.stringify(penne)?.slice(0, 200));
check('les spaghetti aussi', Boolean(spaghetti?.data?.id), JSON.stringify(spaghetti)?.slice(0, 200));
check('les tagliatelle aussi', Boolean(tagliatelle?.data?.id), JSON.stringify(tagliatelle)?.slice(0, 200));

const penneId = penne.data.id;
const spaghettiId = spaghetti.data.id;
const tagliatelleId = tagliatelle.data.id;

const enBase = await sqlScalaire(`SELECT COUNT(*) FROM "ProductVariant" WHERE "productId" = '${productId}'`);
check('elles sont écrites en base', enBase === '3', enBase);

const reference = await sqlScalaire(`SELECT "sku" FROM "ProductVariant" WHERE id = '${penneId}'`);
check('une référence lisible est dérivée du nom', /PENNE/.test(reference), reference);

titre('Un doublon est refusé');
const doublon = await post(`/api/products/${productId}/variants`, { label: 'penne' }, T);
const corpsDoublon = await j(doublon);
check('même nom, même plat : refusé', doublon.status === 409, `statut ${doublon.status}`);
check('le refus nomme la déclinaison', /penne/i.test(corpsDoublon?.error || ''), corpsDoublon?.error);

check(
  'un nom vide est refusé',
  (await post(`/api/products/${productId}/variants`, { label: '   ' }, T)).status === 400,
  'accepté à tort'
);
check(
  'un prix négatif est refusé',
  (await post(`/api/products/${productId}/variants`, { label: 'Fusilli', price: -2 }, T)).status === 400,
  'accepté à tort'
);

// ===== Ce que reçoit le client =====

titre('Ce que le client reçoit');
const publique = await j(await get(`/api/products/${productId}/variants`));
check('la liste est publique', Array.isArray(publique?.data?.variantes), JSON.stringify(publique)?.slice(0, 200));
check('la question posée est rendue', publique?.data?.libelleDuChoix === 'Type de pâtes', publique?.data?.libelleDuChoix);
check('les trois déclinaisons sont là', publique?.data?.variantes?.length === 3, `${publique?.data?.variantes?.length}`);

const lues = publique.data.variantes;
check(
  'une déclinaison sans prix hérite de celui du plat',
  lues.find((v) => v.label === 'Penne')?.prixEffectif === 14,
  JSON.stringify(lues.find((v) => v.label === 'Penne'))
);
check(
  'une déclinaison plus chère porte son prix',
  lues.find((v) => v.label === 'Tagliatelle')?.prixEffectif === 16.5,
  JSON.stringify(lues.find((v) => v.label === 'Tagliatelle'))
);

titre('Dans le menu de la boutique');
const menu = await j(await get(`/api/client/stores/${storeId}`));
const platDuMenu = Object.values(menu?.data?.menu || {})
  .flat()
  .find((produit) => produit.id === productId);

check('le plat porte ses déclinaisons', platDuMenu?.variants?.length === 3, `${platDuMenu?.variants?.length}`);
check('il porte la question posée', platDuMenu?.variantLabel === 'Type de pâtes', platDuMenu?.variantLabel);
check(
  'le prix réellement payé est rendu',
  platDuMenu?.variants?.every((v) => typeof v.prixEffectif === 'number'),
  JSON.stringify(platDuMenu?.variants)
);

const tiramisu = Object.values(menu?.data?.menu || {})
  .flat()
  .find((produit) => produit.id === simpleId);
check('un plat sans déclinaison n’en invente pas', tiramisu?.variants?.length === 0, JSON.stringify(tiramisu?.variants));

titre('L’ordre voulu par le commerçant');
// L'alphabet donnerait Penne, Spaghetti, Tagliatelle : on inverse.
await post(
  `/api/products/${productId}/variants/reorder`,
  {
    ordering: [
      { id: tagliatelleId, displayOrder: 0 },
      { id: spaghettiId, displayOrder: 1 },
      { id: penneId, displayOrder: 2 },
    ],
  },
  T
);

const ordonnees = await j(await get(`/api/products/${productId}/variants`));
check(
  'l’ordre est suivi',
  ordonnees.data.variantes.map((v) => v.label).join(',') === 'Tagliatelle,Spaghetti,Penne',
  JSON.stringify(ordonnees.data.variantes.map((v) => v.label))
);

const menuOrdonne = await j(await get(`/api/client/stores/${storeId}/menu`));
const platOrdonne = Object.values(menuOrdonne?.data || {})
  .flat()
  .find((produit) => produit.id === productId);
check(
  'le client reçoit le même ordre',
  platOrdonne?.variants?.map((v) => v.label).join(',') === 'Tagliatelle,Spaghetti,Penne',
  JSON.stringify(platOrdonne?.variants?.map((v) => v.label))
);

titre('Réordonner les déclinaisons d’un autre plat');
const autrePlat = await j(
  await post('/api/products', { storeId, name: 'Risotto', price: 15, status: 'ACTIVE' }, T)
);
const autreId = autrePlat.product?.id || autrePlat.id;

check(
  'une déclinaison étrangère est refusée',
  (await post(`/api/products/${autreId}/variants/reorder`, { ordering: [{ id: penneId, displayOrder: 0 }] }, T))
    .status === 400,
  'accepté à tort'
);

// ===== Commander =====

const commander = (variantId, prixAnnonce, total) =>
  post('/api/orders', {
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: total,
    items: [{ productId, quantity: 1, price: prixAnnonce, ...(variantId ? { variantId } : {}) }],
  });

titre('Commander une déclinaison');
const commande = await j(await commander(tagliatelleId, 16.5, 16.5));
const orderId = commande.order?.id || commande.id;
check('la commande passe', Boolean(orderId), JSON.stringify(commande)?.slice(0, 200));

const ligne = await sqlScalaire(
  `SELECT "variantId" FROM "OrderItem" WHERE "orderId" = '${orderId}' LIMIT 1`
);
check('la déclinaison choisie est enregistrée', ligne === tagliatelleId, ligne);

const relue = await j(await get(`/api/orders/${orderId}`));
const articles = relue?.items || relue?.order?.items || [];
check(
  'la commande nomme la déclinaison',
  articles[0]?.variant?.label === 'Tagliatelle',
  JSON.stringify(articles[0]?.variant)
);

titre('Le plat qui se décline ne se commande pas nu');
const nue = await commander(null, 14, 14);
const corpsNue = await j(nue);
check('sans choix, la commande est refusée', nue.status === 400, `statut ${nue.status}`);
check('le refus invite à choisir', /choisissez/i.test(corpsNue?.error || ''), corpsNue?.error);
check('le code le dit', corpsNue?.code === 'VARIANT_REQUIRED', corpsNue?.code);

titre('Une déclinaison épuisée');
const epuise = await patch(`/api/products/variants/${spaghettiId}/availability`, { isAvailable: false }, T);
check('le commerçant l’épuise', epuise.status === 200, `statut ${epuise.status}`);

const commandeEpuisee = await commander(spaghettiId, 14, 14);
const corpsEpuise = await j(commandeEpuisee);
check('elle n’est plus commandable', commandeEpuisee.status === 400, `statut ${commandeEpuisee.status}`);
check(
  'le refus nomme le plat et la déclinaison',
  /Spaghetti/.test(corpsEpuise?.error || '') && /4 fromages/.test(corpsEpuise?.error || ''),
  corpsEpuise?.error
);

check(
  'les autres restent commandables',
  (await commander(penneId, 14, 14)).status < 400,
  'refusée à tort'
);

// ===== Le prix ne vient plus du navigateur =====

titre('Le prix est calculé par le serveur');
const tricherie = await j(await commander(tagliatelleId, 0.01, 0.01));
const idTricherie = tricherie.order?.id || tricherie.id;

const prixFacture = await sqlScalaire(
  `SELECT "price" FROM "OrderItem" WHERE "orderId" = '${idTricherie}' LIMIT 1`
);
check('un prix annoncé à un centime est ignoré', Number(prixFacture) === 16.5, prixFacture);

const totalFacture = await sqlScalaire(`SELECT "totalAmount" FROM "Order" WHERE id = '${idTricherie}'`);
check('le total suit les lignes', Number(totalFacture) === 16.5, totalFacture);

const deuxArticles = await j(
  await post('/api/orders', {
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 1,
    items: [
      { productId, quantity: 2, price: 1, variantId: penneId },
      { productId: simpleId, quantity: 1, price: 1 },
    ],
  })
);
const idDeux = deuxArticles.order?.id || deuxArticles.id;

const totalDeux = await sqlScalaire(`SELECT "totalAmount" FROM "Order" WHERE id = '${idDeux}'`);
check('plusieurs lignes sont bien totalisées', Number(totalDeux) === 34, `${totalDeux} au lieu de 34`);

check(
  'une quantité fantaisiste est refusée',
  (
    await post('/api/orders', {
      storeId,
      customerName: `C ${uniq}`,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'PICKUP',
      totalAmount: 1,
      items: [{ productId: simpleId, quantity: -3, price: 6 }],
    })
  ).status === 400,
  'acceptée à tort'
);

// ===== Modifier, supprimer =====

titre('Modifier une déclinaison');
await put(`/api/products/variants/${penneId}`, { label: 'Penne rigate', price: 15 }, T);
const modifiee = await j(await get(`/api/products/${productId}/variants`));
const rigate = modifiee.data.variantes.find((v) => v.id === penneId);

check('le nom est enregistré', rigate?.label === 'Penne rigate', rigate?.label);
check('le prix est enregistré', rigate?.prixEffectif === 15, `${rigate?.prixEffectif}`);

titre('Supprimer une déclinaison jamais commandée');
const jetable = await j(await post(`/api/products/${productId}/variants`, { label: 'Fusilli' }, T));
const suppression = await del(`/api/products/variants/${jetable.data.id}`, null, T);
check('elle disparaît', suppression.status === 200, `statut ${suppression.status}`);

const resteFusilli = await sqlScalaire(
  `SELECT COUNT(*) FROM "ProductVariant" WHERE id = '${jetable.data.id}'`
);
check('elle n’est plus en base', resteFusilli === '0', resteFusilli);

titre('Supprimer une déclinaison déjà commandée');
// Effacer la ligne d'une commande passée réécrirait l'histoire : on la retire
// de la vente à la place.
const retrait = await j(await del(`/api/products/variants/${tagliatelleId}`, null, T));
check('elle est retirée, non supprimée', retrait?.data?.retiree === true, JSON.stringify(retrait));

const resteTagliatelle = await sqlScalaire(
  `SELECT "isAvailable" FROM "ProductVariant" WHERE id = '${tagliatelleId}'`
);
check('elle existe encore, indisponible', resteTagliatelle === 'false', resteTagliatelle);

const historique = await sqlScalaire(
  `SELECT COUNT(*) FROM "OrderItem" WHERE "variantId" = '${tagliatelleId}'`
);
check('les commandes passées sont intactes', Number(historique) >= 1, historique);

// ===== Qui peut faire quoi =====

titre('Un autre commerçant ne touche à rien');
const intrus = await j(
  await post('/api/auth/signup', { email: `x-${uniq}@t.fr`, password: 'Password123!', name: `X ${uniq}` })
);
const TX = intrus.accessToken;

check(
  'il ne peut pas ajouter de déclinaison',
  (await post(`/api/products/${productId}/variants`, { label: 'Intrusion' }, TX)).status === 403,
  'accepté à tort'
);
check(
  'ni en modifier une',
  (await put(`/api/products/variants/${penneId}`, { label: 'Volée' }, TX)).status === 403,
  'accepté à tort'
);
check(
  'ni en épuiser une',
  (await patch(`/api/products/variants/${penneId}/availability`, { isAvailable: false }, TX)).status === 403,
  'accepté à tort'
);
check(
  'ni en supprimer',
  (await del(`/api/products/variants/${penneId}`, null, TX)).status === 403,
  'accepté à tort'
);
check(
  'ni renommer le choix',
  (await put(`/api/products/${productId}/variant-label`, { libelle: 'Volé' }, TX)).status === 403,
  'accepté à tort'
);

const inchangee = await sqlScalaire(`SELECT "label" FROM "ProductVariant" WHERE id = '${penneId}'`);
check('rien n’a bougé', inchangee === 'Penne rigate', inchangee);

check(
  'un anonyme ne peut rien écrire',
  (await post(`/api/products/${productId}/variants`, { label: 'Anonyme' })).status === 401,
  'accepté à tort'
);

titre('Retirer la question posée');
await put(`/api/products/${productId}/variant-label`, { libelle: null }, T);
const sansIntitule = await j(await get(`/api/products/${productId}/variants`));
check('elle disparaît', sansIntitule.data.libelleDuChoix === null, `${sansIntitule.data.libelleDuChoix}`);

await terminer();
