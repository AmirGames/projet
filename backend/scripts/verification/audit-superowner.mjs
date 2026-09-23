// Passe en revue chaque fonctionnalité de l'espace superowner.

import { inscription, titre, check, j, uniq, post, get, put, patch, del, terminer, API } from './outils.mjs';

const sup = await j(await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const T = sup.accessToken;
const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const orgId = m.organization.id;
const b = await j(await post('/api/stores', {
  orgId, name: `Bou ${uniq}`, slug: `bou-${uniq}`, address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, m.accessToken));
const storeId = b.store?.id || b.id;
await post('/api/products', { storeId, name: 'Pain', price: 2, stock: 5, status: 'ACTIVE' }, m.accessToken);
await post('/api/orders', { storeId, customerName: 'C', customerEmail: `c-${uniq}@t.fr`, customerPhone: '0600000000', deliveryType: 'PICKUP', totalAmount: 40 });

const lire = async (nom, chemin, verif) => {
  const r = await get(chemin, T);
  const d = await j(r);
  check(`${nom} — lecture`, r.status === 200 && (!verif || verif(d)), `status=${r.status} ${JSON.stringify(d)?.slice(0, 120)}`);
  return d;
};

console.log('\n=== LECTURES ===');
await lire('Tableau de bord', '/api/superowner/dashboard', (d) => typeof d?.stats?.totalRevenue === 'number');
await lire('Organisations', '/api/superowner/organizations', (d) => Array.isArray(d?.organizations));
await lire('Analytics', '/api/superowner/analytics', (d) => !!d);
await lire('Facturation', '/api/superowner/billing', (d) => typeof d?.summary?.totalRevenue === 'number');
await lire('Rapports financiers', '/api/superowner/financial-reports', (d) => d?.reports?.length === 12);
await lire('Tickets support', '/api/superowner/support-tickets', (d) => Array.isArray(d?.tickets));
await lire('Administrateurs', '/api/superowner/admins', (d) => Array.isArray(d?.admins));
await lire('Clés API', '/api/superowner/api-keys', (d) => Array.isArray(d?.apiKeys || d?.keys));
await lire('Webhooks', '/api/superowner/webhooks', (d) => Array.isArray(d?.webhooks));
await lire('Configuration', '/api/superowner/system-config', (d) => !!d);
await lire('Réglages avancés', '/api/superowner/advanced-settings', (d) => !!d?.settings?.enabledFeatures);
await lire('Données / sauvegardes', '/api/superowner/data-management', (d) => Array.isArray(d?.backups));
await lire('Audit de sécurité', '/api/superowner/security-audit', (d) => Array.isArray(d?.events));
await lire('Journal', '/api/superowner/audit-logs', (d) => Array.isArray(d?.logs));

console.log('\n=== ÉCRITURES ===');
// Clés API
const cle = await post('/api/superowner/api-keys', { name: `Clé ${uniq}` }, T);
const cleData = await j(cle);
check('Clé API — création', cle.status < 300, `status=${cle.status}`);
const valeurCle = cleData?.key?.key || cleData?.key;
check('Clé API — valeur affichée une seule fois', typeof valeurCle === 'string' && valeurCle.startsWith('sk_live_'), JSON.stringify(cleData)?.slice(0, 120));
const cleId = cleData?.key?.id || cleData?.apiKey?.id || cleData?.id;
const revoc = await post(`/api/superowner/api-keys/${cleId}/revoke`, null, T);
check('Clé API — révocation', revoc.status < 300, `status=${revoc.status}`);

// Webhooks
const wh = await post('/api/superowner/webhooks', { url: 'https://exemple.fr/hook', events: ['order.created'] }, T);
const whData = await j(wh);
check('Webhook — création', wh.status < 300, `status=${wh.status} ${JSON.stringify(whData)?.slice(0, 120)}`);
const whId = whData?.webhook?.id || whData?.id;
const whLivraisons = await get(`/api/superowner/webhooks/${whId}/deliveries`, T);
check('Webhook — historique des envois', whLivraisons.status === 200, `status=${whLivraisons.status}`);
const whSuppr = await del(`/api/superowner/webhooks/${whId}`, null, T);
check('Webhook — suppression', whSuppr.status < 300, `status=${whSuppr.status}`);

// Administrateurs
const promo = await post('/api/superowner/admins', { email: `m-${uniq}@t.fr` }, T);
check('Administrateur — promotion', promo.status < 300, `status=${promo.status} ${JSON.stringify(await j(promo))?.slice(0, 150)}`);
const admins = await j(await get('/api/superowner/admins', T));
const cible = (admins?.admins || []).find((a) => a.email === `m-${uniq}@t.fr`);
check('Administrateur — apparaît dans la liste', !!cible, JSON.stringify(admins?.admins?.map((a) => a.email)));
if (cible) {
  const revoque = await del(`/api/superowner/admins/${cible.id}`, null, T);
  check('Administrateur — révocation', revoque.status < 300, `status=${revoque.status}`);
}
const autoRevoc = await del(`/api/superowner/admins/${sup.user.id}`, null, T);
check('Administrateur — auto-révocation refusée', autoRevoc.status >= 400, `status=${autoRevoc.status}`);

// Réglages avancés
const reglages = await put('/api/superowner/advanced-settings', {
  enabledFeatures: ['multiStore'],
  performanceOptimizations: { cacheEnabled: false },
}, T);
check('Réglages avancés — enregistrement', reglages.status < 300, `status=${reglages.status}`);
const relus = await j(await get('/api/superowner/advanced-settings', T));
check('Réglages avancés — persistance', relus?.settings?.performanceOptimizations?.cacheEnabled === false, JSON.stringify(relus?.settings?.performanceOptimizations));

// Sauvegardes
const sauvegarde = await post('/api/superowner/backups', {}, T);
check('Sauvegarde — création', sauvegarde.status < 300, `status=${sauvegarde.status}`);

// Tickets
const ticket = await j(await post('/api/support/tickets', {
  orgId, subject: 'Question', description: 'Une question', category: 'BILLING',
}, m.accessToken));
const ticketId = ticket?.data?.id || ticket?.ticket?.id || ticket?.id;
const statut = await patch(`/api/superowner/support-tickets/${ticketId}/status`, { status: 'IN_PROGRESS' }, T);
check('Ticket — changement de statut', statut.status < 300, `status=${statut.status}`);

const priorite = await patch(`/api/superowner/support-tickets/${ticketId}/priority`, { priority: 'HIGH' }, T);
check('Ticket — changement de priorité', priorite.status < 300, `status=${priorite.status}`);

const reponse = await post(`/api/superowner/support-tickets/${ticketId}/messages`, { body: 'Bonjour' }, T);
check('Ticket — réponse depuis l\'espace superowner', reponse.status < 300, `status=${reponse.status}`);

// Organisations : actions de gestion
const suspension = await post(`/api/superowner/organizations/${orgId}/suspend`, { reason: 'Test' }, T);
check('Organisation — suspension depuis le superowner', suspension.status < 300, `status=${suspension.status}`);

// Configuration système
const config = await put('/api/superowner/system-config', { platformFeePercent: 8 }, T);
check('Configuration — modification de la commission', config.status < 300, `status=${config.status}`);

titre('EFFETS RÉELS');

// La commission modifiée doit se retrouver dans la facturation.
const conf = await j(await get('/api/superowner/system-config', T));
check('commission enregistrée à 8 %', conf?.config?.platformFeePercent === 8, `=${conf?.config?.platformFeePercent}`);
check('version PostgreSQL réelle (non codée en dur)', /^\d+/.test(conf?.config?.database?.version || ''), JSON.stringify(conf?.config?.database));
check('clés API réelles et non fictives', !JSON.stringify(conf?.config?.apiKeys).includes('api_key_001'), JSON.stringify(conf?.config?.apiKeys)?.slice(0, 120));

// La suspension doit bloquer le commerçant.
const orgApres = await j(await get('/api/superowner/organizations', T));
const cible2 = (orgApres?.organizations || []).find((o) => o.id === orgId);
check('organisation marquée SUSPENDED', cible2?.status === 'SUSPENDED', JSON.stringify(cible2?.status));
const bloque = await post('/api/products', { storeId, name: 'Interdit', price: 5, stock: 1 }, m.accessToken);
check('le commerçant suspendu ne peut plus créer', bloque.status === 403, `status=${bloque.status}`);

// Réactivation.
const reactive = await post(`/api/superowner/organizations/${orgId}/unsuspend`, null, T);
check('réactivation possible', reactive.status < 300, `status=${reactive.status}`);
const debloque = await post('/api/products', { storeId, name: 'Autorisé', price: 5, stock: 1 }, m.accessToken);
check('le commerçant réactivé peut de nouveau créer', debloque.status === 201, `status=${debloque.status}`);

// La priorité doit être persistée et affichée en URGENT.
const ticketsApres = await j(await get('/api/superowner/support-tickets', T));
const tk = (ticketsApres?.tickets || []).find((t) => t.id === ticketId);
check('priorité HIGH persistée', tk?.priority === 'HIGH', JSON.stringify(tk?.priority));
const urgent = await patch(`/api/superowner/support-tickets/${ticketId}/priority`, { priority: 'URGENT' }, T);
const urgentData = await j(urgent);
check('URGENT accepté et réaffiché tel quel', urgentData?.ticket?.priority === 'URGENT', JSON.stringify(urgentData?.ticket?.priority));

// La réponse doit apparaître dans le fil et notifier le commerçant.
const fil = await j(await get(`/api/superowner/support-tickets/${ticketId}/messages`, T));
check('la réponse est dans le fil', (fil?.data || []).some((msg) => msg.body === 'Bonjour'), JSON.stringify(fil?.data?.length));
const notifs = await j(await get('/api/notifications?limit=20', m.accessToken));
check('le commerçant est notifié de la réponse', (notifs?.data || []).some((n) => n.type === 'TICKET_MESSAGE'), JSON.stringify(notifs?.data?.length));

// Le mode maintenance depuis la configuration doit s'appliquer sans délai.
await put('/api/superowner/system-config', { maintenanceMode: true, maintenanceMessage: 'Test config' }, T);
const vitrine = await get('/api/client/stores');
check('maintenance appliquée immédiatement', vitrine.status === 503, `status=${vitrine.status}`);
await put('/api/superowner/system-config', { maintenanceMode: false }, T);
const vitrineApres = await get('/api/client/stores');
check('maintenance levée immédiatement', vitrineApres.status === 200, `status=${vitrineApres.status}`);

// Bornes de validation.
const bornes = await put('/api/superowner/system-config', { minOrderAmount: 100, maxOrderAmount: 10 }, T);
check('minimum supérieur au maximum refusé', bornes.status === 400, `status=${bornes.status}`);
const commissionFolle = await put('/api/superowner/system-config', { platformFeePercent: 150 }, T);
check('commission supérieure à 100 % refusée', commissionFolle.status === 400, `status=${commissionFolle.status}`);

// Cloisonnement.
const intrus = await put('/api/superowner/system-config', { platformFeePercent: 1 }, m.accessToken);
check('un commerçant ne peut pas modifier la configuration', intrus.status === 403, `status=${intrus.status}`);
const intrusTicket = await patch(`/api/superowner/support-tickets/${ticketId}/priority`, { priority: 'LOW' }, m.accessToken);
check('un commerçant ne peut pas changer la priorité', intrusTicket.status === 403, `status=${intrusTicket.status}`);

await terminer();
