// Vérifie l'espace client : historique, suivi de livraison, avis, favoris.
// Plateforme

import { inscription, check, j, uniq, post, get, patch, del, sqlExec, terminer, validerLivreur } from './outils.mjs';

const plateforme = await j(
  await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` })
);
const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const b = await j(await post('/api/stores', {
  orgId: m.organization.id, name: `Bou ${uniq}`, slug: `bou-${uniq}`,
  address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, m.accessToken));
const storeId = b.store?.id || b.id;
const prod = await j(await post('/api/products', { storeId, name: 'Pizza', price: 12, stock: 20, status: 'ACTIVE' }, m.accessToken));
const productId = prod.product.id;

// Le client a un compte utilisateur ET une fiche client créée par sa commande.
const emailClient = `client-${uniq}@t.fr`;
const compteClient = await j(await inscription({ email: emailClient, password: 'Password123!', name: 'Client Test' }));
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
const autre = await j(await inscription({ email: `autre-${uniq}@t.fr`, password: 'Password123!', name: 'Autre' }));
// Depuis que l'espace client est ouvert à tout compte, sa fiche naît à la
// première visite : l'historique répond, vide, plutôt qu'un 404.
const historiqueAutre = await get('/api/client/me/orders', autre.accessToken);
const historiqueAutreData = await j(historiqueAutre);
check(
  'un compte sans commande obtient un historique vide',
  historiqueAutre.status === 200 && (historiqueAutreData?.data || []).length === 0,
  `status=${historiqueAutre.status} n=${historiqueAutreData?.data?.length}`
);

console.log('\n[Suivi de livraison]');
const sansCourse = await j(await get(`/api/client/deliveries/${orderId}`, cToken));
check('aucune course : réponse vide et non erreur', sansCourse?.data === null, JSON.stringify(sansCourse));

const livreur = await j(await post('/api/drivers/register', {
  name: 'Livreur', email: `d-${uniq}@t.fr`, password: 'Password123!', phone: '0611111111', vehicleType: 'bike',
}));
// La course passe par l'attribution : un livreur ne peut plus prendre une
// course qui ne lui a pas été proposée.
await sqlExec(`UPDATE "Store" SET latitude = 45.764, longitude = 4.8357 WHERE id = '${storeId}'`);
// Il ne roule qu'une fois son dossier validé par la plateforme.
await validerLivreur(livreur.accessToken, plateforme.accessToken);
await patch('/api/drivers/availability', { isOnline: true }, livreur.accessToken);
await patch('/api/drivers/location', { latitude: 45.765, longitude: 4.836 }, livreur.accessToken);

const courseProposee = await j(await post(`/api/orders/${orderId}/dispatch`, {}, m.accessToken));
const propositionsClient = await j(await get('/api/drivers/offers', livreur.accessToken));
await post(`/api/drivers/offers/${propositionsClient?.data?.[0]?.id}/accept`, null, livreur.accessToken);

const suivi = await get(`/api/client/deliveries/${orderId}`, cToken);
const suiviData = await j(suivi);
check('suivi accessible', suivi.status === 200, `status=${suivi.status}`);
check('statut de la course', suiviData?.data?.status === 'ACCEPTED', JSON.stringify(suiviData?.data?.status));
check('livreur communiqué au client', suiviData?.data?.driver?.name === 'Livreur', JSON.stringify(suiviData?.data?.driver));
check('la boutique de départ est nommée', !!suiviData?.data?.boutique, JSON.stringify(suiviData?.data?.boutique));
check('le point de retrait est donné', suiviData?.data?.retrait?.latitude > 45, JSON.stringify(suiviData?.data?.retrait));
check('aucune position tant que le livreur n a pas bougé', suiviData?.data?.position === null, JSON.stringify(suiviData?.data?.position));

// Le livreur avance : le client doit voir la position et la distance restante.
await patch('/api/drivers/location', { latitude: 45.77, longitude: 4.85 }, livreur.accessToken);
const enRoute = await j(await get(`/api/client/deliveries/${orderId}`, cToken));

check('la position du livreur remonte au client', enRoute?.data?.position?.latitude > 45.76, JSON.stringify(enRoute?.data?.position));
check('elle est horodatée', !!enRoute?.data?.position?.misAJourLe, JSON.stringify(enRoute?.data?.position));
check('une distance restante est calculée', enRoute?.data?.distanceRestanteKm >= 0, `=${enRoute?.data?.distanceRestanteKm}`);

// Le défaut corrigé : la position du livreur ne doit pas devenir la destination.
check(
  'la destination reste distincte de la position',
  JSON.stringify(enRoute?.data?.destination) !== JSON.stringify(enRoute?.data?.position),
  `destination=${JSON.stringify(enRoute?.data?.destination)}`
);
const suiviIntrus = await get(`/api/client/deliveries/${orderId}`, autre.accessToken);
check('un autre client ne peut pas suivre cette commande', suiviIntrus.status === 404, `status=${suiviIntrus.status}`);

console.log('\n[Dépôt d\'un avis]');
const avisTropTot = await post('/api/reviews', { orderId, productId, rating: 5, comment: 'Excellent' }, cToken);
check('avis refusé tant que la commande n\'est pas terminée', avisTropTot.status === 400, `status=${avisTropTot.status}`);

await sqlExec(`UPDATE "Order" SET status = 'COMPLETED' WHERE id = '${orderId}'`);

// Un avis porte sur un plat précis de la commande, ou sur le restaurant.
const sansProduit = await post('/api/reviews', { orderId, rating: 5 }, cToken);
check('un avis de plat sans plat désigné est refusé', sansProduit.status === 400, `status=${sansProduit.status}`);

const horsCommande = await post('/api/reviews', { orderId, productId: storeId, rating: 5 }, cToken);
check('un plat absent de la commande ne se note pas', horsCommande.status === 400, `status=${horsCommande.status}`);

const avis = await post('/api/reviews', { orderId, productId, rating: 5, comment: 'Excellent, je recommande' }, cToken);
const avisData = await j(avis);
check('avis sur le plat déposé', avis.status === 201, `status=${avis.status} ${JSON.stringify(avisData)}`);

// Un seul avis par plat : le second envoi remplace le premier.
const miseAJour = await post('/api/reviews', { orderId, productId, rating: 3, comment: 'Moins bon cette fois' }, cToken);
check('second avis sur le même plat : mis à jour (200)', miseAJour.status === 200, `status=${miseAJour.status}`);

const avisRestaurant = await post('/api/reviews', { orderId, type: 'STORE', rating: 4, comment: 'Accueil parfait' }, cToken);
check('avis sur le restaurant déposé', avisRestaurant.status === 201, `status=${avisRestaurant.status}`);

const avisDonnes = await j(await get(`/api/reviews/commande/${orderId}`, cToken));
check('le formulaire retrouve la note du restaurant', avisDonnes?.data?.restaurant?.rating === 4, JSON.stringify(avisDonnes));
check('et celle du plat, mise à jour', avisDonnes?.data?.produits?.[productId]?.rating === 3, JSON.stringify(avisDonnes?.data?.produits));
check('avis tout juste donné : pas de relance', avisDonnes?.data?.aRedemander === false, JSON.stringify(avisDonnes?.data?.aRedemander));
const avisIntrus = await get(`/api/reviews/commande/${orderId}`, autre.accessToken);
check('un autre client ne lit pas ces avis', avisIntrus.status === 404, `status=${avisIntrus.status}`);

const relanceAvant = (await j(await get('/api/client/me/orders', cToken)))?.data?.[0]?.avisARedemander;
check('historique : pas de relance sur un avis récent', relanceAvant === false, JSON.stringify(relanceAvant));

// L'avis date de vingt jours, la commande d'hier : on relance.
await sqlExec(`UPDATE "Review" SET "editedAt" = NOW() - INTERVAL '20 days' WHERE "productId" IS NULL AND "storeId" = '${storeId}'`);
await sqlExec(`UPDATE "Order" SET "createdAt" = NOW() - INTERVAL '1 day' WHERE id = '${orderId}'`);
const relanceApres = (await j(await get('/api/client/me/orders', cToken)))?.data?.[0]?.avisARedemander;
check('historique : relance quand l avis a plus de quinze jours', relanceApres === true, JSON.stringify(relanceApres));

const doublonRestaurant = await post('/api/reviews', { orderId, type: 'STORE', rating: 2 }, cToken);
check('second avis sur le restaurant : mis à jour (200)', doublonRestaurant.status === 200, `status=${doublonRestaurant.status}`);

// L'avis sur le restaurant ne porte sur aucun plat : ce sont ceux-là que
// comptent les statistiques du commerce, pas les avis de plats.
const statsCommerce = await j(await get(`/api/reviews/${storeId}/store/stats`, m.accessToken));
const statsData = statsCommerce?.data || statsCommerce;
check('les statistiques du commerce le comptent', statsData?.totalReviews === 1, JSON.stringify(statsCommerce));
// Un client, une voix : sa note remplacée, pas ajoutée.
check('avec sa dernière note', statsData?.averageRating === 2, JSON.stringify(statsCommerce));

const noteInvalide = await post('/api/reviews', { orderId, productId, rating: 9 }, cToken);
check('note hors barème refusée', noteInvalide.status === 400, `status=${noteInvalide.status}`);

const avisCommercant = await j(await get(`/api/reviews/${storeId}`, m.accessToken));
const listeAvis = avisCommercant?.data || avisCommercant?.reviews || avisCommercant;
check('le commerçant voit les deux avis', Array.isArray(listeAvis) && listeAvis.length === 2, JSON.stringify(avisCommercant)?.slice(0, 200));

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
