// Formules, quotas de boutiques, notifications de ticket, service d'adresses.

import { io } from 'socket.io-client';
import { inscription, titre, check, j, uniq, post, get, patch, terminer, API } from './outils.mjs';

const sup = await j(await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const S = sup.accessToken;
const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const T = m.accessToken, orgId = m.organization.id;

const creerBoutique = (n) => post('/api/stores', {
  orgId, name: `Bou ${n} ${uniq}`, slug: `bou-${n}-${uniq}`,
  address: `${n} rue`, city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, T);

console.log('[Quota de la formule Gratuit : 1 boutique]');
const quota0 = await j(await get(`/api/stores/org/${orgId}/quota`, T));
check('quota exposé', quota0?.max === 1, JSON.stringify(quota0));
check('formule Gratuit', quota0?.tier === 'FREE' && quota0?.tierLabel === 'Gratuit', JSON.stringify(quota0?.tierLabel));
check('création autorisée au départ', quota0?.canCreate === true);

const b1 = await creerBoutique(1);
check('première boutique créée', b1.status === 201, `status=${b1.status}`);
const b2 = await creerBoutique(2);
const b2Data = await j(b2);
check('deuxième boutique refusée', b2.status === 403, `status=${b2.status}`);
check('message indiquant la marche à suivre', (b2Data?.error || '').includes('Premium'), JSON.stringify(b2Data?.error));
const quota1 = await j(await get(`/api/stores/org/${orgId}/quota`, T));
check('quota épuisé', quota1?.canCreate === false && quota1?.remaining === 0, JSON.stringify(quota1));

console.log('\n[Le superowner change la formule]');
const refuseCommercant = await patch(`/api/superowner/organizations/${orgId}/tier`, { tier: 'PREMIUM' }, T);
check('un commerçant ne peut pas changer sa formule', refuseCommercant.status === 403, `status=${refuseCommercant.status}`);

const passagePremium = await patch(`/api/superowner/organizations/${orgId}/tier`, { tier: 'PREMIUM' }, S);
const premiumData = await j(passagePremium);
check('passage en Premium', passagePremium.status === 200, `status=${passagePremium.status} ${JSON.stringify(premiumData)?.slice(0, 120)}`);
check('message lisible', (premiumData?.message || '').includes('Premium'), JSON.stringify(premiumData?.message));

console.log('\n[Formule Premium : 3 boutiques]');
const quotaPremium = await j(await get(`/api/stores/org/${orgId}/quota`, T));
check('quota passé à 3', quotaPremium?.max === 3, JSON.stringify(quotaPremium?.max));
check('deux places restantes', quotaPremium?.remaining === 2, JSON.stringify(quotaPremium?.remaining));
check('2e boutique désormais acceptée', (await creerBoutique(2)).status === 201);
check('3e boutique acceptée', (await creerBoutique(3)).status === 201);
const b4 = await creerBoutique(4);
check('4e boutique refusée', b4.status === 403, `status=${b4.status}`);
check('message oriente vers le Pro', ((await j(b4))?.error || '').includes('Pro'));

console.log('\n[Rétrogradation impossible sous le nombre de boutiques]');
const retro = await patch(`/api/superowner/organizations/${orgId}/tier`, { tier: 'FREE' }, S);
const retroData = await j(retro);
check('retour au Gratuit refusé', retro.status === 400, `status=${retro.status}`);
check('message chiffré', (retroData?.error || '').includes('3'), JSON.stringify(retroData?.error));

console.log('\n[Formule Pro : 10 boutiques, puis demande]');
await patch(`/api/superowner/organizations/${orgId}/tier`, { tier: 'PRO' }, S);
const quotaPro = await j(await get(`/api/stores/org/${orgId}/quota`, T));
check('quota passé à 10', quotaPro?.max === 10, JSON.stringify(quotaPro?.max));
check('aucune formule supérieure à vendre', quotaPro?.upgradeAvailable === false, JSON.stringify(quotaPro?.upgradeAvailable));
for (let i = 4; i <= 10; i++) await creerBoutique(i);
const b11 = await creerBoutique(11);
const b11Data = await j(b11);
check('11e boutique refusée', b11.status === 403, `status=${b11.status}`);
check('message renvoie vers le support', (b11Data?.error || '').includes('support'), JSON.stringify(b11Data?.error));

console.log('\n[Notification au changement d\'état d\'un ticket]');
const socket = io(API, { auth: { token: T }, transports: ['websocket', 'polling'] });
const recues = [];
socket.on('notification', (n) => recues.push(n));
await new Promise((r, rej) => { socket.on('connect', r); setTimeout(() => rej(new Error('socket')), 8000); });

const ticket = await j(await post('/api/support/tickets', {
  orgId, subject: 'Demande de boutique', description: 'Je souhaite une 11e boutique', category: 'OTHER',
}, T));
const ticketId = ticket?.data?.id || ticket?.id;

recues.length = 0;
const chgStatut = await patch(`/api/superowner/support-tickets/${ticketId}/status`, { status: 'IN_PROGRESS' }, S);
check('changement de statut accepté', chgStatut.status < 300, `status=${chgStatut.status}`);
await new Promise((r) => setTimeout(r, 2500));
check('notification reçue sans rechargement', recues.length === 1, `n=${recues.length}`);
check('titre explicite', recues[0]?.title === "Votre ticket a changé d'état", JSON.stringify(recues[0]?.title));
check('libellé lisible et non technique', (recues[0]?.message || '').includes('pris en charge'), JSON.stringify(recues[0]?.message));

recues.length = 0;
await patch(`/api/superowner/support-tickets/${ticketId}/priority`, { priority: 'URGENT' }, S);
await new Promise((r) => setTimeout(r, 2500));
check('notification de priorité reçue', recues.length === 1, `n=${recues.length}`);
check('priorité en clair', (recues[0]?.message || '').includes('urgente'), JSON.stringify(recues[0]?.message));

recues.length = 0;
await patch(`/api/superowner/support-tickets/${ticketId}/status`, { status: 'IN_PROGRESS' }, S);
await new Promise((r) => setTimeout(r, 2000));
check('aucune notification si rien ne change', recues.length === 0, `n=${recues.length}`);
socket.disconnect();

console.log('\n[Service d\'adresses]');
const courte = await j(await get('/api/addresses/search?q=ru'));
check('requête trop courte : liste vide sans erreur', Array.isArray(courte?.suggestions) && courte.suggestions.length === 0, JSON.stringify(courte));
const recherche = await get('/api/addresses/search?q=8 boulevard du port');
const rechercheData = await j(recherche);
check('la route répond toujours 200', recherche.status === 200, `status=${recherche.status}`);
check('dégradation propre si le service est injoignable',
      Array.isArray(rechercheData?.suggestions) && typeof rechercheData?.available === 'boolean',
      JSON.stringify(rechercheData)?.slice(0, 150));
console.log(`     (service joignable depuis ce serveur : ${rechercheData?.available})`);

await terminer();
