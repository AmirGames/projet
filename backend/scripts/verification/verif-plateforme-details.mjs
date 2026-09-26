// Commission par formule, origine des actions dans les journaux, ordre de
// l'évolution journalière, compteurs du commerçant, ticket clos archivé.

import { inscription,
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
  await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

// L'inscription ne journalise pas de connexion : on se connecte pour que le
// journal des accès ait une entrée à montrer.
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
      name: `Resto ${uniq}`,
      slug: `resto-${uniq}`,
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
  await post('/api/products', { storeId, name: `Plat ${uniq}`, price: 20, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

// ===== La commission se règle par formule =====

titre('Chaque formule a son taux de commission');
const grille = await j(await get('/api/superowner/plans', TP));
const formules = grille?.formules || grille?.data || [];

check('la grille est rendue', formules.length === 3, JSON.stringify(formules.map((f) => f.code)));
check(
  'chacune porte une commission',
  formules.every((formule) => typeof formule.commission === 'number'),
  JSON.stringify(formules.map((f) => f.commission))
);
check(
  'la formule gratuite prélève plus que la Pro',
  formules.find((f) => f.code === 'FREE')?.commission >
    formules.find((f) => f.code === 'PRO')?.commission,
  JSON.stringify(formules.map((f) => [f.code, f.commission]))
);

titre('Elle se règle depuis la plateforme');
const reglage = await patch('/api/superowner/plans/FREE', { commission: 12 }, TP);
check('le réglage est accepté', reglage.status === 200, `statut ${reglage.status}`);

const enBase = await sqlScalaire(`SELECT "commissionPercent" FROM "PlanTier" WHERE code = 'FREE'`);
check('et enregistré', Number(enBase) === 12, enBase);

const aberrante = await patch('/api/superowner/plans/FREE', { commission: 150 }, TP);
check('un taux impossible est refusé', aberrante.status === 400, `statut ${aberrante.status}`);
check(
  'et le refus le dit en français',
  /100\s*%/.test((await j(aberrante))?.error || ''),
  (await j(aberrante))?.error
);

titre('Le commerçant voit ce qu’on prélève sur ses ventes');
const quota = await j(await get(`/api/stores/org/${ORG}/quota`, T));
check('sa formule annonce sa commission', Number(quota?.tierCommission) === 12, `${quota?.tierCommission}`);

// ===== La facturation dit d'où vient le montant =====

titre('La facturation montre son calcul');
await post('/api/orders', { conditionsAcceptees: true,
  storeId,
  customerName: `Client ${uniq}`,
  customerEmail: `c-${uniq}@t.fr`,
  customerPhone: '0600000000',
  deliveryType: 'PICKUP',
  totalAmount: 20,
  items: [{ productId, quantity: 1, price: 20 }],
});

const facturation = await j(await get('/api/superowner/billing', TP));
const ligne = (facturation?.billings || []).find((b) => b.id === ORG);

check('le commerçant est facturé', ligne !== undefined, JSON.stringify(facturation?.billings));
check('ses ventes du mois sont dites', Number(ligne?.revenue) === 20, `${ligne?.revenue}`);
check('le nombre de commandes aussi', Number(ligne?.ordersCount) === 1, `${ligne?.ordersCount}`);
check('le taux appliqué est celui de sa formule', Number(ligne?.commissionPercent) === 12, `${ligne?.commissionPercent}`);
// 12 % de 20 € : le montant ne sort plus de nulle part.
check('et le montant en découle', Number(ligne?.amount) === 2.4, `${ligne?.amount}`);

// ===== Les journaux retiennent l'origine =====

titre('Le journal d’audit garde l’adresse et le navigateur');
// Une action d'administration quelconque, pour produire une entrée.
await patch('/api/superowner/plans/PREMIUM', { prixMensuel: 31 }, TP);

const journal = await j(await get('/api/superowner/audit-logs', TP));
const entree = (journal?.logs || [])[0];

check('une entrée est écrite', entree !== undefined, JSON.stringify(journal?.logs?.length));
check('son adresse est renseignée', entree?.ipAddress !== '—', entree?.ipAddress);
check('son navigateur aussi', entree?.userAgent !== '—', entree?.userAgent);

titre('Le journal des accès aussi');
const acces = await j(await get('/api/admin/access-logs', TP));
const connexion = (acces?.logs || []).find((l) => l.action === 'LOGIN_SUCCESS');

check('la connexion est journalisée', connexion !== undefined, JSON.stringify((acces?.logs || []).map((l) => l.action)));
check('avec son adresse', connexion?.ipAddress !== '—', connexion?.ipAddress);
check('et son navigateur', connexion?.userAgent !== '—', connexion?.userAgent);

titre('Et le journal des accès n’invente plus rien');
const cru = await j(await get('/api/super-admin/access-logs', TP));
check(
  'plus d’adresse écrite en dur',
  !(cru?.logs || []).some((l) => l.ipAddress === '192.168.1.100'),
  JSON.stringify((cru?.logs || []).map((l) => l.ipAddress))
);

// ===== L'évolution journalière part du jour en cours =====

titre('L’évolution journalière commence par aujourd’hui');
const analytics = await j(await get('/api/superowner/analytics?period=30days', TP));
const tranches = analytics?.data || [];

check('des tranches sont rendues', tranches.length > 1, `${tranches.length}`);
check(
  'la première porte les ventes du jour',
  Number(tranches[0]?.totalRevenue) === 20,
  JSON.stringify(tranches.slice(0, 2))
);
check(
  'et la dernière est la plus ancienne',
  Number(tranches[tranches.length - 1]?.totalRevenue) === 0,
  `${tranches[tranches.length - 1]?.totalRevenue}`
);

// ===== Les compteurs du commerçant =====

titre('Le commerçant voit ses vrais chiffres');
const bilan = await j(await get(`/api/orders?orgId=${ORG}&limit=5`, T));

check('le nombre de commandes est calculé', Number(bilan?.summary?.totalOrders) === 1, JSON.stringify(bilan?.summary));
check('le chiffre d’affaires aussi', Number(bilan?.summary?.totalRevenue) === 20, JSON.stringify(bilan?.summary));

// ===== Un ticket clos est archivé =====

titre('Clore un ticket l’archive');
const ticket = await j(
  await post(
    '/api/support/tickets',
    { orgId: ORG, subject: `Souci ${uniq}`, description: 'Un souci de connexion', category: 'TECHNICAL' },
    T
  )
);
const ticketId = ticket?.data?.id || ticket?.id;

await post(`/api/support/tickets/${ticketId}/messages`, { body: 'Bonjour' }, T);
await patch(`/api/superowner/support-tickets/${ticketId}/status`, { status: 'CLOSED' }, TP);

const archive = await sqlScalaire(`SELECT "archivedAt" FROM "MerchantTicket" WHERE id = '${ticketId}'`);
check('il est archivé', archive !== '', archive);

const actifs = await j(await get(`/api/support/tickets?orgId=${ORG}&archived=false`, T));
check(
  'il ne figure plus parmi les tickets actifs',
  !(actifs?.data || []).some((t) => t.id === ticketId),
  JSON.stringify((actifs?.data || []).map((t) => t.status))
);

const archives = await j(await get(`/api/support/tickets?orgId=${ORG}&archived=true`, T));
check(
  'mais il reste consultable dans les archives',
  (archives?.data || []).some((t) => t.id === ticketId),
  JSON.stringify((archives?.data || []).length)
);

const refus = await post(`/api/support/tickets/${ticketId}/messages`, { body: 'Et ça ?' }, T);
check('on n’y écrit plus', refus.status === 400, `statut ${refus.status}`);
check(
  'et on sait quoi faire',
  /ouvrez-en un nouveau/i.test((await j(refus))?.error || ''),
  (await j(refus))?.error
);

const etat = await sqlScalaire(`SELECT status FROM "MerchantTicket" WHERE id = '${ticketId}'`);
check('le ticket reste clos', etat === 'CLOSED', etat);

titre('Rouvrir un ticket le sort de l’archive');
await patch(`/api/superowner/support-tickets/${ticketId}/status`, { status: 'IN_PROGRESS' }, TP);
const desarchive = await sqlScalaire(`SELECT "archivedAt" FROM "MerchantTicket" WHERE id = '${ticketId}'`);
check('il n’est plus archivé', desarchive === '', desarchive);

const reprise = await post(`/api/support/tickets/${ticketId}/messages`, { body: 'Merci' }, T);
check('et on peut y répondre de nouveau', reprise.status < 400, `statut ${reprise.status}`);

titre('Un ticket résolu, lui, se relance');
const second = await j(
  await post(
    '/api/support/tickets',
    { orgId: ORG, subject: `Autre ${uniq}`, description: 'Un autre souci à voir', category: 'TECHNICAL' },
    T
  )
);
const secondId = second?.data?.id || second?.id;

await patch(`/api/superowner/support-tickets/${secondId}/status`, { status: 'RESOLVED' }, TP);
const relance = await post(`/api/support/tickets/${secondId}/messages`, { body: 'Ça ne marche pas' }, T);
check('la réponse est acceptée', relance.status < 400, `statut ${relance.status}`);

const etatRelance = await sqlScalaire(`SELECT status FROM "MerchantTicket" WHERE id = '${secondId}'`);
check('et le ticket repart', etatRelance === 'IN_PROGRESS', etatRelance);

await terminer();
