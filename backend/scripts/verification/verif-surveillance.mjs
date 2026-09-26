// La surveillance du site : le trafic, les erreurs et les tâches se relèvent
// en direct, les erreurs des navigateurs remontent, et une sonde externe sait
// si le serveur peut servir.

import { API, inscrirePlateforme, inscrire, titre, check, j, uniq, post, get, terminer } from './outils.mjs';

const plateforme = await inscrirePlateforme();
const TP = plateforme.accessToken;

const lire = async () => j(await get('/api/superowner/monitoring', TP)).then((r) => r?.data);

// ===== Les sondes externes =====

titre('Les sondes');
const vivant = await fetch(`${API}/health`);
check('/health répond 200', vivant.status === 200, `${vivant.status}`);

const pret = await fetch(`${API}/health/ready`);
const corpsPret = await j(pret);
check('/health/ready répond 200 quand la base répond', pret.status === 200, `${pret.status}`);
check('il dit que la base répond', corpsPret?.base?.etat === 'OK', JSON.stringify(corpsPret));

// ===== Réservé à la plateforme =====

titre('Réservé à la plateforme');
const anonyme = await get('/api/superowner/monitoring');
check('un anonyme est refusé', anonyme.status === 401, `${anonyme.status}`);

const commercant = await inscrire('commercant');
const refuse = await get('/api/superowner/monitoring', commercant.accessToken);
check('un commerçant est refusé', refuse.status === 403, `${refuse.status}`);

// ===== Le trafic =====

titre('Le trafic est compté');
const avant = await lire();
check('la page reçoit un instantané', Boolean(avant?.trafic?.cinqMinutes), JSON.stringify(avant)?.slice(0, 200));

for (let i = 0; i < 5; i++) await get('/api/superowner/system-health', TP);
await get(`/api/route-inventee-${uniq}`);

const apres = await lire();
check(
  'les requêtes augmentent',
  apres.trafic.cinqMinutes.requetes >= avant.trafic.cinqMinutes.requetes + 6,
  `${avant.trafic.cinqMinutes.requetes} puis ${apres.trafic.cinqMinutes.requetes}`
);
check('la série couvre une heure', apres.trafic.serie.length === 60, `${apres.trafic.serie.length}`);
check('un temps de réponse est mesuré', apres.trafic.cinqMinutes.p95Ms >= 0, `${apres.trafic.cinqMinutes.p95Ms}`);

const sante = apres.routes.find((r) => r.route === 'GET /api/superowner/system-health');
check('la route appelée a sa ligne', sante?.requetes >= 5, JSON.stringify(sante));
check(
  'une URL inventée ne crée pas sa propre ligne',
  !apres.routes.some((r) => r.route.includes(`route-inventee-${uniq}`)),
  JSON.stringify(apres.routes.map((r) => r.route))
);
check(
  'les identifiants sont regroupés',
  apres.routes.every((r) => !/c[a-z0-9]{20,}/.test(r.route)),
  JSON.stringify(apres.routes.map((r) => r.route))
);

// ===== Le serveur et ses dépendances =====

titre('Le serveur');
check('la mémoire est relevée', apres.processus.memoire.tasUtiliseMo > 0, JSON.stringify(apres.processus.memoire));
check('la durée de fonctionnement est relevée', apres.processus.dureeFonctionnementS >= 0, `${apres.processus.dureeFonctionnementS}`);

titre('Les dépendances');
const releve = j(await post('/api/superowner/monitoring/releve', {}, TP)).then((r) => r?.data);
const donnees = await releve;
const base = donnees?.dependances?.find((d) => d.cle === 'base');
check('la base est contrôlée', base?.etat === 'OK', JSON.stringify(base));
check(
  'chaque dépendance dit ce qu’il en est',
  donnees.dependances.every((d) => d.libelle && d.detail && d.etat),
  JSON.stringify(donnees.dependances)
);
check('le dernier passage est daté', Boolean(donnees.dernierPassage), `${donnees.dernierPassage}`);

// ===== Les tâches de fond =====

titre('Les tâches de fond');
const cles = donnees.taches.map((t) => t.cle);
for (const cle of ['dispatch', 'webhooks', 'commandes', 'livreurs', 'pieces-commercants', 'fermetures']) {
  check(`« ${cle} » est déclarée`, cles.includes(cle), JSON.stringify(cles));
}
const dispatch = donnees.taches.find((t) => t.cle === 'dispatch');
check('une tâche fréquente a déjà tourné', dispatch?.executions > 0, JSON.stringify(dispatch));
check('aucune tâche n’est en échec', donnees.taches.every((t) => t.etat !== 'PANNE'), JSON.stringify(donnees.taches));

// ===== Les erreurs des navigateurs =====

titre('Les erreurs des navigateurs');
const message = `TypeError: verif ${uniq}`;
const signale = await post('/api/monitoring/client-errors', { message, page: '/client', source: 'app.js:1:1' });
check('le signalement est accepté sans compte', signale.status === 204, `${signale.status}`);
await post('/api/monitoring/client-errors', { message, page: '/client/orders', source: 'app.js:1:1' });

const incomplet = await post('/api/monitoring/client-errors', { page: '/client' });
check('un signalement sans message est refusé', incomplet.status === 400, `${incomplet.status}`);

const avecErreurs = await lire();
const erreur = avecErreurs.erreurs.navigateur.find((e) => e.message === message);
check('l’erreur apparaît', Boolean(erreur), JSON.stringify(avecErreurs.erreurs.navigateur).slice(0, 300));
check('les deux signalements n’en font qu’une ligne', erreur?.occurrences === 2, `${erreur?.occurrences}`);
check('la dernière page est retenue', erreur?.page === '/client/orders', `${erreur?.page}`);
check('le navigateur est noté', typeof erreur?.navigateur === 'string', `${erreur?.navigateur}`);

titre('Un flot de signalements est freiné');
let freine = false;
for (let i = 0; i < 40 && !freine; i++) {
  const r = await post('/api/monitoring/client-errors', { message: `flot ${uniq} ${i}`, page: '/' });
  if (r.status === 429) freine = true;
}
check('au-delà de 30 par minute, le serveur refuse', freine, 'jamais freiné');

// ===== Le statut =====

titre('Le verdict');
check('un statut est rendu', ['OK', 'DEGRADE', 'PANNE'].includes(avecErreurs.statut), avecErreurs.statut);
check(
  'un incident ouvert dit pourquoi',
  avecErreurs.incidents.ouverts.every((i) => i.titre && i.detail && i.ouvertLe),
  JSON.stringify(avecErreurs.incidents.ouverts)
);

await terminer();
