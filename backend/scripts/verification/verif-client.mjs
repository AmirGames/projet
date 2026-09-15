// Vérifie l'espace client : historique, suivi de livraison, avis, favoris.
// Plateforme

import { check, j, uniq, post, get, patch, del, sqlExec, terminer } from './outils.mjs';

await post('/api/auth/signup', { email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` });
const m = await j(await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const b = await j(await post('/api/stores', {
  orgId: m.organization.id, name: `Bou ${uniq}`, slug: `bou-${uniq}`,
  address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, m.accessToken));
const storeId = b.store?.id || b.id;
const prod = await j(await post('/api/products', { storeId, name: 'Pizza', price: 12, stock: 20, status: 'ACTIVE' }, m.accessToken));
const productId = prod.product.id;

// Le client a un compte utilisateur ET une fiche client créée par sa commande.
const emailClient = `client-${uniq}@t.fr`;
const compteClient = await j(await post('/api/auth/signup', { email: emailClient, password: 'Password123!', name: 'Client Test' }));
const cToken = compteClient.accessToken;

const commande = await j(await post('/api/orders', {
  storeId, customerName: 'Client Test', customerEmail: emailClient, customerPhone: '0600000000',
  deliveryType: 'DELIVERY', deliveryAddress: '9 rue Client', deliveryCity: 'Lyon',
  totalAmount: 24, feesAmount: 3,
}));
const orderId = commande?.order?.id;
check('commande créée pour ce client', !!orderId, JSON.stringify(commande)?.slice(0, 120));

// Une ligne de commande, pour que l'avis ait un produit sur lequel porter.
await sqlExec(`INSERT INTO "OrderItem" (id, "orderId", "productId", quantity, "selectedOptions", price, total, "createdAt") VALUES ('item-${uniq}', '${orderId}', '${productId}', 2, '{}', 12, 24, NOW())`);

console.log('\n[Historique des commandes]');
const historique = await get('/api/client/me/orders', cToken);
const historiqueData = await j(historique);
check('route accessible (404 auparavant)', historique.status === 200, `status=${historique.status} ${JSON.stringify(historiqueData)?.slice(0, 150)}`);
check('la commande apparaît', (historiqueData?.data || []).length === 1, `n=${historiqueData?.data?.length}`);
const ligne = historiqueData?.data?.[0];
check('montant en euros', ligne?.totalAmount === 24, `=${ligne?.totalAmount}`);
check('boutique rappelée', !!ligne?.store?.name, JSON.stringify(ligne?.store));
check('articles listés', (ligne?.items || []).length === 1, `n=${ligne?.items?.length}`);

// Un autre client ne doit rien voir.
const autre = await j(await post('/api/auth/signup', { email: `autre-${uniq}@t.fr`, password: 'Password123!', name: 'Autre' }));
const historiqueAutre = await get('/api/client/me/orders', autre.accessToken);
check('un compte sans commande obtient 404 explicite', historiqueAutre.status === 404, `status=${historiqueAutre.status}`);

console.log('\n[Suivi de livraison]');
const sansCourse = await j(await get(`/api/client/deliveries/${orderId}`, cToken));
check('aucune course : réponse vide et non erreur', sansCourse?.data === null, JSON.stringify(sansCourse));

const livreur = await j(await post('/api/drivers/register', {
  name: 'Livreur', email: `d-${uniq}@t.fr`, password: 'Password123!', phone: '0611111111', vehicleType: 'bike',
}));
await sqlExec(`INSERT INTO "OrderDelivery" (id, "orderId", status, "createdAt", "updatedAt") VALUES ('c-${uniq}', '${orderId}', 'PENDING', NOW(), NOW())`);
await patch(`/api/drivers/deliveries/c-${uniq}/accept`, null, livreur.accessToken);

const suivi = await get(`/api/client/deliveries/${orderId}`, cToken);
const suiviData = await j(suivi);
check('suivi accessible', suivi.status === 200, `status=${suivi.status}`);
check('statut de la course', suiviData?.data?.status === 'ACCEPTED', JSON.stringify(suiviData?.data?.status));
check('livreur communiqué au client', suiviData?.data?.driver?.name === 'Livreur', JSON.stringify(suiviData?.data?.driver));
const suiviIntrus = await get(`/api/client/deliveries/${orderId}`, autre.accessToken);
check('un autre client ne peut pas suivre cette commande', suiviIntrus.status === 404, `status=${suiviIntrus.status}`);

console.log('\n[Dépôt d\'un avis]');
const avisTropTot = await post('/api/reviews', { orderId, rating: 5, comment: 'Excellent' }, cToken);
check('avis refusé tant que la commande n\'est pas terminée', avisTropTot.status === 400, `status=${avisTropTot.status}`);

await sqlExec(`UPDATE "Order" SET status = 'COMPLETED' WHERE id = '${orderId}'`);
const avis = await post('/api/reviews', { orderId, rating: 5, comment: 'Excellent, je recommande' }, cToken);
const avisData = await j(avis);
check('avis déposé (404 auparavant)', avis.status === 201, `status=${avis.status} ${JSON.stringify(avisData)}`);
check('un avis par produit commandé', avisData?.count === 1, `=${avisData?.count}`);

const doublon = await post('/api/reviews', { orderId, rating: 3 }, cToken);
check('second avis refusé (409)', doublon.status === 409, `status=${doublon.status}`);

const noteInvalide = await post('/api/reviews', { orderId, rating: 9 }, cToken);
check('note hors barème refusée', noteInvalide.status === 400, `status=${noteInvalide.status}`);

const avisCommercant = await j(await get(`/api/reviews/${storeId}`, m.accessToken));
const listeAvis = avisCommercant?.data || avisCommercant?.reviews || avisCommercant;
check('le commerçant voit l\'avis', Array.isArray(listeAvis) ? listeAvis.length === 1 : (listeAvis?.length ?? 0) === 1, JSON.stringify(avisCommercant)?.slice(0, 200));

console.log('\n[Favoris]');
const ajout = await post('/api/client/me/favorites', { storeId }, cToken);
check('ajout aux favoris', ajout.status < 300, `status=${ajout.status} ${JSON.stringify(await j(ajout))}`);
const favoris = await j(await get('/api/client/me/favorites', cToken));
check('la boutique est en favori', (favoris?.data || []).length === 1, `n=${favoris?.data?.length}`);
const retrait = await del(`/api/client/me/favorites/${storeId}`, null, cToken);
check('retrait des favoris', retrait.status < 300, `status=${retrait.status}`);
const favorisApres = await j(await get('/api/client/me/favorites', cToken));
check('favori bien retiré', (favorisApres?.data || []).length === 0, `n=${favorisApres?.data?.length}`);

await terminer();
