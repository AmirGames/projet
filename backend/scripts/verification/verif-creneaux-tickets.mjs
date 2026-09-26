// Les créneaux de retrait proposés au client, et l'alerte de la plateforme
// quand un commerçant ouvre un ticket.

import { inscription,
  titre,
  check,
  j,
  uniq,
  post,
  get,
  put,
  terminer,
  sqlScalaire,
} from './outils.mjs';

// ===== Le décor =====

const plateforme = await j(
  await inscription({
    email: `p-${uniq}@t.fr`,
    password: 'Password123!',
    name: `P ${uniq}`,
  })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await inscription({
    email: `m-${uniq}@t.fr`,
    password: 'Password123!',
    name: `M ${uniq}`,
  })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Pizzeria ${uniq}`,
      slug: `pizzeria-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

// ===== Créneaux de retrait =====

// Des horaires nets : ouverture à 11 h, fermeture à 14 h, et le lundi fermé.
// Un champ d'heure libre laissait commander à 9 h un retrait impossible.
const HORAIRES = {
  MON: { open: '11:00', close: '14:00', closed: true },
  TUE: { open: '11:00', close: '14:00', closed: false },
  WED: { open: '11:00', close: '14:00', closed: false },
  THU: { open: '11:00', close: '14:00', closed: false },
  FRI: { open: '11:00', close: '14:00', closed: false },
  SAT: { open: '11:00', close: '14:00', closed: false },
  SUN: { open: '11:00', close: '14:00', closed: false },
};

/** Les horaires se posent un jour à la fois : il n'y a pas de route globale. */
const poserLesHoraires = async (id, horaires, jeton) => {
  for (const [jour, valeur] of Object.entries(horaires)) {
    await put(`/api/store-hours/${id}/day/${jour}`, valeur, jeton);
  }
};

await poserLesHoraires(storeId, HORAIRES, T);

titre('Créneaux de retrait');
const reponse = await get(`/api/client/stores/${storeId}/pickup-slots`);
const corps = await j(reponse);
const jours = corps?.data;

check('la route répond sans compte', reponse.status === 200, `statut ${reponse.status}`);
check('des journées sont proposées', Array.isArray(jours) && jours.length > 0, JSON.stringify(corps)?.slice(0, 200));

const tousLesCreneaux = (jours || []).flatMap((jour) =>
  jour.creneaux.map((c) => ({ ...c, jour: jour.date }))
);

check(
  'chaque journée porte une date et un libellé',
  (jours || []).every((jour) => /^\d{4}-\d{2}-\d{2}$/.test(jour.date) && jour.libelle?.length > 0),
  JSON.stringify((jours || []).map((jr) => [jr.date, jr.libelle]))
);

// Le cœur du correctif : rien avant l'ouverture, rien après la fermeture.
const horsHoraires = tousLesCreneaux.filter((c) => {
  const instant = new Date(c.valeur);
  const minutes = instant.getHours() * 60 + instant.getMinutes();
  return minutes < 11 * 60 || minutes >= 14 * 60;
});

check(
  'aucun créneau hors des heures d’ouverture',
  horsHoraires.length === 0,
  horsHoraires.slice(0, 3).map((c) => c.libelle).join(', ')
);

const passes = tousLesCreneaux.filter((c) => new Date(c.valeur).getTime() < Date.now());
check('aucun créneau déjà passé', passes.length === 0, passes.slice(0, 3).map((c) => c.valeur).join(', '));

// Trente minutes de préparation : un retrait dans cinq minutes n'existe pas.
const tropTot = tousLesCreneaux.filter(
  (c) => new Date(c.valeur).getTime() < Date.now() + 25 * 60 * 1000
);
check('le délai de préparation est respecté', tropTot.length === 0, tropTot.slice(0, 3).map((c) => c.libelle).join(', '));

const lundis = (jours || []).filter((jour) => new Date(`${jour.date}T12:00:00`).getDay() === 1);
check('le jour de fermeture est absent', lundis.length === 0, JSON.stringify(lundis.map((jr) => jr.date)));

check(
  'les créneaux portent une heure lisible',
  tousLesCreneaux.every((c) => /^\d{2}[:h]\d{2}$/.test(c.libelle)),
  tousLesCreneaux.slice(0, 3).map((c) => c.libelle).join(', ')
);

titre('Une boutique fermée toute la semaine');
const HORAIRES_FERMES = Object.fromEntries(
  Object.entries(HORAIRES).map(([jour, h]) => [jour, { ...h, closed: true }])
);

// Un second commerçant : la formule gratuite n'autorise qu'une boutique, et
// la deuxième création échouait silencieusement, faisant passer le contrôle
// pour un succès.
const autreCommercant = await j(
  await inscription({
    email: `f-${uniq}@t.fr`,
    password: 'Password123!',
    name: `F ${uniq}`,
  })
);
const TF = autreCommercant.accessToken;

const morte = await j(
  await post(
    '/api/stores',
    {
      orgId: autreCommercant.organization.id,
      name: `Fermée ${uniq}`,
      slug: `fermee-${uniq}`,
      address: '2 rue',
      city: 'Lyon',
      postalCode: '69003',
      phone: '0400000001',
    },
    TF
  )
);
const morteId = morte.store?.id || morte.id;
check('la boutique témoin existe', Boolean(morteId), JSON.stringify(morte)?.slice(0, 200));

await poserLesHoraires(morteId, HORAIRES_FERMES, TF);

const aucun = await j(await get(`/api/client/stores/${morteId}/pickup-slots`));
check('aucun créneau n’est inventé', Array.isArray(aucun?.data) && aucun.data.length === 0, JSON.stringify(aucun));

// ===== Le ticket qui prévient la plateforme =====

titre('Ouverture d’un ticket');
const avant = Number(
  await sqlScalaire(
    `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = '${plateforme.user.email}'`
  )
);

const ticket = await j(
  await post(
    '/api/support/tickets',
    {
      orgId: commercant.organization.id,
      subject: `Panne caisse ${uniq}`,
      description: 'La caisse ne rend plus la monnaie depuis ce matin.',
      priority: 'HIGH',
      category: 'TECHNICAL',
    },
    T
  )
);

check('le ticket est créé', Boolean(ticket?.data?.id), JSON.stringify(ticket)?.slice(0, 200));

const notifications = await j(await get('/api/notifications', TP));
const liste = notifications?.data?.notifications || notifications?.data || notifications?.notifications || [];
const alerte = (Array.isArray(liste) ? liste : []).find((n) =>
  (n.message || '').includes(`Panne caisse ${uniq}`)
);

const apres = Number(
  await sqlScalaire(
    `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = '${plateforme.user.email}'`
  )
);

check('la plateforme reçoit une notification', apres === avant + 1, `${avant} puis ${apres}`);
check('elle est lisible dans la cloche', Boolean(alerte), JSON.stringify(liste)?.slice(0, 300));
check(
  'elle nomme le commerçant',
  (alerte?.title || '').startsWith('Nouveau ticket —'),
  alerte?.title
);
check(
  'un ticket urgent est marqué urgent',
  alerte?.priority === 'HIGH',
  `${alerte?.priority}`
);
check(
  'elle mène à la page du support',
  alerte?.link === '/superowner/support-tickets',
  alerte?.link
);

titre('Le commerçant n’est pas prévenu de son propre ticket');
const sienne = Number(
  await sqlScalaire(
    `SELECT COUNT(*) FROM "Notification" WHERE "recipientEmail" = '${commercant.user.email}' AND "title" LIKE 'Nouveau ticket%'`
  )
);
check('aucune notification en retour', sienne === 0, `${sienne}`);

titre('Un ticket ordinaire');
await post(
  '/api/support/tickets',
  {
    orgId: commercant.organization.id,
    subject: `Question facture ${uniq}`,
    description: 'Je ne retrouve pas ma facture du mois dernier.',
    priority: 'LOW',
    category: 'BILLING',
  },
  T
);

const ordinaire = await sqlScalaire(
  `SELECT "priority" FROM "Notification" WHERE "recipientEmail" = '${plateforme.user.email}' AND "message" LIKE 'Question facture ${uniq}%' LIMIT 1`
);
check('il reste en priorité moyenne', ordinaire === 'MEDIUM', ordinaire || 'aucune notification');

await terminer();
