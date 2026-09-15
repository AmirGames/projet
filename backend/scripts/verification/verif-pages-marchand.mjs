// Vérifie que les routes appelées par les pages commerçant répondent bien
// quand on leur passe un storeId, et échouent avec un orgId (l'ancien bug).

import { check, j, uniq, post, get, terminer } from './outils.mjs';

await post('/api/auth/signup', { email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` });
const m = await j(await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const orgId = m.organization.id, token = m.accessToken;

const b = await j(await post('/api/stores', {
  orgId, name: `Bou ${uniq}`, slug: `bou-${uniq}`, address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, token));
const storeId = b.store?.id || b.id;

// Un produit à 2,50 € : le prix doit revenir tel quel, pas en centimes.
const p = await j(await post('/api/products', { storeId, name: 'Croissant', price: 2.5, stock: 20, status: 'ACTIVE' }, token));
check('produit enregistré à 2.50', Number(p?.product?.price) === 2.5, JSON.stringify(p?.product?.price));

await post('/api/orders', {
  storeId, customerName: 'Client', customerEmail: `c-${uniq}@t.fr`, customerPhone: '0600000000',
  deliveryType: 'PICKUP', totalAmount: 12.5,
});

console.log('\n[Routes appelées par les pages réparées]');
const routes = [
  ['Commandes',           `/api/order-management/${storeId}`],
  ['Commandes (stats)',   `/api/order-management/${storeId}/stats/overview`],
  ['Clients',             `/api/customers/${storeId}`],
  ['Avis',                `/api/reviews/${storeId}`],
  ['Factures',            `/api/invoices/${storeId}`],
  ['Factures (revenus)',  `/api/invoices/${storeId}/stats/revenue`],
  ['Marketing',           `/api/marketing/${storeId}`],
  ['Moyens de paiement',  `/api/payment-methods/${storeId}`],
  ['Taxes',               `/api/tax-settings/${storeId}`],
  ['Analytics',           `/api/orders?storeId=${storeId}`],
];

for (const [nom, chemin] of routes) {
  const r = await get(chemin, token);
  check(`${nom} répond 200 avec un storeId`, r.status === 200, `status=${r.status} ${chemin}`);
}

console.log('\n[L\'ancien paramètre ne devait effectivement pas marcher]');
const ancien = await get(`/api/order-management/${orgId}`, token);
const ancienData = await j(ancien);
check('un orgId ne renvoie aucune commande', ancien.status !== 200 || (ancienData?.orders || []).length === 0,
      `status=${ancien.status} n=${(ancienData?.orders || []).length}`);

console.log('\n[Montants : euros et non centimes]');
const cmds = await j(await get(`/api/orders?storeId=${storeId}`, token));
const montant = Number(cmds?.orders?.[0]?.totalAmount);
check('commande enregistrée à 12,50 €', montant === 12.5, `=${montant}`);
const stats = await j(await get(`/api/order-management/${storeId}/stats/overview`, token));
check('stats commandes cohérentes', JSON.stringify(stats).includes('12.5') || stats?.totalOrders >= 1, JSON.stringify(stats)?.slice(0, 150));

const produits = await j(await get(`/api/products?storeId=${storeId}`, token));
check('prix du produit inchangé côté lecture', Number(produits?.products?.[0]?.price) === 2.5, JSON.stringify(produits?.products?.[0]?.price));

console.log('\n[Clients : rattachés par leurs commandes, fiche globale]');
const clients = await j(await get(`/api/customers/${storeId}`, token));
check('liste des clients accessible', Array.isArray(clients?.data), JSON.stringify(clients)?.slice(0, 150));
check('le client ayant commandé apparaît', (clients?.data || []).length === 1, `n=${(clients?.data || []).length}`);
const client = clients?.data?.[0];
check('total dépensé calculé sur cette boutique', Number(client?.totalSpent) === 12.5, `=${client?.totalSpent}`);
check('nombre de commandes correct', client?.totalOrders === 1, `=${client?.totalOrders}`);

const fiche = await get(`/api/customers/${storeId}/${client?.id}`, token);
check('fiche client consultable (renvoyait 404)', fiche.status === 200, `status=${fiche.status}`);
const ficheData = await j(fiche);
check('la fiche liste ses commandes', (ficheData?.orders || []).length === 1, JSON.stringify(ficheData?.orders?.length));

// Un autre commerçant ne doit pas voir ce client.
const autre = await j(await post('/api/auth/signup', { email: `x-${uniq}@t.fr`, password: 'Password123!', name: `X ${uniq}` }));
const autreToken = autre.accessToken;
const autreBoutique = await j(await post('/api/stores', {
  orgId: autre.organization.id, name: `Autre ${uniq}`, slug: `autre-${uniq}`,
  address: '9 rue', city: 'Lyon', postalCode: '69009', phone: '0400000009',
}, autreToken));
const autreStoreId = autreBoutique.store?.id || autreBoutique.id;
const clientsAutre = await j(await get(`/api/customers/${autreStoreId}`, autreToken));
check('un autre commerçant ne voit pas ce client', (clientsAutre?.data || []).length === 0, `n=${(clientsAutre?.data || []).length}`);
const ficheAutre = await get(`/api/customers/${autreStoreId}/${client?.id}`, autreToken);
check('accès croisé à la fiche refusé', ficheAutre.status === 404, `status=${ficheAutre.status}`);

const blocage = await post(`/api/customers/${storeId}/${client?.id}/block`, {}, token);
check('blocage du client possible', blocage.status < 300, `status=${blocage.status}`);

await terminer();
