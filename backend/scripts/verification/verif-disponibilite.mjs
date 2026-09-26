// Vérifie le remplacement du stock chiffré par une disponibilité simple.

import { inscription, check, j, uniq, post, get, put, patch, terminer } from './outils.mjs';

await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` });
const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const T = m.accessToken;
const b = await j(await post('/api/stores', {
  orgId: m.organization.id, name: `Bou ${uniq}`, slug: `bou-${uniq}`, address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, T));
const storeId = b.store?.id || b.id;

console.log('[Création sans stock]');
const creation = await post('/api/products', { storeId, name: 'Pizza Reine', price: 12, status: 'ACTIVE' }, T);
const prod = await j(creation);
const prodId = prod?.product?.id;
check('produit créé sans champ stock', creation.status === 201, `status=${creation.status} ${JSON.stringify(prod)?.slice(0, 150)}`);
check('disponible par défaut', prod?.product?.isAvailable === true, JSON.stringify(prod?.product?.isAvailable));

console.log('\n[Bascule épuisé / disponible]');
const epuise = await patch(`/api/products/${prodId}/availability`, { isAvailable: false, storeId }, T);
const epuiseData = await j(epuise);
check('passage en épuisé', epuise.status === 200, `status=${epuise.status} ${JSON.stringify(epuiseData)?.slice(0, 150)}`);
check('message explicite', epuiseData?.message?.includes('épuisé'), JSON.stringify(epuiseData?.message));
const relu = await j(await get(`/api/products/${prodId}`));
check('état persisté', relu?.isAvailable === false, JSON.stringify(relu?.isAvailable));
check('le produit reste publié', relu?.status === 'ACTIVE', JSON.stringify(relu?.status));

console.log('\n[La commande refuse un produit épuisé]');
const panier = (qte = 1) => ({
  conditionsAcceptees: true,
  storeId, customerName: 'Client Test', customerEmail: `c-${uniq}@t.fr`, customerPhone: '0600000000',
  deliveryType: 'PICKUP', totalAmount: 12 * qte,
  items: [{ productId: prodId, quantity: qte, price: 12 }],
});
const refus = await post('/api/orders', panier());
const refusData = await j(refus);
check('commande refusée', refus.status === 400, `status=${refus.status} ${JSON.stringify(refusData)?.slice(0, 150)}`);
check('message nommant le produit', (refusData?.error || '').includes('Pizza Reine'), JSON.stringify(refusData?.error));

console.log('\n[Remise en vente]');
const dispo = await patch(`/api/products/${prodId}/availability`, { isAvailable: true, storeId }, T);
check('retour en disponible', dispo.status === 200, `status=${dispo.status}`);
const acceptee = await post('/api/orders', panier(2));
const accepteeData = await j(acceptee);
check('commande acceptée', acceptee.status === 201, `status=${acceptee.status} ${JSON.stringify(accepteeData)?.slice(0, 150)}`);
check('lignes enregistrées (absentes auparavant)', (accepteeData?.order?.items || []).length === 1, `n=${accepteeData?.order?.items?.length}`);
check('quantité conservée', accepteeData?.order?.items?.[0]?.quantity === 2, JSON.stringify(accepteeData?.order?.items?.[0]?.quantity));
check('total de ligne calculé', Number(accepteeData?.order?.items?.[0]?.total) === 24, JSON.stringify(accepteeData?.order?.items?.[0]?.total));

console.log('\n[Plus de décompte de stock]');
const apresVente = await j(await get(`/api/products/${prodId}`));
check('le produit reste disponible après vente', apresVente?.isAvailable === true, JSON.stringify(apresVente?.isAvailable));
const enorme = await post('/api/orders', panier(999));
check('aucune limite de quantité', enorme.status === 201, `status=${enorme.status}`);

console.log('\n[Modification via le formulaire produit]');
const misAJour = await j(await put(`/api/products/${prodId}`, { isAvailable: false, sku: `REF-${uniq}` }, T));
check('disponibilité modifiable par le formulaire', misAJour?.product?.isAvailable === false, JSON.stringify(misAJour?.product?.isAvailable));
check('référence modifiable (ignorée auparavant)', misAJour?.product?.sku === `REF-${uniq}`, JSON.stringify(misAJour?.product?.sku));

await terminer();
