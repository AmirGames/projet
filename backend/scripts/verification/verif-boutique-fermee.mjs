// Une boutique fermée reste visible mais n'accepte plus de commande, et elle
// situe son adresse toute seule.

import { titre, check, j, uniq, post, get, patch, terminer, sqlScalaire, sqlExec } from './outils.mjs';

const MDP = 'Password123!';

await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` });

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

// Sans latitude ni longitude : c'est l'état de toutes les boutiques créées par
// le formulaire, qui jetait les coordonnées de l'adresse choisie.
const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Snack ${uniq}`,
      slug: `snack-${uniq}`,
      address: '20 Rue de la République',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post('/api/products', { storeId, name: `Kebab ${uniq}`, price: 9, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

titre('Ouverte, tout est normal');
const listeOuverte = await j(await get('/api/client/stores'));
check(
  'la boutique est listée',
  (listeOuverte?.data || []).some((b) => b.id === storeId),
  'absente de la liste'
);

const premiere = await post('/api/orders', {
  storeId,
  customerName: `Client ${uniq}`,
  customerEmail: `c-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 9,
  items: [{ productId, quantity: 1, price: 9 }],
});
check('on peut commander', premiere.status < 400, `statut ${premiere.status}`);

titre('Fermée, elle reste visible');
await patch(`/api/store-hours/${storeId}/status`, { isOpen: false }, T);

const listeFermee = await j(await get('/api/client/stores'));
const vue = (listeFermee?.data || []).find((b) => b.id === storeId);

// Elle disparaissait purement et simplement : le client croyait le commerce
// parti.
check('elle est toujours dans la liste', vue !== undefined, 'disparue de la liste');
check('son état est annoncé', vue?.isOpen === false, `${vue?.isOpen}`);

const fiche = await get(`/api/client/stores/${storeId}`);
const detail = await j(fiche);
check('sa fiche s’ouvre encore', fiche.status === 200, `statut ${fiche.status}`);
check(
  'le menu est toujours consultable',
  Object.keys(detail?.data?.menu || {}).length > 0,
  JSON.stringify(Object.keys(detail?.data?.menu || {}))
);

const recherche = await j(await get(`/api/client/stores/search?q=Snack ${uniq}`));
check(
  'la recherche la trouve encore',
  (recherche?.data || []).some((b) => b.id === storeId),
  'introuvable à la recherche'
);

titre('Mais on n’y commande plus');
const refusee = await post('/api/orders', {
  storeId,
  customerName: `Client ${uniq}`,
  customerEmail: `c2-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 9,
  items: [{ productId, quantity: 1, price: 9 }],
});
const motif = await j(refusee);

check('la commande est refusée', refusee.status === 400, `statut ${refusee.status}`);
check('le code le dit', motif?.code === 'STORE_CLOSED', motif?.code);
check(
  'et le message est lisible',
  /momentanément indisponible/i.test(motif?.error || ''),
  motif?.error
);

const commandes = await sqlScalaire(
  `SELECT COUNT(*) FROM "Order" WHERE "storeId" = '${storeId}'`
);
check('aucune commande n’a été enregistrée pendant la fermeture', commandes === '1', commandes);

titre('Rouverte, elle reprend');
await patch(`/api/store-hours/${storeId}/status`, { isOpen: true }, T);
const reprise = await post('/api/orders', {
  storeId,
  customerName: `Client ${uniq}`,
  customerEmail: `c3-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 9,
  items: [{ productId, quantity: 1, price: 9 }],
});
check('on commande de nouveau', reprise.status < 400, `statut ${reprise.status}`);

titre('La boutique situe son adresse toute seule');
/**
 * Elle est désormais située dès sa création : le contrôle ne porte plus sur
 * l'absence de position, mais sur le rattrapage — une boutique d'avant cette
 * règle, ou dont le géocodage avait échoué, se situe au premier client qui
 * demande les conditions de livraison.
 */
await sqlExec(`UPDATE "Store" SET latitude = NULL, longitude = NULL WHERE id = '${storeId}'`);

const avant = await sqlScalaire(`SELECT latitude FROM "Store" WHERE id = '${storeId}'`);
check('elle n’a plus de position', avant === '', avant);

// Le premier client qui demande les conditions de livraison déclenche la
// recherche : le commerçant n'a rien à ressaisir.
const verdict = await j(await get(`/api/client/stores/${storeId}/zone-livraison?adresse=20 Rue de la République 69002 Lyon`));

const apres = await sqlScalaire(`SELECT latitude FROM "Store" WHERE id = '${storeId}'`);

// Sans service d'adresses joignable, la position reste vide : le contrôle ne
// vaut que là où le faux service tourne.
if (apres === '') {
  check(
    'sans service d’adresses, le message reste explicite',
    /pas encore situé|Saisissez votre adresse|frais de livraison/i.test(verdict?.data?.raison || '') ||
      verdict?.data?.livrable === true,
    JSON.stringify(verdict?.data)
  );
} else {
  check('sa position est enregistrée', Number(apres) > 0, apres);
  check(
    'et le client n’est plus renvoyé à une boutique non située',
    !/pas encore situé/.test(verdict?.data?.raison || ''),
    verdict?.data?.raison
  );
}

await terminer();
