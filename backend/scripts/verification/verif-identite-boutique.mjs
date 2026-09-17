// Le genre d'un commerce, et l'identité sous laquelle il facture.
//
// L'inscription ne demandait ni le type d'établissement ni le type de cuisine :
// toute boutique était un « restaurant » sans genre. Et l'identité de
// facturation vivait uniquement sur la société, alors qu'un commerçant peut
// tenir trois commerces relevant de trois sociétés — donc de trois numéros de
// TVA.

import { titre, check, j, uniq, post, put, get, terminer, sqlScalaire } from './outils.mjs';

const MDP = 'Password123!';

const plateforme = await j(
  await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;
const orgId = commercant.organization.id;

// ===== Les nomenclatures =====

titre('Les genres de commerce sont servis par l’API');
// Recopiées dans un `<select>`, les listes auraient dérivé dès la première
// addition : l'écran et la recherche doivent parler des mêmes valeurs.
const types = await j(await get('/api/stores/types'));
const etablissements = types?.data?.etablissements || [];
const cuisines = types?.data?.cuisines || [];

check('les types d’établissement sont listés', etablissements.length === 8, `${etablissements.length}`);
check('le restaurant en fait partie', etablissements.some((t) => t.code === 'restaurant'), JSON.stringify(etablissements.slice(0, 3)));
check('le fleuriste aussi', etablissements.some((t) => t.libelle === 'Fleuriste'), 'absent');
check('les cuisines sont nombreuses', cuisines.length > 80, `${cuisines.length}`);
check('les pizzas y sont', cuisines.some((c) => c.code === 'pizza'), 'absente');
check('les sushis japonais aussi', cuisines.some((c) => c.libelle === 'Japonaise : sushis'), 'absente');
check('la liste est lisible sans compte', types?.success === true, JSON.stringify(types)?.slice(0, 120));

// ===== À la création =====

titre('Une boutique naît avec son genre');
const pizzeria = await j(
  await post(
    '/api/stores',
    {
      orgId,
      name: `Pizzeria ${uniq}`,
      slug: `pizzeria-${uniq}`,
      phone: '0400000000',
      businessType: 'restaurant',
      cuisineType: 'pizza',
    },
    T
  )
);
const pizzeriaId = pizzeria.store?.id || pizzeria.id;

const enBase = await sqlScalaire(
  `SELECT "businessType" || '/' || "cuisineType" FROM "Store" WHERE id = '${pizzeriaId}'`
);
check('le type et la cuisine sont enregistrés', enBase === 'restaurant/pizza', enBase);

titre('Une épicerie n’a pas de cuisine');
// Retenir « pizza » pour une épicerie brouillerait la recherche du client.
const voisin = await j(
  await post('/api/auth/signup', { email: `v-${uniq}@t.fr`, password: MDP, name: `V ${uniq}` })
);
const epicerie = await j(
  await post(
    '/api/stores',
    {
      orgId: voisin.organization.id,
      name: `Epicerie ${uniq}`,
      slug: `epicerie-${uniq}`,
      phone: '0400000001',
      businessType: 'grocery',
      cuisineType: 'pizza',
    },
    voisin.accessToken
  )
);
const epicerieId = epicerie.store?.id || epicerie.id;

const cuisineEpicerie = await sqlScalaire(
  `SELECT coalesce("cuisineType", 'aucune') FROM "Store" WHERE id = '${epicerieId}'`
);
check('la cuisine est écartée', cuisineEpicerie === 'aucune', cuisineEpicerie);

titre('Un genre inventé est refusé');
const inventaire = await j(
  await post('/api/auth/signup', { email: `x-${uniq}@t.fr`, password: MDP, name: `X ${uniq}` })
);
const inconnu = await post(
  '/api/stores',
  {
    orgId: inventaire.organization.id,
    name: `Inconnu ${uniq}`,
    slug: `inconnu-${uniq}`,
    businessType: 'casino',
  },
  inventaire.accessToken
);
check('le refus est net', inconnu.status === 400, `statut ${inconnu.status}`);

// ===== L'identité de facturation =====

titre('Sans rien saisir, la boutique hérite de la société');
await put(
  `/api/merchant-profile/${orgId}`,
  { legalName: `Societe Mere ${uniq}`, vatNumber: 'FR12345678901' },
  T
);

const heritee = await j(await get(`/api/store-settings/${pizzeriaId}`, T));
check('la raison sociale vient de la société', heritee?.facturation?.effective?.legalName === `Societe Mere ${uniq}`, heritee?.facturation?.effective?.legalName);
check('le numéro de TVA aussi', heritee?.facturation?.effective?.vatNumber === 'FR12345678901', heritee?.facturation?.effective?.vatNumber);
check('et la boutique n’a rien en propre', heritee?.facturation?.propre === false, `${heritee?.facturation?.propre}`);
check('la société est rappelée', heritee?.facturation?.societe?.legalName === `Societe Mere ${uniq}`, heritee?.facturation?.societe?.legalName);

titre('Une boutique peut porter la sienne');
const propre = await j(
  await put(
    `/api/store-settings/${pizzeriaId}`,
    { legalName: `Pizzeria SARL ${uniq}`, vatNumber: 'FR98765432109' },
    T
  )
);
// La route enveloppe la boutique entière sous « settings ».
const apres = propre?.settings || propre;

check('la sienne prime', apres?.facturation?.effective?.vatNumber === 'FR98765432109', apres?.facturation?.effective?.vatNumber);
check('et elle est signalée comme propre', apres?.facturation?.propre === true, `${apres?.facturation?.propre}`);
check('la société reste consultable', apres?.facturation?.societe?.vatNumber === 'FR12345678901', apres?.facturation?.societe?.vatNumber);

titre('La TVA de la boutique est contrôlée comme celle de la société');
const tvaFausse = await put(`/api/store-settings/${pizzeriaId}`, { vatNumber: 'FR1' }, T);
check('un format invalide est refusé', tvaFausse.status === 400, `statut ${tvaFausse.status}`);

const inchangee = await sqlScalaire(`SELECT "vatNumber" FROM "Store" WHERE id = '${pizzeriaId}'`);
check('et l’ancienne reste en place', inchangee === 'FR98765432109', inchangee);

titre('Vider la sienne fait revenir celle de la société');
await put(`/api/store-settings/${pizzeriaId}`, { legalName: '', vatNumber: '' }, T);
const revenue = await j(await get(`/api/store-settings/${pizzeriaId}`, T));
check('l’héritage reprend', revenue?.facturation?.effective?.vatNumber === 'FR12345678901', revenue?.facturation?.effective?.vatNumber);
check('et plus rien n’est propre', revenue?.facturation?.propre === false, `${revenue?.facturation?.propre}`);

// ===== La facturation de la plateforme =====

titre('La plateforme voit les identités qui diffèrent');
await put(`/api/store-settings/${pizzeriaId}`, { legalName: `Pizzeria SARL ${uniq}`, vatNumber: 'FR98765432109' }, T);

const facture = await j(await get(`/api/superowner/billing/${orgId}`, TP));
const identites = facture?.organization?.identitesParBoutique || [];
check('la boutique qui diffère est signalée', identites.length === 1, JSON.stringify(identites));
check('avec sa propre TVA', identites[0]?.vatNumber === 'FR98765432109', identites[0]?.vatNumber);
check('et son nom de commerce', identites[0]?.name === `Pizzeria ${uniq}`, identites[0]?.name);

// ===== Chacun chez soi =====

titre('Les réglages du voisin restent hors de portée');
const intrusion = await put(`/api/store-settings/${epicerieId}`, { vatNumber: 'FR11111111111' }, T);
check('un autre commerçant ne les écrit pas', intrusion.status === 403, `statut ${intrusion.status}`);

const intacte = await sqlScalaire(
  `SELECT coalesce("vatNumber", 'aucune') FROM "Store" WHERE id = '${epicerieId}'`
);
check('et rien n’a bougé', intacte === 'aucune', intacte);

await terminer();
