// Une annonce de la plateforme atteint enfin quelqu'un.
//
// « Diffuser une annonce » n'en diffusait aucune : une seule ligne était créée,
// adressée à l'administrateur qui l'écrivait. Le public visé était enregistré à
// côté, et personne ne le lisait. L'écran, lui, annonçait « Annonce diffusée ».

import { inscription, titre, check, j, uniq, post, get, terminer, sqlScalaire } from './outils.mjs';

const MDP = 'Password123!';

const plateforme = await j(
  await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

const livreur = await j(
  await post('/api/drivers/register', { conditionsAcceptees: true,
    name: `Livreur ${uniq}`,
    email: `l-${uniq}@t.fr`,
    password: MDP,
    phone: '0600000001',
    vehicleType: 'bike',
  })
);

if (!livreur?.accessToken) {
  console.error(`Inscription du livreur impossible : ${JSON.stringify(livreur)?.slice(0, 300)}`);
  process.exit(1);
}

// ===== Le public visé =====

titre('Une annonce aux commerçants arrive au commerçant');
const auxCommercants = await j(
  await post(
    '/api/admin/notifications',
    {
      title: `Maintenance ${uniq}`,
      message: 'Le service sera interrompu dimanche matin.',
      targetAudience: 'MERCHANTS',
    },
    TP
  )
);

check('la diffusion est acceptée', !!auxCommercants?.notification?.id, JSON.stringify(auxCommercants)?.slice(0, 200));
check('elle compte ses destinataires', auxCommercants?.destinataires >= 1, `${auxCommercants?.destinataires}`);

// Le contrôle qui compte : la boîte du commerçant, pas le code de retour.
const boiteCommercant = await j(await get('/api/notifications', T));
const recue = (boiteCommercant?.data || []).find((n) => n.title === `Maintenance ${uniq}`);
check('le commerçant la reçoit', !!recue, JSON.stringify(boiteCommercant?.data?.map((n) => n.title)));
check('avec son message', recue?.message?.includes('dimanche matin'), recue?.message);

titre('Mais pas au livreur');
const boiteLivreur = await j(await get('/api/notifications', livreur?.accessToken));
const chezLeLivreur = (boiteLivreur?.data || []).some((n) => n.title === `Maintenance ${uniq}`);
check('le livreur ne la reçoit pas', chezLeLivreur === false, 'reçue à tort');

titre('Une annonce aux livreurs fait l’inverse');
await post(
  '/api/admin/notifications',
  { title: `Courses ${uniq}`, message: 'Nouvelle prime le week-end.', targetAudience: 'DRIVERS' },
  TP
);

const boiteLivreur2 = await j(await get('/api/notifications', livreur?.accessToken));
check(
  'le livreur la reçoit',
  (boiteLivreur2?.data || []).some((n) => n.title === `Courses ${uniq}`),
  JSON.stringify(boiteLivreur2?.data?.map((n) => n.title))
);

const boiteCommercant2 = await j(await get('/api/notifications', T));
check(
  'le commerçant ne la reçoit pas',
  !(boiteCommercant2?.data || []).some((n) => n.title === `Courses ${uniq}`),
  'reçue à tort'
);

titre('« Tout le monde » atteint les deux');
await post(
  '/api/admin/notifications',
  { title: `Bonne annee ${uniq}`, message: 'Bonne année à tous.', targetAudience: 'ALL' },
  TP
);

const tous = await sqlScalaire(
  `SELECT COUNT(*) FROM "Notification" WHERE title = 'Bonne annee ${uniq}'`
);
// L'auteur, le commerçant et le livreur : trois exemplaires.
check('elle est recopiée pour chacun', Number(tous) >= 3, tous);

const chezTousLeCommercant = await j(await get('/api/notifications', T));
check(
  'le commerçant l’a',
  (chezTousLeCommercant?.data || []).some((n) => n.title === `Bonne annee ${uniq}`),
  'absente'
);

const chezTousLeLivreur = await j(await get('/api/notifications', livreur?.accessToken));
check(
  'le livreur aussi',
  (chezTousLeLivreur?.data || []).some((n) => n.title === `Bonne annee ${uniq}`),
  'absente'
);

// ===== Les refus =====

titre('Les publics que l’écran proposait à tort');
// Le formulaire offrait ADMIN, MERCHANT et USER : trois choix sur quatre
// étaient refusés en 400, sans que rien ne s'affiche.
const inconnu = await post(
  '/api/admin/notifications',
  { title: `Test ${uniq}`, message: 'Message de test.', targetAudience: 'ADMIN' },
  TP
);
check('un public inconnu est refusé', inconnu.status === 400, `statut ${inconnu.status}`);

const sansTitre = await post('/api/admin/notifications', { message: 'Sans titre.' }, TP);
check('une annonce sans titre est refusée', sansTitre.status === 400, `statut ${sansTitre.status}`);

titre('Seule la plateforme diffuse');
const parLeCommercant = await post(
  '/api/admin/notifications',
  { title: `Pirate ${uniq}`, message: 'Message pirate.' },
  T
);
check('un commerçant ne diffuse pas', parLeCommercant.status === 403, `statut ${parLeCommercant.status}`);

const pirate = await sqlScalaire(
  `SELECT COUNT(*) FROM "Notification" WHERE title = 'Pirate ${uniq}'`
);
check('et rien n’est parti', pirate === '0', pirate);

await terminer();
