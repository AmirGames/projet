// Vérifie qu'une sauvegarde restaure bien des données réellement perdues.
// Passer par un fichier évite que les guillemets soient mangés par les
// couches de shell imbriquées (su -c).

import { check, j, uniq, post, get, sqlScalaire, sqlExec, terminer } from './outils.mjs';

const sup = await j(await post('/api/auth/signup', { email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const token = sup?.accessToken;
const m = await j(await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const orgId = m?.organization?.id;
const mToken = m?.accessToken;

const b = await j(await post('/api/stores', {
  orgId, name: `Bou ${uniq}`, slug: `bou-${uniq}`, address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, mToken));
const storeId = b?.store?.id || b?.id;
const p1 = await j(await post('/api/products', { storeId, name: 'Produit fragile', price: 9.9, stock: 5, status: 'ACTIVE' }, mToken));
const produitId = p1?.product?.id;
check('produit créé', !!produitId, JSON.stringify(p1));

await post('/api/superowner/backups', {}, token);
const liste = await j(await get('/api/superowner/data-management', token));
const sauvegardeId = liste?.backups?.[0]?.id;
check('sauvegarde disponible', !!sauvegardeId);

// Perte de données simulée hors application (suppression définitive en base).
await sqlExec(`DELETE FROM "Product" WHERE id = '${produitId}'`);
check('produit bien supprimé de la base', await sqlScalaire(`SELECT count(*) FROM "Product" WHERE id='${produitId}'`) === '0');

const restauration = await post(`/api/superowner/backups/${sauvegardeId}/restore`, {}, token);
const res = await j(restauration);
check('restauration 2xx', restauration.status < 300, `status=${restauration.status} ${JSON.stringify(res)}`);
check('1 produit réinséré', (res?.restored?.produits ?? res?.resultats?.produits) === 1, JSON.stringify(res));
check('produit de nouveau en base', await sqlScalaire(`SELECT count(*) FROM "Product" WHERE id='${produitId}'`) === '1');

const apres = await j(await get(`/api/products?storeId=${storeId}`, mToken));
check('produit revenu dans le catalogue', apres?.pagination?.total === 1, JSON.stringify(apres?.pagination));
check('nom conservé', (apres?.products || [])[0]?.name === 'Produit fragile', JSON.stringify((apres?.products || [])[0]?.name));
check('prix conservé', Number((apres?.products || [])[0]?.price) === 9.9);

await terminer();
