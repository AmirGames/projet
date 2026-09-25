// Tickets archivés et réouverture, détail d'une facturation, bornes de commande
// appliquées, journal des accès chronométré.

import { inscription, titre, check, j, uniq, post, get, put, patch, terminer, sqlScalaire } from './outils.mjs';

const MDP = 'Password123!';

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

await post('/api/auth/login', { email: `p-${uniq}@t.fr`, password: MDP });

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;
const ORG = commercant.organization.id;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: ORG,
      name: `Cantine ${uniq}`,
      slug: `cantine-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
      latitude: 45.7578,
      longitude: 4.832,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post('/api/products', { storeId, name: `Menu ${uniq}`, price: 25, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

const commander = (email, quantite = 1) =>
  post('/api/orders', { conditionsAcceptees: true,
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: email,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 25 * quantite,
    items: [{ productId, quantity: quantite, price: 25 }],
  });

// ===== Les tickets archivés, côté plateforme =====

titre('La plateforme retrouve un ticket clos');
const ticket = await j(
  await post(
    '/api/support/tickets',
    { orgId: ORG, subject: `Panne ${uniq}`, description: 'Une panne à regarder', category: 'TECHNICAL' },
    T
  )
);
const ticketId = ticket?.data?.id || ticket?.id;

const actifsAvant = await j(await get('/api/superowner/support-tickets', TP));
check(
  'il est d’abord dans les tickets en cours',
  (actifsAvant?.tickets || []).some((t) => t.id === ticketId),
  JSON.stringify((actifsAvant?.tickets || []).map((t) => t.title))
);

await patch(`/api/superowner/support-tickets/${ticketId}/status`, { status: 'CLOSED' }, TP);

const actifsApres = await j(await get('/api/superowner/support-tickets', TP));
check(
  'clos, il quitte les tickets en cours',
  !(actifsApres?.tickets || []).some((t) => t.id === ticketId),
  JSON.stringify((actifsApres?.tickets || []).map((t) => t.status))
);

// Sans cette liste, le ticket disparaissait pour de bon : ni relecture, ni
// réouverture possibles.
const archives = await j(await get('/api/superowner/support-tickets?archived=true', TP));
const archive = (archives?.tickets || []).find((t) => t.id === ticketId);

check('mais il apparaît dans les archives', archive !== undefined, JSON.stringify(archives?.tickets));
check('la date d’archivage est rendue', Boolean(archive?.archivedAt), `${archive?.archivedAt}`);
check('le commerce concerné est nommé', archive?.organization?.includes(uniq) === true, archive?.organization);

titre('Et elle peut le rouvrir');
await patch(`/api/superowner/support-tickets/${ticketId}/status`, { status: 'IN_PROGRESS' }, TP);

const desarchive = await sqlScalaire(`SELECT "archivedAt" FROM "MerchantTicket" WHERE id = '${ticketId}'`);
check('il n’est plus archivé', desarchive === '', desarchive);

const deRetour = await j(await get('/api/superowner/support-tickets', TP));
check(
  'il revient dans les tickets en cours',
  (deRetour?.tickets || []).some((t) => t.id === ticketId),
  JSON.stringify((deRetour?.tickets || []).map((t) => t.status))
);

const reponse = await post(`/api/superowner/support-tickets/${ticketId}/messages`, { body: 'On regarde' }, TP);
check('et la plateforme peut y répondre', reponse.status < 400, `statut ${reponse.status}`);

// ===== Le détail d'une facturation =====

titre('Le détail d’un commerçant, commande par commande');
await commander(`c1-${uniq}@t.fr`);
await commander(`c2-${uniq}@t.fr`, 2);

const detail = await get(`/api/superowner/billing/${ORG}`, TP);
const lu = await j(detail);

check('le détail s’ouvre', detail.status === 200, `statut ${detail.status}`);
check('le commerçant est nommé', lu?.organization?.name?.includes(uniq) === true, lu?.organization?.name);
check('sa formule est dite', typeof lu?.tierLabel === 'string', `${lu?.tierLabel}`);
check('le taux appliqué est dit', Number(lu?.commissionPercent) > 0, `${lu?.commissionPercent}`);

check('les deux commandes sont là', (lu?.orders || []).length === 2, `${(lu?.orders || []).length}`);
check(
  'chaque commande porte sa part',
  (lu?.orders || []).every((ligne) => Number(ligne.commission) > 0),
  JSON.stringify((lu?.orders || []).map((l) => [l.total, l.commission]))
);
check(
  'la part suit le montant',
  (lu?.orders || []).every(
    (ligne) =>
      Math.abs(Number(ligne.commission) - (Number(ligne.total) * Number(lu.commissionPercent)) / 100) < 0.01
  ),
  JSON.stringify((lu?.orders || []).map((l) => [l.total, l.commission]))
);
check('la boutique est nommée', (lu?.orders || []).every((l) => l.boutique?.includes(uniq)), JSON.stringify((lu?.orders || []).map((l) => l.boutique)));

// 25 + 50 = 75 € de ventes.
check('le total des ventes est juste', Number(lu?.summary?.revenue) === 75, `${lu?.summary?.revenue}`);
check(
  'et la commission est la somme des parts',
  Number(lu?.summary?.commission) ===
    Number((lu?.orders || []).reduce((s, l) => s + Number(l.commission), 0).toFixed(2)),
  `${lu?.summary?.commission}`
);

titre('Un mois sans commande se dit');
const vide = await j(await get(`/api/superowner/billing/${ORG}?period=2020-01`, TP));
check('aucune commande', (vide?.orders || []).length === 0, `${(vide?.orders || []).length}`);
check('et aucune commission', Number(vide?.summary?.commission) === 0, `${vide?.summary?.commission}`);

titre('Un commerçant inconnu est un 404');
check(
  'et non une page vide',
  (await get('/api/superowner/billing/cminexistantxxxxxxxxx', TP)).status === 404,
  'statut inattendu'
);

// ===== Les bornes de commande de la plateforme =====

titre('Les bornes de commande sont appliquées');
// Réglables et enregistrées depuis toujours, elles n'étaient appliquées nulle
// part : un garde-fou qui ne garde rien.
// Par la route de Configuration, comme le superowner : une base neuve n'a pas
// encore de ligne de réglages, et un UPDATE direct n'en toucherait aucune.
await put('/api/admin/config', { minOrderAmount: 30, maxOrderAmount: 60 }, TP);

const tropPetite = await commander(`c3-${uniq}@t.fr`);
check('sous le minimum, la commande est refusée', tropPetite.status === 400, `statut ${tropPetite.status}`);
check(
  'et le montant minimum est dit',
  /30[.,]00 €/.test((await j(tropPetite))?.error || ''),
  (await j(tropPetite))?.error
);

const tropGrande = await commander(`c4-${uniq}@t.fr`, 3);
check('au-dessus du maximum, refusée aussi', tropGrande.status === 400, `statut ${tropGrande.status}`);
check(
  'avec son code',
  (await j(tropGrande))?.code === 'ABOVE_PLATFORM_MAXIMUM',
  (await j(tropGrande))?.code
);

const dansLesClous = await commander(`c5-${uniq}@t.fr`, 2);
check('entre les deux, elle passe', dansLesClous.status < 400, `statut ${dansLesClous.status}`);

titre('Un minimum à zéro n’impose rien');
await put('/api/admin/config', { minOrderAmount: 0, maxOrderAmount: 9999.99 }, TP);
const petite = await commander(`c6-${uniq}@t.fr`);
check('une petite commande passe', petite.status < 400, `statut ${petite.status}`);

// ===== Le journal des accès =====

titre('Le journal des accès est chronométré');
const journal = await j(await get('/api/admin/access-logs', TP));
const connexion = (journal?.logs || []).find((l) => l.action === 'LOGIN_SUCCESS');

check('la connexion y est', connexion !== undefined, JSON.stringify((journal?.logs || []).map((l) => l.action)));
check('son adresse est lisible', connexion?.ipAddress === '127.0.0.1', connexion?.ipAddress);
// La colonne « durée » affichait zéro : rien ne la mesurait.
check('sa durée est mesurée', Number(connexion?.duration) > 0, `${connexion?.duration}`);
check('son navigateur est retenu', connexion?.userAgent !== '—', connexion?.userAgent);

titre('Une adresse IPv6 locale est ramenée à une forme lisible');
const adresses = await sqlScalaire(
  `SELECT DISTINCT "ipAddress" FROM "SecurityEvent" WHERE "ipAddress" IS NOT NULL`
);
check('aucune forme « ::1 » ni « ::ffff: »', !/::/.test(adresses), adresses);

await terminer();
