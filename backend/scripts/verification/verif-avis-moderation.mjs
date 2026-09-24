// Le commerçant ne rejette ni ne supprime un avis : il le signale, et la
// plateforme tranche.

import { inscription, titre, check, j, uniq, post, get, patch, del, sqlExec, sqlScalaire, terminer } from './outils.mjs';

const MDP = 'Password123!';

// Le premier compte inscrit est la plateforme.
const plateforme = await j(await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` }));
const TP = plateforme.accessToken;

const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` }));
const TM = m.accessToken;
const b = await j(await post('/api/stores', {
  orgId: m.organization.id, name: `Bou ${uniq}`, slug: `bou-${uniq}`,
  address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, TM));
const storeId = b.store?.id || b.id;
const productId = (await j(await post('/api/products', { storeId, name: 'Pizza', price: 12, stock: 20, status: 'ACTIVE' }, TM))).product.id;

const emailClient = `c-${uniq}@t.fr`;
const TC = (await j(await inscription({ email: emailClient, password: MDP, name: 'Client Test' }))).accessToken;
const orderId = (await j(await post('/api/orders', {
  storeId, customerName: 'Client Test', customerEmail: emailClient, customerPhone: '0600000000',
  deliveryType: 'PICKUP', totalAmount: 12, feesAmount: 0,
}))).order.id;
await sqlExec(`INSERT INTO "OrderItem" (id, "orderId", "productId", quantity, "selectedOptions", price, total, "createdAt") VALUES ('item-${uniq}', '${orderId}', '${productId}', 1, '{}', 12, 12, NOW())`);
await sqlExec(`UPDATE "Order" SET status = 'COMPLETED' WHERE id = '${orderId}'`);

await post('/api/reviews', { orderId, type: 'STORE', rating: 1, comment: 'Nul' }, TC);
const avisMerchant = async (filtre) =>
  (await j(await get(`/api/reviews/${storeId}${filtre ? `?filtre=${filtre}` : ''}`, TM)))?.data || [];
const avisRestaurant = async () => (await avisMerchant()).find((a) => a.productId === null);
const stats = async () => (await j(await get(`/api/reviews/${storeId}/store/stats`)))?.totalReviews;
const avis = await avisRestaurant();

titre('Le commerçant ne décide plus');
check('plus de rejet', (await patch(`/api/reviews/${storeId}/${avis.id}/status`, { status: 'REJECTED' }, TM)).status === 404);
check('plus de suppression', (await del(`/api/reviews/${storeId}/${avis.id}`, null, TM)).status === 404);
check('plus d avis fabriqué par le commerçant', (await post(`/api/reviews/${storeId}`, { productId, rating: 5 }, TM)).status === 404);
check('l avis est toujours là', (await sqlScalaire(`SELECT count(*) FROM "Review" WHERE id = '${avis.id}'`)) == 1);
check('il peut le signaler', avis.peutSignaler === true && avis.signalement === null, JSON.stringify(avis));

titre('Signaler');
const sansMotif = await post(`/api/reviews/${storeId}/${avis.id}/report`, { reason: 'x' }, TM);
check('un motif est exigé', sansMotif.status === 400, `status=${sansMotif.status}`);
const signale = await post(`/api/reviews/${storeId}/${avis.id}/report`, { reason: 'Ce client n a jamais mangé chez nous' }, TM);
check('signalement enregistré', signale.status === 201, `status=${signale.status}`);
check('deux fois, non', (await post(`/api/reviews/${storeId}/${avis.id}/report`, { reason: 'Encore une fois' }, TM)).status === 409);
check('l avis reste publié en attendant', (await stats()) === 1);
const apres = await avisRestaurant();
check('le commerçant voit qu il attend la plateforme', apres.signalement === 'EN_ATTENTE' && !apres.peutSignaler, JSON.stringify(apres));
check('filtre « signalés »', (await avisMerchant('signales')).length === 1);
check(
  'la plateforme est prévenue',
  (await sqlScalaire(`SELECT count(*) FROM "Notification" WHERE "recipientEmail" = 'p-${uniq}@t.fr' AND link = '/superowner/reviews'`)) >= 1
);

titre('La plateforme tranche');
check('un commerçant ne voit pas la file', (await get('/api/superowner/review-reports', TM)).status === 403);
const file = await j(await get('/api/superowner/review-reports', TP));
const s1 = file?.data?.[0];
check('la file contient le signalement', file?.total === 1 && s1?.motif?.includes('jamais mangé'), JSON.stringify(file)?.slice(0, 200));
check('avec l avis, la boutique et l auteur', s1?.avis?.note === 1 && s1?.avis?.boutique?.id === storeId && !!s1?.signalePar?.email, JSON.stringify(s1));

const conserve = await post(`/api/superowner/review-reports/${s1.id}/decision`, { decision: 'KEPT', note: 'Le client a bien commandé' }, TP);
check('conserver', conserve.status === 200, `status=${conserve.status}`);
check('pas deux décisions', (await post(`/api/superowner/review-reports/${s1.id}/decision`, { decision: 'REMOVED' }, TP)).status === 409);
const conserveVu = await avisRestaurant();
check('le commerçant voit « conservé » et le motif', conserveVu.signalement === 'CONSERVE' && conserveVu.motifDecision === 'Le client a bien commandé', JSON.stringify(conserveVu));
check('il ne peut pas re-signaler la même version', conserveVu.peutSignaler === false && (await post(`/api/reviews/${storeId}/${avis.id}/report`, { reason: 'Je réessaie quand même' }, TM)).status === 409);
check('le commerçant est prévenu', (await sqlScalaire(`SELECT count(*) FROM "Notification" WHERE "recipientEmail" = 'm-${uniq}@t.fr' AND title = 'Avis conservé'`)) == 1);

await post('/api/reviews', { orderId, type: 'STORE', rating: 1, comment: 'Toujours nul, et impoli' }, TC);
check('après une retouche du client, il peut re-signaler', (await avisRestaurant()).peutSignaler === true);

const s2 = await j(await post(`/api/reviews/${storeId}/${avis.id}/report`, { reason: 'Propos injurieux' }, TM));
const retire = await post(`/api/superowner/review-reports/${s2.signalement.id}/decision`, { decision: 'REMOVED' }, TP);
check('retirer', retire.status === 200, `status=${retire.status}`);
check('l avis n est plus compté', (await stats()) === 0);
check('le commerçant le voit retiré', (await avisRestaurant()).signalement === 'RETIRE' && (await avisMerchant('retires')).length === 1);
check('journal de la plateforme', (await sqlScalaire(`SELECT count(*) FROM "SystemAuditLog" WHERE target = '${avis.id}'`)) == 2);

titre('Le client retouche un avis retiré');
const vuClient = await j(await get(`/api/reviews/commande/${orderId}`, TC));
check('le client sait qu il est retiré', vuClient?.data?.restaurant?.retire === true, JSON.stringify(vuClient?.data?.restaurant));
await post('/api/reviews', { orderId, type: 'STORE', rating: 2, comment: 'Je reformule poliment' }, TC);
check('il reste retiré', (await stats()) === 0);
const file2 = await j(await get('/api/superowner/review-reports', TP));
check('il revient devant la plateforme, sans auteur', file2?.total === 1 && file2.data[0].signalePar === null, JSON.stringify(file2?.data?.[0])?.slice(0, 200));
await post(`/api/superowner/review-reports/${file2.data[0].id}/decision`, { decision: 'KEPT' }, TP);
check('republié par la plateforme', (await stats()) === 1);
const traites = await j(await get('/api/superowner/review-reports?etat=TRAITES', TP));
check('historique des décisions', traites?.total === 3, `total=${traites?.total}`);

await terminer();
