// Passe en revue chaque fonctionnalité de l'espace commerçant.

import { inscription, check, j, uniq, post, get, put, patch, del, terminer } from './outils.mjs';

await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` });
const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const T = m.accessToken, orgId = m.organization.id;
const b = await j(await post('/api/stores', {
  orgId, name: `Bou ${uniq}`, slug: `bou-${uniq}`, address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, T));
const storeId = b.store?.id || b.id;

console.log('\n=== CATALOGUE ===');
const cat = await post('/api/categories', { storeId, name: 'Viennoiseries' }, T);
const catData = await j(cat);
const catId = catData?.category?.id || catData?.id;
check('Catégorie — création', cat.status < 300, `status=${cat.status}`);
check('Catégorie — modification', (await put(`/api/categories/${catId}`, { name: 'Pâtisseries' }, T)).status < 300);
const prod = await post('/api/products', { storeId, name: 'Croissant', price: 1.2, stock: 50, status: 'ACTIVE', categoryId: catId }, T);
const prodData = await j(prod);
const prodId = prodData?.product?.id;
check('Produit — création', prod.status === 201, `status=${prod.status}`);
check('Produit — modification', (await put(`/api/products/${prodId}`, { price: 1.4 }, T)).status < 300);
check('Produit — changement de statut', (await put(`/api/products/${prodId}`, { status: 'DRAFT' }, T)).status < 300);

console.log('\n=== ÉTIQUETTES, PHOTOS, RÉFÉRENCEMENT ===');
const tag = await post(`/api/product-tags/${storeId}`, { name: 'Nouveauté', color: '#3B82F6' }, T);
const tagData = await j(tag);
const tagId = tagData?.data?.id || tagData?.tag?.id || tagData?.id;
check('Étiquette — création', tag.status < 300, `status=${tag.status} ${JSON.stringify(tagData)?.slice(0, 120)}`);
check('Étiquette — modification', (await patch(`/api/product-tags/${storeId}/${tagId}`, { name: 'Best-seller' }, T)).status < 300);
check('Étiquette — rattachement à un produit', (await post(`/api/product-tags/${storeId}/${tagId}/products/${prodId}`, {}, T)).status < 300);
check('Étiquette — suppression', (await del(`/api/product-tags/${storeId}/${tagId}`, null, T)).status < 300);

const media = await post(`/api/product-media/${storeId}/${prodId}`, { url: 'https://exemple.fr/photo.jpg', type: 'image' }, T);
check('Photo produit — ajout', media.status < 300, `status=${media.status} ${JSON.stringify(await j(media))?.slice(0, 150)}`);
check('Photo produit — lecture', (await get(`/api/product-media/${storeId}/${prodId}`, T)).status === 200);

const seo = await patch(`/api/product-seo/${storeId}/${prodId}`, { metaTitle: 'Croissant maison', metaDescription: 'Pur beurre' }, T);
check('Référencement — enregistrement', seo.status < 300, `status=${seo.status} ${JSON.stringify(await j(seo))?.slice(0, 150)}`);

console.log('\n=== BOUTIQUE ===');
check('Horaires — lecture', (await get(`/api/store-hours/${storeId}`, T)).status === 200);
const horaires = await put(`/api/store-hours/${storeId}/day/MON`, { open: '08:00', close: '19:00', closed: false }, T);
check('Horaires — réglage d\'un jour', horaires.status < 300, `status=${horaires.status} ${JSON.stringify(await j(horaires))?.slice(0, 180)}`);
check('Horaires — ouverture/fermeture', (await patch(`/api/store-hours/${storeId}/day/MON/toggle`, {}, T)).status < 300);
const creneau = await post(`/api/store-hours/${storeId}/pickup-slots`, { start: '10:00', end: '10:30', maxOrders: 5 }, T);
check('Créneaux de retrait — création', creneau.status < 300, `status=${creneau.status} ${JSON.stringify(await j(creneau))?.slice(0, 150)}`);

const zone = await post(
  '/api/delivery-zones',
  { storeId, name: 'Centre-ville', radiusKm: 3, baseFee: 2.5, minOrder: 10 },
  T
);
const zoneData = await j(zone);
const zoneId = zoneData?.zone?.id || zoneData?.data?.id || zoneData?.id;
check('Zone de livraison — création', zone.status < 300, `status=${zone.status} ${JSON.stringify(zoneData)?.slice(0, 150)}`);
check('Zone de livraison — suppression', (await del(`/api/delivery-zones/${zoneId}`, null, T)).status < 300);

const taxe = await post(`/api/tax-settings/${storeId}`, { name: 'TVA 10', rate: 10, applicableTo: 'all' }, T);
const taxeData = await j(taxe);
const taxeId = taxeData?.data?.id || taxeData?.taxSetting?.id || taxeData?.id;
check('Taxe — création', taxe.status < 300, `status=${taxe.status} ${JSON.stringify(taxeData)?.slice(0, 150)}`);
check('Taxe — modification', (await patch(`/api/tax-settings/${storeId}/${taxeId}`, { rate: 5.5 }, T)).status < 300);
check('Taxe — suppression', (await del(`/api/tax-settings/${storeId}/${taxeId}`, null, T)).status < 300);

const paiement = await post(`/api/payment-methods/${storeId}`, { type: 'CASH', name: 'Espèces', commissionPercent: 0, fixedFee: 0 }, T);
const paiementData = await j(paiement);
const paiementId = paiementData?.method?.id || paiementData?.data?.id || paiementData?.id;
check('Moyen de paiement — création', paiement.status < 300, `status=${paiement.status} ${JSON.stringify(paiementData)?.slice(0, 150)}`);
check('Moyen de paiement — activation', (await patch(`/api/payment-methods/${storeId}/${paiementId}/toggle`, {}, T)).status < 300);
check('Moyen de paiement — suppression', (await del(`/api/payment-methods/${storeId}/${paiementId}`, null, T)).status < 300);

const reglages = await put(`/api/store-settings/${storeId}`, { acceptsDelivery: true, deliveryCost: 3 }, T);
check('Paramètres de boutique — enregistrement', reglages.status < 300, `status=${reglages.status} ${JSON.stringify(await j(reglages))?.slice(0, 150)}`);

console.log('\n=== VENTES ===');
await post('/api/orders', { storeId, customerName: 'Client', customerEmail: `c-${uniq}@t.fr`, customerPhone: '0600000000', deliveryType: 'PICKUP', totalAmount: 25 });
const cmds = await j(await get(`/api/order-management/${storeId}`, T));
const cmdId = (cmds?.data || cmds?.orders || [])[0]?.id;
check('Commande — visible côté commerçant', !!cmdId, JSON.stringify(cmds)?.slice(0, 150));
// Accepter demande un temps de préparation : le changement de statut
// générique ne le permet plus (0c49387).
const acceptation = await post(`/api/order-management/${storeId}/${cmdId}/accept`, { preparationMinutes: 20 }, T);
check('Commande — acceptation', acceptation.status < 300, `status=${acceptation.status} ${JSON.stringify(await j(acceptation))?.slice(0, 150)}`);
check('Commande — note interne', (await post(`/api/order-management/${storeId}/${cmdId}/notes`, { notes: 'Sans sucre' }, T)).status < 300);
check('Facture — génération', (await get(`/api/invoices/${storeId}/${cmdId}`, T)).status === 200);
check('Clients — liste', (await get(`/api/customers/${storeId}`, T)).status === 200);
check('Avis — liste', (await get(`/api/reviews/${storeId}`, T)).status === 200);

console.log('\n=== PROMOTIONS ET MARKETING ===');
const promo = await post('/api/promotions', { storeId, code: `PROMO${uniq}`.toUpperCase(), type: 'PERCENTAGE', discountValue: 10, applicableToAll: true }, T);
const promoData = await j(promo);
const promoId = promoData?.promotion?.id || promoData?.id;
check('Promotion — création', promo.status < 300, `status=${promo.status} ${JSON.stringify(promoData)?.slice(0, 150)}`);
check('Promotion — activation/désactivation', (await patch(`/api/promotions/${promoId}/toggle`, {}, T)).status < 300);
check('Promotion — suppression', (await del(`/api/promotions/${promoId}`, null, T)).status < 300);

const campagne = await post(`/api/marketing/${storeId}`, { name: 'Rentrée', type: 'EMAIL', message: 'Profitez de -10 %', targetAudience: 'all' }, T);
const campagneData = await j(campagne);
const campagneId = campagneData?.data?.id || campagneData?.campaign?.id || campagneData?.id;
check('Campagne — création', campagne.status < 300, `status=${campagne.status} ${JSON.stringify(campagneData)?.slice(0, 150)}`);
check('Campagne — lancement', (await patch(`/api/marketing/${storeId}/${campagneId}/status`, { status: 'ACTIVE' }, T)).status < 300);
check('Campagne — suppression', (await del(`/api/marketing/${storeId}/${campagneId}`, null, T)).status < 300);

console.log('\n=== GESTION ===');
const staff = await post('/api/staff', { storeId, email: `staff-${uniq}@t.fr`, name: 'Employé Test', role: 'CASHIER' }, T);
const staffData = await j(staff);
const staffId = staffData?.staff?.id || staffData?.data?.id || staffData?.id;
check('Personnel — ajout', staff.status < 300, `status=${staff.status} ${JSON.stringify(staffData)?.slice(0, 180)}`);
if (staffId) check('Personnel — retrait', (await del(`/api/staff/${staffId}`, null, T)).status < 300);

check('Rapports — lecture', (await get(`/api/reports/sales?storeId=${storeId}`, T)).status === 200, '');
check('Notifications — liste', (await get(`/api/notifications/${storeId}`, T)).status === 200);
check('Notifications — compteur', (await get(`/api/notifications/${storeId}/unread/count`, T)).status === 200);

const ticket = await post('/api/support/tickets', { orgId, subject: 'Besoin d\'aide', description: 'Question sur la facturation', category: 'BILLING' }, T);
const ticketData = await j(ticket);
const ticketId = ticketData?.data?.id || ticketData?.id;
check('Support — ouverture d\'un ticket', ticket.status < 300, `status=${ticket.status}`);
check('Support — réponse du commerçant', (await post(`/api/support/tickets/${ticketId}/messages`, { body: 'Merci' }, T)).status < 300);

await terminer();
