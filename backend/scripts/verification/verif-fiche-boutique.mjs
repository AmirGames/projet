// La plateforme ouvre une fiche boutique, et ne corrige que ce qui la regarde.

import {
  titre,
  check,
  j,
  uniq,
  post,
  get,
  patch,
  terminer,
  sqlScalaire,
} from './outils.mjs';

const MDP = 'Password123!';

const plateforme = await j(
  await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Resto ${uniq}`,
      slug: `resto-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
      latitude: 45.764,
      longitude: 4.8357,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

await post('/api/products', { storeId, name: `Plat ${uniq}`, price: 15, status: 'ACTIVE' }, T);

/**
 * Une seconde boutique, chez un autre commerçant.
 *
 * Elle sert à deux choses : vérifier qu'une adresse publique ne se vole pas, et
 * qu'un commerçant ne corrige pas la boutique d'un voisin. Chez un autre
 * commerçant, parce que le quota de la formule limite le nombre de boutiques
 * par organisation.
 */
const voisin = await j(
  await post('/api/auth/signup', { email: `v-${uniq}@t.fr`, password: MDP, name: `V ${uniq}` })
);

const autre = await j(
  await post(
    '/api/stores',
    {
      orgId: voisin.organization.id,
      name: `Annexe ${uniq}`,
      slug: `annexe-${uniq}`,
      address: '2 rue Victor Hugo',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000001',
    },
    voisin.accessToken
  )
);
const autreId = autre.store?.id || autre.id;
check('la boutique du voisin est créée', !!autreId, JSON.stringify(autre)?.slice(0, 200));

// ===== La fiche =====

titre('La fiche s’ouvre');
// La liste était un cul-de-sac : des noms et des compteurs, rien à ouvrir.
const vue = await j(await get(`/api/superowner/stores/${storeId}`, TP));
check('la boutique est rendue', vue?.store?.id === storeId, JSON.stringify(vue?.store)?.slice(0, 200));
check('avec son organisation', vue?.store?.org?.name?.includes(`M ${uniq}`), JSON.stringify(vue?.store?.org));
check('et la formule de celle-ci', !!vue?.store?.org?.tier, `${vue?.store?.org?.tier}`);
check('les comptes du commerçant sont joints', (vue?.store?.org?.memberships || []).length >= 1, `${(vue?.store?.org?.memberships || []).length}`);
check('le nombre de produits est compté', vue?.store?._count?.products === 1, `${vue?.store?._count?.products}`);
check('le chiffre d’affaires est chiffré', typeof vue?.store?.chiffreDaffaires === 'number', `${vue?.store?.chiffreDaffaires}`);
// Sans coordonnées, une boutique est invisible de l'attribution et des zones :
// la fiche doit le dire d'un coup d'œil.
check('la fiche dit si la boutique est située', vue?.store?.situee === true, `${vue?.store?.situee}`);
check('les champs corrigeables sont annoncés', (vue?.store?.champsCorrigeables || []).length === 8, `${(vue?.store?.champsCorrigeables || []).length}`);

titre('Une boutique inconnue répond clairement');
const absente = await get(`/api/superowner/stores/inexistante-${uniq}`, TP);
check('404 plutôt qu’une page vide', absente.status === 404, `statut ${absente.status}`);

titre('La fiche n’est pas publique');
const sansCompte = await get(`/api/superowner/stores/${storeId}`);
check('sans jeton, c’est refusé', sansCompte.status === 401, `statut ${sansCompte.status}`);

const parLeCommercant = await get(`/api/superowner/stores/${storeId}`, T);
check('le commerçant lui-même n’y accède pas', parLeCommercant.status === 403, `statut ${parLeCommercant.status}`);

// ===== Ce que la plateforme corrige =====

titre('Elle corrige le téléphone et l’e-mail');
const contact = await patch(
  `/api/superowner/stores/${storeId}`,
  { phone: '0478000000', email: `contact-${uniq}@t.fr` },
  TP
);
check('la correction passe', contact.status === 200, `statut ${contact.status}`);

const telephone = await sqlScalaire(`SELECT phone FROM "Store" WHERE id = '${storeId}'`);
check('le téléphone est enregistré', telephone === '0478000000', telephone);

const email = await sqlScalaire(`SELECT email FROM "Store" WHERE id = '${storeId}'`);
check('l’e-mail aussi', email === `contact-${uniq}@t.fr`, email);

titre('Un e-mail invalide est refusé');
const mauvaisEmail = await patch(`/api/superowner/stores/${storeId}`, { email: 'pas-un-email' }, TP);
check('la correction est refusée', mauvaisEmail.status === 400, `statut ${mauvaisEmail.status}`);

titre('Elle corrige l’adresse publique');
const nouveauSlug = `resto-corrige-${uniq}`;
const slug = await patch(`/api/superowner/stores/${storeId}`, { slug: nouveauSlug }, TP);
check('la correction passe', slug.status === 200, `statut ${slug.status}`);
check(
  'la vitrine répond à la nouvelle adresse',
  (await get(`/api/stores/slug/${nouveauSlug}`)).status === 200,
  'vitrine introuvable'
);

titre('Une adresse publique déjà prise est refusée');
// Deux boutiques au même slug rendraient la vitrine de l'une inaccessible.
const volee = await patch(`/api/superowner/stores/${storeId}`, { slug: `annexe-${uniq}` }, TP);
check('la correction est refusée', volee.status === 400, `statut ${volee.status}`);
check(
  'et on dit pourquoi',
  /déjà utilisée/i.test((await j(volee))?.error || ''),
  (await j(volee))?.error
);

titre('Une adresse publique mal formée est refusée');
const malFormee = await patch(`/api/superowner/stores/${storeId}`, { slug: 'Avec Des Majuscules' }, TP);
check('la correction est refusée', malFormee.status === 400, `statut ${malFormee.status}`);

// ===== Ce qu'elle ne corrige pas =====

titre('Le commercial reste au commerçant');
// C'est la ligne que cette fiche ne franchit pas : si la plateforme pouvait
// changer un prix, on ne saurait plus qui répond de ce que paie un client.
for (const [champ, valeur] of [
  ['name', 'Nom imposé'],
  ['deliveryCost', 9.99],
  ['minDeliveryAmount', 50],
  ['operatingHours', {}],
  ['isOpen', false],
]) {
  const refus = await patch(`/api/superowner/stores/${storeId}`, { [champ]: valeur }, TP);
  check(`${champ} est refusé`, refus.status === 400, `statut ${refus.status}`);
}

const nomIntact = await sqlScalaire(`SELECT name FROM "Store" WHERE id = '${storeId}'`);
check('le nom n’a pas bougé', nomIntact === `Resto ${uniq}`, nomIntact);

titre('Une correction vide ne passe pas pour une correction');
const rien = await patch(`/api/superowner/stores/${storeId}`, {}, TP);
check('elle est refusée', rien.status === 400, `statut ${rien.status}`);

const identique = await patch(`/api/superowner/stores/${storeId}`, { phone: '0478000000' }, TP);
check('réécrire la même valeur aussi', identique.status === 400, `statut ${identique.status}`);

// ===== L'adresse et les coordonnées =====

titre('Corriger l’adresse situe la boutique');
// Corriger l'adresse en laissant les anciennes coordonnées serait le pire des
// deux mondes : la bonne adresse à l'écran, les livreurs à l'ancienne.
const adresse = await patch(
  `/api/superowner/stores/${storeId}`,
  { address: '20 Rue de la République', city: 'Lyon', postalCode: '69002' },
  TP
);
check('la correction passe', adresse.status === 200, `statut ${adresse.status}`);

const lu = await j(adresse);
check('la boutique est située d’office', lu?.situeeAutomatiquement === true, JSON.stringify(lu)?.slice(0, 200));

const latitude = await sqlScalaire(`SELECT latitude FROM "Store" WHERE id = '${storeId}'`);
check('les coordonnées ont suivi', latitude.startsWith('45.7'), latitude);

titre('Des coordonnées données à la main sont respectées');
const aLaMain = await patch(
  `/api/superowner/stores/${storeId}`,
  { latitude: 45.75, longitude: 4.85 },
  TP
);
check('la correction passe', aLaMain.status === 200, `statut ${aLaMain.status}`);
check(
  'ce sont bien celles-là',
  (await sqlScalaire(`SELECT latitude FROM "Store" WHERE id = '${storeId}'`)).startsWith('45.75'),
  'coordonnées inattendues'
);

titre('Une latitude impossible est refusée');
const horsLimites = await patch(`/api/superowner/stores/${storeId}`, { latitude: 200 }, TP);
check('la correction est refusée', horsLimites.status === 400, `statut ${horsLimites.status}`);

// ===== Rien en silence =====

titre('Chaque correction laisse une trace');
const trace = await sqlScalaire(
  `SELECT COUNT(*) FROM "SystemAuditLog" WHERE action = 'CORRECT_STORE' AND target = '${storeId}'`
);
check('le journal les garde', Number(trace) >= 4, trace);

const avantApres = await sqlScalaire(
  `SELECT changes::text FROM "SystemAuditLog" WHERE action = 'CORRECT_STORE' AND target = '${storeId}' ORDER BY "createdAt" ASC LIMIT 1`
);
check('avec l’avant et l’après', /avant/.test(avantApres) && /apres/.test(avantApres), avantApres?.slice(0, 200));

titre('Le commerçant est prévenu');
// Une modification muette se découvre par hasard, des semaines plus tard.
const prevenu = await sqlScalaire(
  `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = 'm-${uniq}@t.fr' AND title LIKE '%a corrigé%'`
);
check('il reçoit un avis par correction', Number(prevenu) >= 4, prevenu);

const contenu = await sqlScalaire(
  `SELECT message FROM "Notification" WHERE "recipientEmail" = 'm-${uniq}@t.fr' AND title LIKE '%a corrigé%' ORDER BY "createdAt" DESC LIMIT 1`
);
check('qui nomme ce qui a changé en français', /Latitude|Longitude|Adresse|Téléphone|E-mail/.test(contenu), contenu);

// ===== Le cloisonnement tient toujours =====

titre('Le commerçant garde la main sur sa boutique');
const parLui = await j(
  await post('/api/stores', {}, T).then(() => get(`/api/stores/${storeId}`, T))
);
check('il lit toujours sa fiche', parLui?.store?.id === storeId || parLui?.id === storeId, JSON.stringify(parLui)?.slice(0, 150));

titre('Et il ne touche pas à celle d’un autre');
const etranger = await j(
  await post('/api/auth/signup', { email: `x-${uniq}@t.fr`, password: MDP, name: `X ${uniq}` })
);
const intrusion = await patch(`/api/superowner/stores/${autreId}`, { phone: '0600000000' }, etranger.accessToken);
check('la correction lui est refusée', intrusion.status === 403, `statut ${intrusion.status}`);

await terminer();
