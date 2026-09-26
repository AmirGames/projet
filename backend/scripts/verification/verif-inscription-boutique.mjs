// Les boutiques créées à l'inscription, et les notes affichées en vitrine.
//
// - L'inscription commerçant et « Devenir commerçant » créaient la boutique à
//   la main : jamais située, et son genre rangé dans les réglages avec des
//   valeurs comme « Restaurant » ou « RESTAURANT » au lieu du champ
//   businessType que lit la recherche.
// - La vitrine affichait sous chaque plat quatre étoiles et « 24 avis » écrits
//   en dur, même pour un plat créé à l'instant.
//
// La suite lance sa propre API branchée sur le faux service d'adresses : la
// vérification porte sur ce que fait la plateforme d'une adresse, pas sur la
// disponibilité d'un fournisseur sur Internet.

import { inscription, titre, check, uniq, terminer, sqlScalaire, sqlExec } from './outils.mjs';
import { ouvrirApiGeocodante } from './api-geocodante.mjs';

const MDP = 'Password123!';

const api = await ouvrirApiGeocodante();
const { post, get } = api;

const j = async (reponse) => {
  try {
    return await reponse.json();
  } catch {
    return null;
  }
};

// Le premier compte devient la plateforme.
await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` });

const fiche = (suffixe, businessType, extra = {}) => ({
  conditionsAcceptees: true,
  businessName: `Commerce ${suffixe} ${uniq}`,
  email: `${suffixe}-${uniq}@t.fr`,
  password: MDP,
  businessType,
  phone: '0400000000',
  address: '20 Rue de la République',
  city: 'Lyon',
  postalCode: '69002',
  description: 'Un commerce de quartier',
  storeName: `Boutique ${suffixe} ${uniq}`,
  storeSlug: `bq-${suffixe}-${uniq}`,
  ...extra,
});

const boutiqueDe = async (slug) => ({
  id: await sqlScalaire(`SELECT id FROM "Store" WHERE slug = '${slug}'`),
  genre: await sqlScalaire(`SELECT COALESCE("businessType", '') FROM "Store" WHERE slug = '${slug}'`),
  cuisine: await sqlScalaire(`SELECT COALESCE("cuisineType", '') FROM "Store" WHERE slug = '${slug}'`),
  latitude: await sqlScalaire(`SELECT latitude FROM "Store" WHERE slug = '${slug}'`),
  genreDansReglages: await sqlScalaire(
    `SELECT COALESCE(settings->>'businessType', '') FROM "Store" WHERE slug = '${slug}'`
  ),
});

// ===== Inscription commerçant =====

titre("L'inscription commerçant crée une boutique située");
const inscrit = await post('/api/auth/merchant-register', fiche('ancien', 'RESTAURANT'));
check("l'inscription passe", inscrit.status === 201, `status=${inscrit.status}`);

const ancienne = await boutiqueDe(`bq-ancien-${uniq}`);
check('la boutique a une latitude', ancienne.latitude !== '', ancienne.latitude);

titre('Et genrée dans businessType, même avec une ancienne graphie');
check('« RESTAURANT » devient « restaurant »', ancienne.genre === 'restaurant', ancienne.genre);
check("le genre n'est plus rangé dans les réglages", ancienne.genreDansReglages === '', ancienne.genreDansReglages);

const cafe = await post('/api/auth/merchant-register', fiche('cafe', 'CAFE'));
check('« CAFE » est accepté', cafe.status === 201, `status=${cafe.status}`);
const boutiqueCafe = await boutiqueDe(`bq-cafe-${uniq}`);
check('un café est un restaurant…', boutiqueCafe.genre === 'restaurant', boutiqueCafe.genre);
check('…dont la cuisine est « café et thé »', boutiqueCafe.cuisine === 'coffee-tea', boutiqueCafe.cuisine);

const codee = await post(
  '/api/auth/merchant-register',
  fiche('code', 'restaurant', { cuisineType: 'pizza', website: 'https://exemple.fr' })
);
check('le code et la cuisine choisis passent', codee.status === 201, `status=${codee.status}`);
const boutiqueCodee = await boutiqueDe(`bq-code-${uniq}`);
check('la cuisine choisie est gardée', boutiqueCodee.cuisine === 'pizza', boutiqueCodee.cuisine);
check(
  'le site web est gardé dans les réglages',
  (await sqlScalaire(`SELECT COALESCE(settings->>'website', '') FROM "Store" WHERE slug = 'bq-code-${uniq}'`)) ===
    'https://exemple.fr'
);

titre("Un genre inconnu est refusé avant de créer quoi que ce soit");
const inconnu = await post('/api/auth/merchant-register', fiche('inconnu', 'casino'));
check('la demande est refusée', inconnu.status === 400, `status=${inconnu.status}`);
check(
  "aucun compte n'est créé",
  (await sqlScalaire(`SELECT COUNT(*)::text FROM "User" WHERE email = 'inconnu-${uniq}@t.fr'`)) === '0'
);

// ===== Devenir commerçant =====

titre('« Devenir commerçant » crée aussi une boutique située et genrée');
const client = await j(
  await post('/api/auth/signup', { conditionsAcceptees: true, email: `client-${uniq}@t.fr`, password: MDP, name: `Client ${uniq}` })
);
const { email: _e, password: _p, ...corpsDevenir } = fiche('devenu', 'Pharmacy');
const devenu = await post('/api/auth/me/become-merchant', corpsDevenir, client.accessToken);
check('la demande passe', devenu.status === 201, `status=${devenu.status}`);

const boutiqueDevenue = await boutiqueDe(`bq-devenu-${uniq}`);
check('la boutique a une latitude', boutiqueDevenue.latitude !== '', boutiqueDevenue.latitude);
check('« Pharmacy » devient « pharmacy »', boutiqueDevenue.genre === 'pharmacy', boutiqueDevenue.genre);
check("une parapharmacie n'a pas de cuisine", boutiqueDevenue.cuisine === '', boutiqueDevenue.cuisine);

// ===== Les notes en vitrine =====

titre("Un plat sans avis n'affiche aucune note");
const storeId = ancienne.id;
await sqlExec(`
  INSERT INTO "Product" (id, "storeId", sku, name, price, status, "isAvailable", "updatedAt")
  VALUES ('plat-${uniq}', '${storeId}', 'PL-${uniq}', 'Margherita', 12, 'ACTIVE', true, now())
`);

const platDuMenu = async () => {
  const menu = (await j(await get(`/api/client/stores/${storeId}`)))?.data;
  const plats = Object.values(menu?.menu || {}).flat();
  return { menu, plat: plats.find((p) => p.id === `plat-${uniq}`) };
};

const avant = await platDuMenu();
check('le plat est au menu', !!avant.plat, JSON.stringify(avant.menu)?.slice(0, 150));
check("sa note est nulle, et non quatre étoiles inventées", avant.plat?.note === null, JSON.stringify(avant.plat?.note));

titre('Avec des avis, la vraie moyenne');
await sqlExec(`
  INSERT INTO "Review" (id, "storeId", "productId", rating, status, "updatedAt") VALUES
    ('av1-${uniq}', '${storeId}', 'plat-${uniq}', 5, 'APPROVED', now()),
    ('av2-${uniq}', '${storeId}', 'plat-${uniq}', 4, 'APPROVED', now()),
    ('av3-${uniq}', '${storeId}', 'plat-${uniq}', 1, 'REMOVED', now()),
    ('av4-${uniq}', '${storeId}', NULL, 3, 'APPROVED', now()),
    ('av5-${uniq}', '${storeId}', NULL, 1, 'REMOVED', now())
`);

const apres = await platDuMenu();
check('le plat a 2 avis — le retiré ne compte pas', apres.plat?.note?.nombre === 2, JSON.stringify(apres.plat?.note));
check('sa moyenne est 4,5', apres.plat?.note?.moyenne === 4.5, JSON.stringify(apres.plat?.note));
check(
  "la moyenne du commerce ne compte que ses propres avis publiés",
  String(apres.menu?.averageRating) === '3.0' && apres.menu?.reviewCount === 1,
  `${apres.menu?.averageRating} / ${apres.menu?.reviewCount}`
);
check(
  "un avis retiré n'est plus listé",
  !(apres.menu?.reviews || []).some((a) => a.status === 'REMOVED'),
  JSON.stringify((apres.menu?.reviews || []).map((a) => a.status))
);

await api.fermer();
await terminer();
