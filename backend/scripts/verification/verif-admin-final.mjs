// Journal d'accès, annonces plateforme, détail de ticket et notifications.

import { inscription, titre, check, j, uniq, post, get, patch, del, terminer } from './outils.mjs';

const sup = await j(await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const superToken = sup.accessToken;
const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const orgId = m.organization.id;
const b = await j(await post('/api/stores', {
  orgId, name: `Bou ${uniq}`, slug: `bou-${uniq}`, address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, m.accessToken));
const storeId = b.store?.id || b.id;

console.log('\n[Journal des accès]');
// Une connexion ratée doit y apparaître.
await post('/api/auth/login', { email: `s-${uniq}@t.fr`, password: 'MauvaisMotDePasse' });
await new Promise((r) => setTimeout(r, 600));

const journal = await get('/api/admin/access-logs', superToken);
const journalData = await j(journal);
check('route accessible (404 auparavant)', journal.status === 200, `status=${journal.status} ${JSON.stringify(journalData)?.slice(0, 120)}`);
check('des entrées sont présentes', (journalData?.logs || []).length > 0, `n=${journalData?.logs?.length}`);
const echec = (journalData?.logs || []).find((l) => l.action === 'LOGIN_FAILED');
check('la tentative ratée est journalisée', !!echec, JSON.stringify((journalData?.logs || []).map((l) => l.action)));
check('statut FAILED restitué', echec?.status === 'FAILED', JSON.stringify(echec?.status));
check('utilisateur concerné identifié', echec?.user?.email === `s-${uniq}@t.fr`, JSON.stringify(echec?.user));
check('pagination fournie', typeof journalData?.pagination?.total === 'number');
const filtre = await j(await get('/api/admin/access-logs?status=FAILED', superToken));
check('filtre par statut', (filtre?.logs || []).every((l) => l.status === 'FAILED'), JSON.stringify(filtre?.logs?.length));
const journalRefuse = await get('/api/admin/access-logs', m.accessToken);
check('inaccessible à un commerçant', journalRefuse.status === 403, `status=${journalRefuse.status}`);

console.log('\n[Annonces plateforme]');
const creation = await post('/api/admin/notifications', {
  title: 'Maintenance planifiée', message: 'La plateforme sera indisponible dimanche de 2h à 4h.',
  priority: 'HIGH', targetAudience: 'MERCHANTS',
}, superToken);
const creationData = await j(creation);
check('annonce créée (404 auparavant)', creation.status === 201, `status=${creation.status} ${JSON.stringify(creationData)}`);
const annonceId = creationData?.notification?.id;

const titreVide = await post('/api/admin/notifications', { title: 'x', message: 'y' }, superToken);
check('titre trop court refusé', titreVide.status === 400, `status=${titreVide.status}`);

const liste = await j(await get('/api/admin/notifications', superToken));
check('annonce listée', (liste?.notifications || []).some((n) => n.id === annonceId), JSON.stringify(liste?.notifications?.length));
const annonce = (liste?.notifications || []).find((n) => n.id === annonceId);
check('priorité conservée', annonce?.priority === 'HIGH', JSON.stringify(annonce?.priority));
check('public visé conservé', annonce?.targetAudience === 'MERCHANTS', JSON.stringify(annonce?.targetAudience));
check('type dérivé de la priorité', annonce?.type === 'WARNING', JSON.stringify(annonce?.type));
check('non lue par défaut', annonce?.read === false);

const lecture = await patch(`/api/admin/notifications/${annonceId}/read`, null, superToken);
check('marquage comme lue', lecture.status === 200, `status=${lecture.status}`);
const listeApres = await j(await get('/api/admin/notifications', superToken));
check('état lu persisté', listeApres?.notifications?.find((n) => n.id === annonceId)?.read === true);

const suppression = await del(`/api/admin/notifications/${annonceId}`, null, superToken);
check('suppression', suppression.status === 200, `status=${suppression.status}`);
const suppressionBis = await del(`/api/admin/notifications/${annonceId}`, null, superToken);
check('suppression d\'une annonce absente = 404', suppressionBis.status === 404, `status=${suppressionBis.status}`);

console.log('\n[Détail d\'un ticket]');
const ticket = await j(await post('/api/support/tickets', {
  orgId, subject: "Problème de connexion", description: "Je ne parviens pas à me connecter", category: "TECHNICAL",
}, m.accessToken));
const ticketId = ticket?.data?.id || ticket?.ticket?.id || ticket?.id;
check('ticket créé', !!ticketId, JSON.stringify(ticket)?.slice(0, 150));

const detail = await get(`/api/admin/tickets/${ticketId}`, superToken);
const detailData = await j(detail);
check('détail accessible (404 auparavant)', detail.status === 200, `status=${detail.status} ${JSON.stringify(detailData)?.slice(0, 120)}`);
check('commerçant rattaché', !!detailData?.ticket?.org?.name, JSON.stringify(detailData?.ticket?.org));
check('messages inclus', Array.isArray(detailData?.ticket?.messages), JSON.stringify(detailData?.ticket?.messages?.length));
const detailInconnu = await get('/api/admin/tickets/inexistant', superToken);
check('ticket inconnu = 404', detailInconnu.status === 404, `status=${detailInconnu.status}`);

console.log('\n[Notifications de boutique]');
const notif = await post(`/api/notifications/${storeId}`, {
  type: 'STOCK_LOW', title: 'Stock faible', message: 'Il reste 2 baguettes', recipientEmail: `m-${uniq}@t.fr`,
}, m.accessToken);
check('notification créée', notif.status < 300, `status=${notif.status} ${JSON.stringify(await j(notif))}`);

const compteur = await get(`/api/notifications/${storeId}/unread/count`, m.accessToken);
const compteurData = await j(compteur);
check('compteur non lues accessible (404 auparavant)', compteur.status === 200, `status=${compteur.status}`);
check('compteur à 1', compteurData?.count === 1, `=${compteurData?.count}`);

const listeNotif = await j(await get(`/api/notifications/${storeId}`, m.accessToken));
const notifId = (listeNotif?.data || listeNotif?.notifications || [])[0]?.id;
check('notification listée', !!notifId, JSON.stringify(listeNotif)?.slice(0, 200));

const suppressionNotif = await del(`/api/notifications/${storeId}/${notifId}`, null, m.accessToken);
check('suppression possible (404 auparavant)', suppressionNotif.status === 200, `status=${suppressionNotif.status}`);
const compteurFinal = await j(await get(`/api/notifications/${storeId}/unread/count`, m.accessToken));
check('compteur retombé à 0', compteurFinal?.count === 0, `=${compteurFinal?.count}`);

await terminer();
