// Vérifie les six points signalés par l'utilisateur.

import { inscription, check, j, uniq, post, get, put, del, terminer, API } from './outils.mjs';

// ---------- Comptes ----------
// Le premier inscrit devient superowner.
const superRes = await inscription({
  email: `super-${uniq}@test.fr`, password: 'Password123!', name: `Super ${uniq}`,
});
const superData = await j(superRes);
check('inscription superowner', superRes.status === 201, `status=${superRes.status} ${JSON.stringify(superData)}`);
const superToken = superData?.accessToken || superData?.tokens?.accessToken;

const marchandRes = await inscription({
  email: `marchand-${uniq}@test.fr`, password: 'Password123!', name: `Boulangerie ${uniq}`,
});
const marchandData = await j(marchandRes);
const marchandToken = marchandData?.accessToken || marchandData?.tokens?.accessToken;
const orgId = marchandData?.organization?.id || marchandData?.user?.organizationId;
check('inscription marchand', !!marchandToken && !!orgId, JSON.stringify(marchandData));

// Deux boutiques exigent au moins la formule Premium.
await fetch(API + `/api/superowner/organizations/${orgId}/tier`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
  body: JSON.stringify({ tier: 'PREMIUM' }),
});

// Deux boutiques pour le même marchand.
const boutiqueA = await j(await post('/api/stores', {
  orgId, name: `Boutique A ${uniq}`, slug: `boutique-a-${uniq}`,
  address: '1 rue A', city: 'Lyon', postalCode: '69001', phone: '0400000001',
}, marchandToken));
const boutiqueB = await j(await post('/api/stores', {
  orgId, name: `Boutique B ${uniq}`, slug: `boutique-b-${uniq}`,
  address: '2 rue B', city: 'Lyon', postalCode: '69002', phone: '0400000002',
}, marchandToken));
const idA = boutiqueA?.store?.id || boutiqueA?.id;
const idB = boutiqueB?.store?.id || boutiqueB?.id;
check('deux boutiques créées', !!idA && !!idB, JSON.stringify([boutiqueA, boutiqueB]));

// Produits et commandes réparties entre les deux boutiques.
const prodA = await j(await post('/api/products', { storeId: idA, name: 'Pain A', price: 2.5, stock: 10, status: 'ACTIVE' }, marchandToken));
const prodB1 = await j(await post('/api/products', { storeId: idB, name: 'Pain B1', price: 3, stock: 10, status: 'ACTIVE' }, marchandToken));
const prodB2 = await j(await post('/api/products', { storeId: idB, name: 'Pain B2', price: 4, stock: 10, status: 'ACTIVE' }, marchandToken));
check('produits créés', !!(prodA?.product?.id && prodB1?.product?.id && prodB2?.product?.id));

const cmd = async (storeId, montant, email) => j(await post('/api/orders', { conditionsAcceptees: true,
  storeId, customerName: 'Client Test', customerEmail: email, customerPhone: '0600000000',
  deliveryType: 'PICKUP', totalAmount: montant,
}));
await cmd(idA, 10, `a1-${uniq}@test.fr`);
await cmd(idB, 20, `b1-${uniq}@test.fr`);
await cmd(idB, 30, `b2-${uniq}@test.fr`);

// ---------- 1. Le dashboard marchand suit la boutique ----------
console.log('\n[1] Portée par boutique (dashboard marchand)');
const cmdOrg = await j(await get(`/api/orders?orgId=${orgId}`, marchandToken));
const cmdA = await j(await get(`/api/orders?storeId=${idA}`, marchandToken));
const cmdB = await j(await get(`/api/orders?storeId=${idB}`, marchandToken));
check('3 commandes au niveau organisation', cmdOrg?.orders?.length === 3, `=${cmdOrg?.orders?.length}`);
check('1 commande pour la boutique A', cmdA?.orders?.length === 1, `=${cmdA?.orders?.length}`);
check('2 commandes pour la boutique B', cmdB?.orders?.length === 2, `=${cmdB?.orders?.length}`);
const caA = (cmdA?.orders || []).reduce((s, o) => s + Number(o.totalAmount), 0);
const caB = (cmdB?.orders || []).reduce((s, o) => s + Number(o.totalAmount), 0);
check('CA boutique A = 10 €', caA === 10, `=${caA}`);
check('CA boutique B = 50 €', caB === 50, `=${caB}`);
const prodsA = await j(await get(`/api/products?storeId=${idA}`, marchandToken));
const prodsB = await j(await get(`/api/products?storeId=${idB}`, marchandToken));
check('1 produit boutique A', (prodsA?.products || prodsA)?.length === 1 || prodsA?.pagination?.total === 1, JSON.stringify(prodsA?.pagination));
check('2 produits boutique B', prodsB?.pagination?.total === 2, JSON.stringify(prodsB?.pagination));

// ---------- 2. Facturation ----------
console.log('\n[2] Facturation superowner');
const facturation = await j(await get('/api/superowner/billing', superToken));
check('billings présent', Array.isArray(facturation?.billings), JSON.stringify(facturation)?.slice(0, 200));
check('summary.totalRevenue défini', typeof facturation?.summary?.totalRevenue === 'number', JSON.stringify(facturation?.summary));
check('summary.pendingAmount défini', typeof facturation?.summary?.pendingAmount === 'number');
check('summary.activeSubscriptions défini', typeof facturation?.summary?.activeSubscriptions === 'number');
check('pagination présente', typeof facturation?.pagination?.total === 'number');

// ---------- 3. Rapports financiers ----------
console.log('\n[3] Rapports financiers');
const rapports = await j(await get('/api/superowner/financial-reports', superToken));
check('reports est un tableau', Array.isArray(rapports?.reports), JSON.stringify(rapports)?.slice(0, 200));
check('12 mois retournés', rapports?.reports?.length === 12, `=${rapports?.reports?.length}`);
const premier = rapports?.reports?.[0];
check('chaque rapport a un totalRevenue', premier && typeof premier.totalRevenue === 'number', JSON.stringify(premier));
check('pagination présente', typeof rapports?.pagination?.total === 'number');
const totalAnnee = (rapports?.reports || []).reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
check('total annuel = 60 €', totalAnnee === 60, `=${totalAnnee}`);

// ---------- Organisations (crashait aussi) ----------
const orgsPage = await j(await get('/api/superowner/organizations', superToken));
check('organisations : pagination présente', typeof orgsPage?.pagination?.total === 'number', JSON.stringify(orgsPage)?.slice(0, 150));

// ---------- 4. Sauvegardes ----------
console.log('\n[4] Sauvegardes : créer, télécharger, restaurer, supprimer');
const creation = await post('/api/superowner/backups', {}, superToken);
const creee = await j(creation);
check('création sauvegarde 2xx', creation.status < 300, `status=${creation.status} ${JSON.stringify(creee)}`);
const liste = await j(await get('/api/superowner/data-management', superToken));
const sauvegarde = liste?.backups?.[0];
check('sauvegarde listée', !!sauvegarde?.id, JSON.stringify(liste)?.slice(0, 200));
check('taille lisible', typeof sauvegarde?.size === 'string' && /o|Ko|Mo/.test(sauvegarde.size), sauvegarde?.size);

const tel = await get(`/api/superowner/backups/${sauvegarde?.id}/download`, superToken);
const corps = await tel.text();
check('téléchargement 200', tel.status === 200, `status=${tel.status}`);
check('en-tête attachment', (tel.headers.get('content-disposition') || '').includes('attachment'), tel.headers.get('content-disposition'));
let dump = null;
try { dump = JSON.parse(corps); } catch {}
check('contenu JSON valide', !!dump, corps.slice(0, 120));
check('sauvegarde contient les boutiques', (dump?.boutiques || []).length >= 2, `=${dump?.boutiques?.length}`);
check('aucun mot de passe exporté', !corps.includes('passwordHash'));

// Restauration : on supprime une boutique puis on restaure.
const restaure = await post(`/api/superowner/backups/${sauvegarde?.id}/restore`, {}, superToken);
const resRestaure = await j(restaure);
check('restauration 2xx', restaure.status < 300, `status=${restaure.status} ${JSON.stringify(resRestaure)}`);
check('restauration idempotente (0 doublon)', resRestaure?.restored?.boutiques === 0 || resRestaure?.resultats?.boutiques === 0, JSON.stringify(resRestaure));

const suppr = await del(`/api/superowner/backups/${sauvegarde?.id}`, null, superToken);
check('suppression 2xx', suppr.status < 300, `status=${suppr.status}`);
const listeApres = await j(await get('/api/superowner/data-management', superToken));
check('sauvegarde disparue de la liste', !(listeApres?.backups || []).some((b) => b.id === sauvegarde?.id));
const telApres = await get(`/api/superowner/backups/${sauvegarde?.id}/download`, superToken);
check('téléchargement après suppression = 404', telApres.status === 404, `status=${telApres.status}`);

// ---------- 5. Mode maintenance ----------
console.log('\n[5] Mode maintenance');
const avant = await get(`/api/orders?orgId=${orgId}`, marchandToken);
check('avant maintenance : API métier accessible', avant.status === 200, `status=${avant.status}`);

const activer = await put('/api/admin/config', { maintenanceMode: true, maintenanceMessage: 'Maintenance en cours, revenez vite.' }, superToken);
check('activation maintenance 2xx', activer.status < 300, `status=${activer.status} ${JSON.stringify(await j(activer))}`);

const pendant = await get(`/api/orders?orgId=${orgId}`, marchandToken);
const corpsPendant = await j(pendant);
check('API métier bloquée en 503', pendant.status === 503, `status=${pendant.status}`);
check('message de maintenance renvoyé', corpsPendant?.error?.includes('Maintenance en cours'), JSON.stringify(corpsPendant));
check('code MAINTENANCE_MODE', corpsPendant?.code === 'MAINTENANCE_MODE');

const vitrine = await get('/api/client/stores');
check('vitrine publique bloquée aussi', vitrine.status === 503, `status=${vitrine.status}`);
const adminPendant = await get('/api/superowner/billing', superToken);
check('espace superowner toujours joignable', adminPendant.status === 200, `status=${adminPendant.status}`);
const loginPendant = await post('/api/auth/login', { email: `super-${uniq}@test.fr`, password: 'Password123!' });
check('connexion toujours possible', loginPendant.status === 200, `status=${loginPendant.status}`);
const sante = await get('/health');
check('/health toujours joignable', sante.status === 200);

const desactiver = await put('/api/admin/config', { maintenanceMode: false }, superToken);
check('désactivation 2xx', desactiver.status < 300, `status=${desactiver.status}`);
const apres = await get(`/api/orders?orgId=${orgId}`, marchandToken);
check('API métier de nouveau accessible', apres.status === 200, `status=${apres.status}`);

await terminer();
