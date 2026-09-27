// Supprimer son compte ZupEat depuis l'application : le profil client
// s'efface, les commandes restent (sans lien) ; la connexion ne disparaît
// que si personne d'autre ne s'en sert (compte livreur, espace commerçant).

import { inscription as inscrireCommercant, titre, check, j, uniq, post, get, sqlScalaire, terminer } from './outils.mjs';

const MDP = 'Password123!';

async function client(prefixe) {
  const email = `${prefixe}-${uniq}@t.fr`;
  const r = await post('/api/auth/signup', { conditionsAcceptees: true, email, password: MDP, name: `${prefixe} ${uniq}` });
  const corps = await j(r);
  return { email, jeton: corps?.accessToken, statut: r.status };
}

// Le commerçant d'abord : sur une base neuve, le premier compte inscrit
// devient la plateforme, et son compte ne peut pas partir avec ZupEat.
const commercant = await j(await inscrireCommercant({ email: `m-sc-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` }));
const T = commercant.accessToken;
const boutique = await j(
  await post('/api/stores', {
    orgId: commercant.organization.id,
    name: `Pizzeria ${uniq}`,
    slug: `pizzeria-sc-${uniq}`,
    address: '1 rue de Rivoli',
    city: 'Paris',
    postalCode: '75001',
    phone: '0100000000',
    latitude: 48.86,
    longitude: 2.34,
  }, T)
);
const storeId = boutique.store?.id || boutique.id;
const produit = await j(await post('/api/products', { storeId, name: 'Pizza', price: 12, status: 'ACTIVE' }, T));

// ===== Une personne qui n'est que cliente =====

titre('Un compte ZupEat seul');
const lea = await client('lea');
check('le compte est créé', lea.statut === 201 || lea.statut === 200, `statut ${lea.statut}`);
const profil = await get('/api/client/me', lea.jeton);
check('le profil client existe', profil.status === 200, `statut ${profil.status}`);
await post('/api/push-devices', { token: `ExponentPushToken[lea-${uniq}]`, platform: 'android', app: 'customer' }, lea.jeton);

// Une commande en cours bloque la suppression.
const commande = await j(
  await post('/api/orders', {
    conditionsAcceptees: true,
    storeId,
    customerName: `lea ${uniq}`,
    customerEmail: lea.email,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 12,
    items: [{ productId: produit.product?.id || produit.id, quantity: 1, price: 12 }],
  })
);
const orderId = commande.order?.id || commande.id;
await post(`/api/order-management/${storeId}/${orderId}/accept`, { preparationMinutes: 20 }, T);

const apercu = (await j(await get('/api/client/me/suppression', lea.jeton)))?.data;
check('l’aperçu voit la commande en cours', apercu?.commandesEnCours === 1, JSON.stringify(apercu));
check('et que tout le compte partira', apercu?.compteEntierSupprime === true, JSON.stringify(apercu));
const tropTot = await post('/api/client/me/suppression', {}, lea.jeton);
check('pas de suppression pendant une commande', tropTot.status === 409, `statut ${tropTot.status}`);

await post(`/api/order-management/${storeId}/${orderId}/reject`, { motif: 'TOO_BUSY' }, T);
const suppression = await post('/api/client/me/suppression', { motif: 'Je n’utilise plus ZupEat' }, lea.jeton);
const reponse = await j(suppression);
check('la suppression passe', suppression.status === 200, `statut ${suppression.status} ${JSON.stringify(reponse)}`);
check('le message le dit', /compte ZupEat est supprimé/.test(reponse?.message || '') && /n'existe plus/.test(reponse?.message || ''), reponse?.message);

titre('Plus rien ne reste du compte');
const connexion = await post('/api/auth/login', { email: lea.email, password: MDP });
check('la connexion est refusée', connexion.status >= 400 && connexion.status < 500, `statut ${connexion.status}`);
const ancienneSession = await get('/api/client/me', lea.jeton);
check('l’ancienne session tombe aussitôt', ancienneSession.status === 401, `statut ${ancienneSession.status}`);
check('l’adresse e-mail ne figure plus nulle part', (await sqlScalaire(`SELECT count(*) FROM "Customer" WHERE email = '${lea.email}'`)) === '0');
const commandeGardee = await sqlScalaire(`SELECT count(*) FROM "Order" WHERE id = '${orderId}'`);
check('la commande reste, pour la comptabilité', commandeGardee === '1', commandeGardee);
const fiche = await sqlScalaire(
  `SELECT c.name || '|' || coalesce(c.phone, '') || '|' || (c."deletedAt" IS NOT NULL) FROM "Order" o JOIN "Customer" c ON c.id = o."customerId" WHERE o.id = '${orderId}'`
);
check('sa fiche ne dit plus rien de la personne', fiche === 'Client supprimé||true', fiche);
const nouveau = await client('lea');
check('l’adresse peut resservir', nouveau.statut === 201 || nouveau.statut === 200, `statut ${nouveau.statut}`);

// ===== Une personne aussi livreur =====

titre('Un livreur qui supprime seulement ZupEat');
const noe = await j(
  await post('/api/drivers/register', {
    conditionsAcceptees: true,
    name: `Noé ${uniq}`,
    email: `noe-${uniq}@t.fr`,
    password: MDP,
    phone: '+33612345670',
    vehicleType: 'bike',
  })
);
const N = noe.accessToken;
check('il ouvre ZupEat avec le même compte', (await get('/api/client/me', N)).status === 200);
await post('/api/push-devices', { token: `ExponentPushToken[noe-c-${uniq}]`, platform: 'android', app: 'customer' }, N);
await post('/api/push-devices', { token: `ExponentPushToken[noe-d-${uniq}]`, platform: 'android', app: 'delivery' }, N);

const avant = (await j(await get('/api/client/me/suppression', N)))?.data;
check('l’aperçu dit que le compte livreur reste', avant?.restent?.livreur === true && avant?.compteEntierSupprime === false, JSON.stringify(avant));
const sienne = await j(await post('/api/client/me/suppression', {}, N));
check('le message dit que le compte livreur reste actif', /Votre compte livreur reste actif/.test(sienne?.message || ''), sienne?.message);
check('il se connecte toujours', (await post('/api/auth/login', { email: `noe-${uniq}@t.fr`, password: MDP })).status === 200);
check('son espace livreur répond', (await get('/api/drivers/me', N)).status === 200);
const appareils = await sqlScalaire(
  `SELECT string_agg(p.app, ',') FROM "PushDevice" p JOIN "User" u ON u.id = p."userId" WHERE u.email = 'noe-${uniq}@t.fr'`
);
check('seules les notifications ZupEat sont retirées', appareils === 'delivery', appareils);
const retour = await j(await get('/api/client/me', N));
check('s’il revient sur ZupEat, un profil vierge l’attend', retour?.data?.totalOrders === 0 && !retour?.data?.address, JSON.stringify(retour?.data));

await terminer();
