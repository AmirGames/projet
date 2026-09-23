// Vérifie l'espace livreur (inscription, revenus, disponibilité, cloisonnement)
// et la nouvelle liste des boutiques côté administration.
// --- Plateforme : superowner + commerçant + boutique + commande livrable ---

import { inscription, check, j, uniq, post, get, patch, sqlExec, terminer, API, validerLivreur, codeDeRemise } from './outils.mjs';

const sup = await j(await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const superToken = sup.accessToken;
const m = await j(await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` }));
const b = await j(await post('/api/stores', {
  orgId: m.organization.id, name: `Bou ${uniq}`, slug: `bou-${uniq}`,
  address: '1 rue', city: 'Lyon', postalCode: '69001', phone: '0400000000',
}, m.accessToken));
const storeId = b.store?.id || b.id;
const commande = await j(await post('/api/orders', {
  storeId, customerName: 'Client', customerEmail: `c-${uniq}@t.fr`, customerPhone: '0600000000',
  deliveryType: 'DELIVERY', deliveryAddress: '5 rue Test', deliveryCity: 'Lyon',
  totalAmount: 30, feesAmount: 4.5,
}));
const orderId = commande?.order?.id;
check('commande livrable créée', !!orderId, JSON.stringify(commande)?.slice(0, 150));

console.log('\n[Inscription livreur]');
const inscriptionLivreur = await post('/api/drivers/register', {
  name: `Livreur ${uniq}`, email: `d-${uniq}@t.fr`, password: 'Password123!',
  phone: '0611111111', vehicleType: 'scooter', vehiclePlate: 'AB-123-CD',
});
const livreur = await j(inscriptionLivreur);
check('inscription 201', inscriptionLivreur.status === 201, `status=${inscriptionLivreur.status} ${JSON.stringify(livreur)}`);
check('jeton renvoyé', !!livreur?.accessToken);
const dToken = livreur?.accessToken;

const doublon = await post('/api/drivers/register', {
  name: 'Doublon', email: `d-${uniq}@t.fr`, password: 'Password123!',
  phone: '0622222222', vehicleType: 'bike',
});
check('e-mail déjà pris refusé (409)', doublon.status === 409, `status=${doublon.status}`);

const motDePasseCourt = await post('/api/drivers/register', {
  name: 'Court', email: `court-${uniq}@t.fr`, password: 'abc', phone: '0633333333', vehicleType: 'bike',
});
check('mot de passe trop court refusé', motDePasseCourt.status === 400, `status=${motDePasseCourt.status}`);

const profil = await j(await get('/api/drivers/me', dToken));
check('profil livreur accessible', profil?.data?.email === `d-${uniq}@t.fr`, JSON.stringify(profil)?.slice(0, 150));

console.log('\n[Disponibilité]');
// La disponibilité est réservée aux livreurs validés : le dossier passe
// d'abord devant la plateforme.
await validerLivreur(dToken, superToken);
const indispo = await patch('/api/drivers/availability', { isAvailable: false }, dToken);
const indispoData = await j(indispo);
check('passage en indisponible', indispo.status === 200 && indispoData?.isAvailable === false, JSON.stringify(indispoData));
const profilApres = await j(await get('/api/drivers/me', dToken));
check('état persisté en base', profilApres?.data?.isAvailable === false, JSON.stringify(profilApres?.data?.isAvailable));
await patch('/api/drivers/availability', { isAvailable: true }, dToken);
const mauvaisType = await patch('/api/drivers/availability', { isAvailable: 'oui' }, dToken);
check('valeur non booléenne refusée', mauvaisType.status === 400, `status=${mauvaisType.status}`);

console.log('\n[Course : acceptation et cloisonnement]');
// La boutique et le livreur doivent avoir une position : c'est elle qui décide
// à qui la course est proposée.
await sqlExec(`UPDATE "Store" SET latitude = 45.764, longitude = 4.8357 WHERE id = '${storeId}'`);
await patch('/api/drivers/location', { latitude: 45.765, longitude: 4.836 }, dToken);

// Le commerçant cherche un livreur ; la course part au plus proche.
const rechercheLivreur = await j(await post(`/api/orders/${orderId}/dispatch`, {}, m.accessToken));
const courseId = rechercheLivreur?.data?.deliveryId;
check('une course est créée et proposée', rechercheLivreur?.data?.propose === true, JSON.stringify(rechercheLivreur?.data));

const dispo = await j(await get('/api/drivers/deliveries?status=PENDING', dToken));
check('course visible parmi les disponibles', (dispo?.data || []).some((c) => c.id === courseId), JSON.stringify(dispo?.data?.length));

// La rémunération suit le barème (base + distance), plus les frais facturés au
// client : une course longue doit être payée même si la livraison est offerte.
const propositions = await j(await get('/api/drivers/offers', dToken));
const remuneration = propositions?.data?.[0]?.payout;
check('une rémunération est annoncée', remuneration > 0, `=${remuneration}`);

const acceptation = await patch(`/api/drivers/deliveries/${courseId}/accept`, null, dToken);
check('acceptation de la course', acceptation.status === 200, `status=${acceptation.status} ${JSON.stringify(await j(acceptation))}`);
const reAcceptation = await patch(`/api/drivers/deliveries/${courseId}/accept`, null, dToken);
check('double acceptation refusée (409)', reAcceptation.status === 409, `status=${reAcceptation.status}`);

// Un second livreur ne doit pas pouvoir toucher à cette course.
const autre = await j(await post('/api/drivers/register', {
  name: 'Autre', email: `d2-${uniq}@t.fr`, password: 'Password123!', phone: '0644444444', vehicleType: 'bike',
}));
// Clore une course demande la preuve de la remise : le code du client.
const code = await codeDeRemise(courseId);
const vol = await patch(`/api/drivers/deliveries/${courseId}`, { status: 'DELIVERED', code }, autre.accessToken);
check('un autre livreur ne peut pas modifier la course (403)', vol.status === 403, `status=${vol.status} ${JSON.stringify(await j(vol))}`);

const statutInvalide = await patch(`/api/drivers/deliveries/${courseId}`, { status: 'N_IMPORTE_QUOI' }, dToken);
check('statut invalide refusé', statutInvalide.status === 400, `status=${statutInvalide.status}`);

await patch(`/api/drivers/deliveries/${courseId}`, { status: 'PICKED_UP' }, dToken);
const livraison = await patch(`/api/drivers/deliveries/${courseId}`, { status: 'DELIVERED', code }, dToken);
check('course marquée livrée', livraison.status === 200, `status=${livraison.status}`);

console.log('\n[Revenus]');
const revenus = await j(await get('/api/drivers/earnings', dToken));
check('revenus accessibles', typeof revenus?.total === 'number', JSON.stringify(revenus)?.slice(0, 200));
check('gain conforme au barème plutôt qu aux frais client', revenus?.total === remuneration, `total=${revenus?.total} annoncé=${remuneration}`);
check('une course comptabilisée', revenus?.deliveryCount === 1, `=${revenus?.deliveryCount}`);
check('gain du jour renseigné', revenus?.today === remuneration, `=${revenus?.today}`);
check('détail de la course présent', (revenus?.deliveries || []).length === 1, `n=${revenus?.deliveries?.length}`);
check('montant de la commande rappelé', revenus?.deliveries?.[0]?.orderAmount === 30, `=${revenus?.deliveries?.[0]?.orderAmount}`);

const compteurs = await j(await get('/api/drivers/me', dToken));
check('compteur de courses incrémenté', compteurs?.data?.completedDeliveries === 1, `=${compteurs?.data?.completedDeliveries}`);
check('total gagné cumulé', Number(compteurs?.data?.totalEarnings) === remuneration, `=${compteurs?.data?.totalEarnings}`);

const revenusAutre = await j(await get('/api/drivers/earnings', autre.accessToken));
check('le second livreur a 0 €', revenusAutre?.total === 0, `=${revenusAutre?.total}`);

console.log('\n[Liste des boutiques côté administration]');
const boutiques = await get('/api/admin/stores', superToken);
const boutiquesData = await j(boutiques);
check('route /admin/stores accessible', boutiques.status === 200, `status=${boutiques.status}`);
check('la boutique est listée', (boutiquesData?.stores || []).some((s) => s.id === storeId), JSON.stringify(boutiquesData?.stores?.length));
const fiche = (boutiquesData?.stores || []).find((s) => s.id === storeId);
check('commerçant rattaché indiqué', fiche?.organization?.name?.includes(uniq), JSON.stringify(fiche?.organization));
check('nombre de commandes compté', fiche?.orderCount === 1, `=${fiche?.orderCount}`);
check('pagination fournie', typeof boutiquesData?.pagination?.total === 'number');
const recherche = await j(await get(`/api/admin/stores?search=Lyon`, superToken));
check('recherche par ville fonctionnelle', (recherche?.stores || []).length >= 1, `n=${recherche?.stores?.length}`);
const nonAdmin = await get('/api/admin/stores', m.accessToken);
check('accès refusé à un commerçant', nonAdmin.status === 403, `status=${nonAdmin.status}`);

await terminer();
