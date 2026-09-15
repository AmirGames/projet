// La santé système : un chiffre qui mesure vraiment quelque chose, et qui
// bouge quand la plateforme se dégrade.

import { titre, check, j, uniq, post, get, put, terminer } from './outils.mjs';

const plateforme = await j(
  await post('/api/auth/signup', {
    email: `p-${uniq}@t.fr`,
    password: 'Password123!',
    name: `P ${uniq}`,
  })
);
const TP = plateforme.accessToken;

const lire = async () => {
  const [tableau, detail] = await Promise.all([
    j(await get('/api/superowner/dashboard', TP)),
    j(await get('/api/superowner/system-health', TP)),
  ]);

  return { stats: tableau?.stats, sante: detail?.data };
};

// ===== Le chiffre existe =====

titre('Le tableau de bord renvoie la santé');
const { stats, sante } = await lire();

check('le champ lu par la page est envoyé', typeof stats?.systemHealth === 'number', `${stats?.systemHealth}`);
check('il n’est plus figé à zéro', stats?.systemHealth > 0, `${stats?.systemHealth}`);
check('le détail a sa propre route', Array.isArray(sante?.controles), JSON.stringify(sante)?.slice(0, 200));
check('cinq relevés sont rendus', sante?.controles?.length === 5, `${sante?.controles?.length}`);
check('les deux chiffres concordent', sante?.score === stats?.systemHealth, `${sante?.score} / ${stats?.systemHealth}`);

titre('Chaque relevé se lit');
const controles = sante?.controles || [];

check(
  'chacun porte un libellé et un détail',
  controles.every((c) => c.libelle?.length > 0 && c.detail?.length > 0),
  JSON.stringify(controles.map((c) => [c.libelle, c.detail]))
);
check(
  'chacun annonce ses points',
  controles.every((c) => typeof c.poids === 'number' && typeof c.pointsObtenus === 'number'),
  JSON.stringify(controles.map((c) => [c.cle, c.poids, c.pointsObtenus]))
);
check(
  'les poids font bien 100',
  controles.reduce((somme, c) => somme + c.poids, 0) === 100,
  `${controles.reduce((somme, c) => somme + c.poids, 0)}`
);
check(
  'la somme des points obtenus donne le score',
  Math.abs(controles.reduce((somme, c) => somme + c.pointsObtenus, 0) - sante.score) <= 2,
  `${controles.reduce((somme, c) => somme + c.pointsObtenus, 0)} contre ${sante.score}`
);
check(
  'un relevé en défaut dit quoi faire',
  controles.filter((c) => c.etat !== 'OK').every((c) => c.remede?.length > 0),
  JSON.stringify(controles.filter((c) => c.etat !== 'OK').map((c) => [c.cle, c.remede]))
);
check(
  'un relevé au vert ne donne pas de remède',
  controles.filter((c) => c.etat === 'OK').every((c) => c.remede === ''),
  JSON.stringify(controles.filter((c) => c.etat === 'OK').map((c) => [c.cle, c.remede]))
);

// ===== La base répond =====

titre('La base');
const base = controles.find((c) => c.cle === 'base');
check('elle est relevée', Boolean(base), JSON.stringify(controles.map((c) => c.cle)));
check('elle pèse 30 points', base?.poids === 30, `${base?.poids}`);
check('elle répond', base?.etat === 'OK', `${base?.etat} — ${base?.detail}`);
check('le temps de réponse est chiffré', /\d+ ms/.test(base?.detail || ''), base?.detail);

// ===== Les sauvegardes =====

titre('Sans sauvegarde');
const sauvegardes = controles.find((c) => c.cle === 'sauvegardes');
check('l’absence de sauvegarde est signalée', sauvegardes?.etat === 'PANNE', `${sauvegardes?.etat}`);
check('elle ne rapporte aucun point', sauvegardes?.pointsObtenus === 0, `${sauvegardes?.pointsObtenus}`);
check(
  'le remède renvoie à la bonne page',
  /Données/.test(sauvegardes?.remede || ''),
  sauvegardes?.remede
);

titre('Après une sauvegarde');
const avantSauvegarde = sante.score;
const creation = await j(await post('/api/superowner/backups', {}, TP));
check('la sauvegarde aboutit', creation?.status === 'COMPLETED', JSON.stringify(creation)?.slice(0, 200));

const apresSauvegarde = await lire();
const sauvegardesApres = apresSauvegarde.sante.controles.find((c) => c.cle === 'sauvegardes');

check('le relevé passe au vert', sauvegardesApres?.etat === 'OK', `${sauvegardesApres?.etat} — ${sauvegardesApres?.detail}`);
check('il rapporte tous ses points', sauvegardesApres?.pointsObtenus === 20, `${sauvegardesApres?.pointsObtenus}`);
check('le remède disparaît', sauvegardesApres?.remede === '', sauvegardesApres?.remede);
check(
  'le score global monte',
  apresSauvegarde.sante.score > avantSauvegarde,
  `${avantSauvegarde} puis ${apresSauvegarde.sante.score}`
);

// ===== Le mode maintenance =====

titre('En mode maintenance');
const avantMaintenance = apresSauvegarde.sante.score;
await put('/api/superowner/system-config', { maintenanceMode: true }, TP);

const pendant = await lire();
const maintenance = pendant.sante.controles.find((c) => c.cle === 'maintenance');

check('la fermeture est vue', maintenance?.etat === 'PANNE', `${maintenance?.etat}`);
check('elle est dite en clair', /maintenance/i.test(maintenance?.detail || ''), maintenance?.detail);
check(
  'le score perd exactement les 15 points',
  avantMaintenance - pendant.sante.score === 15,
  `${avantMaintenance} puis ${pendant.sante.score}`
);

titre('Retour à l’ouverture');
await put('/api/superowner/system-config', { maintenanceMode: false }, TP);
const apres = await lire();

check('le relevé repasse au vert', apres.sante.controles.find((c) => c.cle === 'maintenance')?.etat === 'OK', 'resté rouge');
check('le score revient', apres.sante.score === avantMaintenance, `${apres.sante.score} contre ${avantMaintenance}`);

// ===== L'attribution des courses =====

titre('Une course sans livreur');
const avantCourse = apres.sante.score;

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
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
      latitude: 45.764,
      longitude: 4.8357,
    },
    commercant.accessToken
  )
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post('/api/products', { storeId, name: 'Margherita', price: 12, status: 'ACTIVE' }, commercant.accessToken)
);

const commande = await j(
  await post('/api/orders', {
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '2 rue de la Ré',
    deliveryCity: 'Lyon',
    deliveryLat: 45.767,
    deliveryLng: 4.833,
    totalAmount: 12,
    items: [{ productId: produit.product?.id || produit.id, quantity: 1, price: 12 }],
  })
);
const orderId = commande.order?.id || commande.id;

// Aucun livreur n'est en ligne : la course reste orpheline, ce que la santé
// doit voir.
const envoi = await j(await post(`/api/orders/${orderId}/dispatch`, {}, commercant.accessToken));
check('la course est créée sans livreur', envoi?.data?.propose === false || !envoi?.data?.driverId, JSON.stringify(envoi)?.slice(0, 200));

const avecCourse = await lire();
const attribution = avecCourse.sante.controles.find((c) => c.cle === 'attribution');

check('l’attribution est relevée', Boolean(attribution), JSON.stringify(avecCourse.sante.controles.map((c) => c.cle)));
check(
  'une course orpheline fait chuter le relevé',
  attribution?.pointsObtenus < 20,
  `${attribution?.pointsObtenus} — ${attribution?.detail}`
);
check(
  'le remède parle du rayon et des livreurs',
  /rayon|livreur/i.test(attribution?.remede || ''),
  attribution?.remede
);
check(
  'le score global en tient compte',
  avecCourse.sante.score < avantCourse,
  `${avantCourse} puis ${avecCourse.sante.score}`
);

// ===== L'accès =====

titre('Réservé à la plateforme');
const intrus = await j(
  await post('/api/auth/signup', { email: `x-${uniq}@t.fr`, password: 'Password123!', name: `X ${uniq}` })
);
check(
  'un commerçant ne voit pas le tableau de bord',
  (await get('/api/superowner/dashboard', intrus.accessToken)).status === 403,
  'accepté à tort'
);
check(
  'ni le détail de la santé',
  (await get('/api/superowner/system-health', intrus.accessToken)).status === 403,
  'accepté à tort'
);

// Le décor sert à éviter un avertissement sur une variable non lue.
check('la boutique témoin existe', Boolean(storeId), 'absente');

await terminer();
