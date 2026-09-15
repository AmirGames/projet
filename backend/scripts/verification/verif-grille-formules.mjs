// La grille tarifaire : réglable par la plateforme, visible du commerçant,
// et réellement appliquée au quota de boutiques.

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

// ===== Le décor =====

const plateforme = await j(
  await post('/api/auth/signup', {
    email: `p-${uniq}@t.fr`,
    password: 'Password123!',
    name: `P ${uniq}`,
  })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await post('/api/auth/signup', {
    email: `m-${uniq}@t.fr`,
    password: 'Password123!',
    name: `M ${uniq}`,
  })
);
const T = commercant.accessToken;
const ORG = commercant.organization.id;

const creerBoutique = (suffixe) =>
  post(
    '/api/stores',
    {
      orgId: ORG,
      name: `Boutique ${suffixe}`,
      slug: `boutique-${suffixe}-${uniq}`,
      address: '1 rue',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
    },
    T
  );

// ===== La grille amorcée toute seule =====

titre('La grille de départ');
const grille = await j(await get('/api/superowner/plans', TP));
const formules = grille?.data || [];

check('la plateforme voit la grille', Array.isArray(formules) && formules.length === 3, JSON.stringify(grille)?.slice(0, 200));
check(
  'les trois codes sont là',
  ['FREE', 'PREMIUM', 'PRO'].every((code) => formules.some((f) => f.code === code)),
  JSON.stringify(formules.map((f) => f.code))
);
check(
  'elle est ordonnée du moins cher au plus cher',
  formules.map((f) => f.ordre).join(',') === '0,1,2',
  JSON.stringify(formules.map((f) => [f.code, f.ordre]))
);
check(
  'chaque formule porte des arguments de vente',
  formules.every((f) => Array.isArray(f.avantages) && f.avantages.length > 0),
  JSON.stringify(formules.map((f) => f.avantages))
);
check(
  'le nombre d’abonnés est compté',
  formules.find((f) => f.code === 'FREE')?.abonnes >= 2,
  JSON.stringify(formules.map((f) => [f.code, f.abonnes]))
);

// Elle est bien en base, pas calculée à la volée.
const enBase = await sqlScalaire(`SELECT COUNT(*) FROM "PlanTier"`);
check('elle est écrite en base', enBase === '3', enBase);

titre('Un commerçant ne règle pas la grille');
const refus = await patch('/api/superowner/plans/FREE', { prixMensuel: 0 }, T);
check('la route est réservée à la plateforme', refus.status === 403, `statut ${refus.status}`);

const inchangee = await sqlScalaire(`SELECT "maxStores" FROM "PlanTier" WHERE code = 'FREE'`);
check('rien n’a bougé', inchangee === '1', inchangee);

// ===== Le quota vient de la grille =====

titre('Le quota suit la formule');
const premiere = await creerBoutique('un');
check('la première boutique passe', premiere.status === 201, `statut ${premiere.status}`);

const seconde = await creerBoutique('deux');
const corpsSeconde = await j(seconde);
check('la seconde est refusée en Gratuit', seconde.status === 403, `statut ${seconde.status}`);
check(
  'le refus nomme la formule suivante',
  /Premium/i.test(corpsSeconde?.error || ''),
  corpsSeconde?.error
);

titre('La plateforme relève le quota');
const releve = await patch('/api/superowner/plans/FREE', { maxBoutiques: 2 }, TP);
check('le réglage est accepté', releve.status === 200, `statut ${releve.status}`);

const apresReleve = await creerBoutique('trois');
check('la seconde boutique passe maintenant', apresReleve.status === 201, `statut ${apresReleve.status}`);

const quota = await j(await get(`/api/stores/org/${ORG}/quota`, T));
check('le quota affiché suit', quota?.max === 2, JSON.stringify(quota));
check('il est atteint', quota?.canCreate === false, JSON.stringify(quota));

titre('On ne descend pas sous l’existant');
const trop = await patch('/api/superowner/plans/FREE', { maxBoutiques: 1 }, TP);
const corpsTrop = await j(trop);
check('la baisse est refusée', trop.status === 409, `statut ${trop.status}`);
check(
  'le refus nomme le commerçant concerné',
  (corpsTrop?.error || '').includes(commercant.organization.name),
  corpsTrop?.error
);

const toujours = await sqlScalaire(`SELECT "maxStores" FROM "PlanTier" WHERE code = 'FREE'`);
check('le quota n’a pas été abaissé', toujours === '2', toujours);

titre('Réglages refusés');
check(
  'un quota nul est refusé',
  (await patch('/api/superowner/plans/PRO', { maxBoutiques: 0 }, TP)).status === 400,
  'accepté à tort'
);
check(
  'un tarif négatif est refusé',
  (await patch('/api/superowner/plans/PRO', { prixMensuel: -5 }, TP)).status === 400,
  'accepté à tort'
);
check(
  'un code inconnu est refusé',
  (await patch('/api/superowner/plans/PLATINE', { prixMensuel: 5 }, TP)).status === 400,
  'accepté à tort'
);

// ===== Renommer, retarifer =====

titre('Renommer une formule');
await patch(
  '/api/superowner/plans/PREMIUM',
  { libelle: `Confort ${uniq}`, prixMensuel: 19.5, avantages: ['Trois boutiques', 'Support rapide'] },
  TP
);

const relue = await j(await get('/api/superowner/plans', TP));
const confort = (relue?.data || []).find((f) => f.code === 'PREMIUM');

check('le nouveau nom est retenu', confort?.libelle === `Confort ${uniq}`, confort?.libelle);
check('le nouveau tarif est retenu', confort?.prixMensuel === 19.5, `${confort?.prixMensuel}`);
check(
  'les arguments sont remplacés',
  JSON.stringify(confort?.avantages) === JSON.stringify(['Trois boutiques', 'Support rapide']),
  JSON.stringify(confort?.avantages)
);

// Le message de refus doit parler du nouveau nom, pas de l'ancien.
await patch('/api/superowner/plans/FREE', { maxBoutiques: 2 }, TP);
const encore = await j(await creerBoutique('quatre'));
check(
  'le refus reprend le nom renommé',
  (encore?.error || '').includes(`Confort ${uniq}`),
  encore?.error
);

// ===== Ce que voit le commerçant =====

titre('Le commerçant voit sa formule');
const vue = await j(await get(`/api/plans/${ORG}`, T));

check('la grille lui est servie', vue?.data?.grille?.length === 3, JSON.stringify(vue)?.slice(0, 200));
check('sa formule est indiquée', vue?.data?.quota?.tier === 'FREE', JSON.stringify(vue?.data?.quota));
check(
  'le nom renommé lui parvient',
  vue?.data?.grille?.find((f) => f.code === 'PREMIUM')?.libelle === `Confort ${uniq}`,
  JSON.stringify(vue?.data?.grille?.map((f) => f.libelle))
);
check('aucune demande en cours', vue?.data?.demandeEnCours === null, JSON.stringify(vue?.data?.demandeEnCours));

titre('Un autre commerçant ne voit pas la sienne');
const intrus = await j(
  await post('/api/auth/signup', {
    email: `x-${uniq}@t.fr`,
    password: 'Password123!',
    name: `X ${uniq}`,
  })
);
const vol = await get(`/api/plans/${ORG}`, intrus.accessToken);
check('l’accès est refusé', vol.status === 403, `statut ${vol.status}`);

// ===== La demande de changement =====

titre('Demander une formule supérieure');
const avantNotifs = Number(
  await sqlScalaire(
    `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = '${plateforme.user.email}'`
  )
);

const demande = await post(`/api/plans/${ORG}/demande`, { tier: 'PREMIUM' }, T);
const corpsDemande = await j(demande);

check('la demande est acceptée', demande.status === 201, `statut ${demande.status}`);
check(
  'elle ouvre un ticket de facturation',
  Boolean(corpsDemande?.data?.id),
  JSON.stringify(corpsDemande)?.slice(0, 200)
);

const ticket = await sqlScalaire(
  `SELECT "category" FROM "MerchantTicket" WHERE id = '${corpsDemande?.data?.id}'`
);
check('le ticket est rangé en facturation', ticket === 'BILLING', ticket);

const description = await sqlScalaire(
  `SELECT "description" FROM "MerchantTicket" WHERE id = '${corpsDemande?.data?.id}'`
);
check('il rappelle la formule actuelle', description.includes('Formule actuelle'), description.slice(0, 120));
check('il chiffre la formule demandée', description.includes('19.5') || description.includes('19,5'), description.slice(0, 200));

const apresNotifs = Number(
  await sqlScalaire(
    `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = '${plateforme.user.email}'`
  )
);
check('la plateforme est prévenue', apresNotifs === avantNotifs + 1, `${avantNotifs} puis ${apresNotifs}`);

titre('Pas deux demandes à la fois');
const doublon = await post(`/api/plans/${ORG}/demande`, { tier: 'PRO' }, T);
check('la seconde est refusée', doublon.status === 409, `statut ${doublon.status}`);

const vueApres = await j(await get(`/api/plans/${ORG}`, T));
check(
  'la demande en cours est signalée',
  vueApres?.data?.demandeEnCours?.id === corpsDemande?.data?.id,
  JSON.stringify(vueApres?.data?.demandeEnCours)
);

titre('Demandes sans objet');
// Le ticket en cours bloque tout : on le ferme pour tester le reste.
await sqlScalaire(
  `UPDATE "MerchantTicket" SET "status" = 'CLOSED' WHERE id = '${corpsDemande?.data?.id}' RETURNING id`
);

const memeFormule = await post(`/api/plans/${ORG}/demande`, { tier: 'FREE' }, T);
check('demander sa propre formule est refusé', memeFormule.status === 400, `statut ${memeFormule.status}`);

await terminer();
