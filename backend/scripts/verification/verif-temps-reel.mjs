// Vérifie la poussée des notifications en direct et la création sans SKU.

import { io } from 'socket.io-client';
import { titre, check, j, uniq, post, terminer, API } from './outils.mjs';

const sup = await j(await post('/api/auth/signup', { email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const m = await j(await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const b = await j(await post('/api/stores', {
  orgId: m.organization.id, name: `Bou ${uniq}`, slug: `bou-${uniq}`,
  address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, m.accessToken));
const storeId = b.store?.id || b.id;

console.log('\n[Création de produit sans SKU]');
const sansSku = await post('/api/products', { storeId, name: 'Pizza Reine', price: 11.5, stock: 10, status: 'ACTIVE' }, m.accessToken);
const sansSkuData = await j(sansSku);
check('produit créé sans champ SKU', sansSku.status === 201, `status=${sansSku.status} ${JSON.stringify(sansSkuData)?.slice(0, 150)}`);
check('SKU généré automatiquement', !!sansSkuData?.product?.sku, JSON.stringify(sansSkuData?.product?.sku));

const skuVide = await post('/api/products', { storeId, name: 'Pizza Calzone', price: 13, stock: 5, status: 'ACTIVE', sku: '' }, m.accessToken);
const skuVideData = await j(skuVide);
check('SKU vide accepté (400 auparavant)', skuVide.status === 201, `status=${skuVide.status} ${JSON.stringify(skuVideData)?.slice(0, 200)}`);
check('SKU généré malgré la chaîne vide', !!skuVideData?.product?.sku, JSON.stringify(skuVideData?.product?.sku));

const skuEspaces = await post('/api/products', { storeId, name: 'Pizza Quatre', price: 14, stock: 5, status: 'ACTIVE', sku: '   ' }, m.accessToken);
check('SKU composé d\'espaces accepté', skuEspaces.status === 201, `status=${skuEspaces.status}`);

const skuFourni = await j(await post('/api/products', { storeId, name: 'Pizza Chef', price: 15, stock: 5, status: 'ACTIVE', sku: 'PIZZA-001' }, m.accessToken));
check('SKU explicite conservé', skuFourni?.product?.sku === 'PIZZA-001', JSON.stringify(skuFourni?.product?.sku));

console.log('\n[Notification poussée en direct]');
// Le commerçant écoute, le superowner répond à son ticket.
const socket = io(API, { auth: { token: m.accessToken }, transports: ['websocket', 'polling'] });
const recues = [];
socket.on('notification', (n) => recues.push(n));

await new Promise((resolve, reject) => {
  socket.on('connect', resolve);
  socket.on('connect_error', reject);
  setTimeout(() => reject(new Error('connexion socket trop lente')), 8000);
});
check('connexion temps réel établie', socket.connected);

const ticket = await j(await post('/api/support/tickets', {
  orgId: m.organization.id, subject: 'Souci de caisse', description: 'La caisse ne répond plus', category: 'TECHNICAL',
}, m.accessToken));
const ticketId = ticket?.data?.id || ticket?.ticket?.id || ticket?.id;
check('ticket créé', !!ticketId, JSON.stringify(ticket)?.slice(0, 120));

recues.length = 0;
const reponse = await post(`/api/admin/tickets/${ticketId}/messages`, { body: 'Bonjour, nous regardons cela tout de suite.' }, sup.accessToken);
check('réponse du support enregistrée', reponse.status < 300, `status=${reponse.status} ${JSON.stringify(await j(reponse))}`);

// On attend la poussée, sans recharger quoi que ce soit.
await new Promise((r) => setTimeout(r, 2500));
check('notification reçue sans rechargement', recues.length === 1, `n=${recues.length}`);
check('titre correct', recues[0]?.title === 'Nouvelle réponse à un ticket', JSON.stringify(recues[0]?.title));
check('lien profond fourni', typeof recues[0]?.link === 'string' && recues[0].link.includes('/support'), JSON.stringify(recues[0]?.link));
check('marquée non lue', recues[0]?.isRead === false, JSON.stringify(recues[0]?.isRead));

// Le superowner ne doit pas recevoir la notification destinée au commerçant.
const socketSup = io(API, { auth: { token: sup.accessToken }, transports: ['websocket', 'polling'] });
const recuesSup = [];
socketSup.on('notification', (n) => recuesSup.push(n));
await new Promise((resolve) => socketSup.on('connect', resolve));

recues.length = 0;
await post(`/api/admin/tickets/${ticketId}/messages`, { body: 'Complément d\'information.' }, sup.accessToken);
await new Promise((r) => setTimeout(r, 2500));
check('le commerçant reçoit la seconde réponse', recues.length === 1, `n=${recues.length}`);
check('l\'auteur du message ne se notifie pas lui-même', recuesSup.length === 0, `n=${recuesSup.length}`);

// Une notification de boutique doit aussi partir en direct.
recues.length = 0;
await post(`/api/notifications/${storeId}`, {
  type: 'STOCK_LOW', title: 'Stock faible', message: 'Il reste 2 pizzas', recipientEmail: `m-${uniq}@t.fr`,
}, m.accessToken);
await new Promise((r) => setTimeout(r, 2000));
check('notification de boutique poussée', recues.length === 1, `n=${recues.length}`);

socket.disconnect();
socketSup.disconnect();

await terminer();
