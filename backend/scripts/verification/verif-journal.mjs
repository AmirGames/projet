// Ce que le journal crie, et ce qu'il murmure.
//
// Tout partait en ERROR avec sa pile d'appels : une session à refaire, une TVA
// mal saisie, une page qui n'existe pas remplissaient le journal du même bruit
// que les vraies pannes. On ne distinguait plus ce qui appelle une
// intervention de ce qui est le fonctionnement normal.
//
// La suite démarre sa propre API pour lire sa sortie : celle du serveur commun
// part ailleurs.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { titre, check, terminer } from './outils.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 4612;
const BASE = `http://127.0.0.1:${PORT}`;

let journal = '';

const api = spawn(
  process.execPath,
  [join(RACINE, 'node_modules', '.bin', 'tsx'), join(RACINE, 'src', 'server.ts')],
  {
    cwd: RACINE,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

api.stdout.on('data', (bloc) => (journal += bloc));
api.stderr.on('data', (bloc) => (journal += bloc));

const limite = Date.now() + 40000;
let prete = false;

while (Date.now() < limite && !prete) {
  try {
    prete = (await fetch(`${BASE}/health`)).ok;
  } catch {
    // Pas encore prête.
  }

  if (!prete) await new Promise((r) => setTimeout(r, 500));
}

if (!prete) {
  api.kill();
  console.error(`API de test injoignable sur le port ${PORT}`);
  process.exit(1);
}

/** Ce que le journal a retenu depuis le dernier relevé. */
const depuis = () => {
  const vu = journal;
  journal = '';
  return vu;
};

const appeler = (chemin, options = {}) =>
  fetch(BASE + chemin, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
    },
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
  });

// Laisser retomber les lignes du démarrage.
await new Promise((r) => setTimeout(r, 1500));
depuis();

// ===== Un refus attendu =====

titre('Une session à refaire ne crie pas');
/**
 * C'est le cas qui a motivé ce contrôle : une base remise à zéro laisse un
 * navigateur porteur d'un jeton signé pour un compte disparu. Le serveur répond
 * 401 — c'est le comportement voulu, pas une panne.
 */
const jetonMort =
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJ1c2VySWQiOiJpbmV4aXN0YW50IiwiaWF0IjoxfQ.signature-invalide';

const refus = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: jetonMort } });
check('la route répond bien 401', refus.status === 401, `statut ${refus.status}`);

await new Promise((r) => setTimeout(r, 400));
const ligneDuRefus = depuis();

check('le journal ne parle pas d’erreur', !/ERROR/.test(ligneDuRefus), ligneDuRefus.slice(0, 300));
check('il avertit', /WARN/.test(ligneDuRefus), ligneDuRefus.slice(0, 300));
check('il dit la requête refusée', /refus/i.test(ligneDuRefus), ligneDuRefus.slice(0, 300));
// Une pile d'appels ne dit rien d'utile sur une saisie refusée : elle pointe
// la ligne qui a refusé, qu'on connaît déjà par le message.
check('sans pile d’appels', !/"stack"/.test(ligneDuRefus), ligneDuRefus.slice(0, 400));

titre('Une saisie invalide non plus');
const inscription = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: 'pas-un-email', password: 'x', name: 'A' },
});
check('la route répond 400', inscription.status === 400, `statut ${inscription.status}`);

await new Promise((r) => setTimeout(r, 400));
const ligneDeLaSaisie = depuis();
check('le journal avertit sans crier', !/ERROR/.test(ligneDeLaSaisie), ligneDeLaSaisie.slice(0, 300));

titre('Une page inconnue non plus');
const inconnue = await appeler('/api/stores/ceci-nexiste-pas-du-tout');
check('la route répond 404', inconnue.status === 404, `statut ${inconnue.status}`);

await new Promise((r) => setTimeout(r, 400));
check('et le journal reste calme', !/ERROR/.test(depuis()), 'erreur journalisée à tort');

// ===== Ce qui reste une erreur =====

titre('Le refus est tout de même rendu à l’appelant');
// Baisser le ton dans le journal ne doit pas rendre le refus muet côté client.
const lu = await refus.json().catch(() => null);
check('le message est là', !!lu?.error, JSON.stringify(lu));
check('et son code aussi', !!lu?.code, JSON.stringify(lu));

titre('Une vraie panne garde sa pile');
/**
 * Le tri se fait sur le code : une exception non typée reste `ERROR` avec sa
 * pile. Sans cela, on aurait échangé un journal bruyant contre un journal
 * aveugle.
 *
 * Un corps JSON tronqué fait échouer l'analyse avant toute route : c'est la
 * façon la plus sûre de provoquer une exception qui n'est ni une validation,
 * ni un refus.
 */
const panne = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{"email": "tronque",',
});

await new Promise((r) => setTimeout(r, 400));
const lignePanne = depuis();

check('le journal crie', /ERROR/.test(lignePanne), lignePanne.slice(0, 300));
check('et garde la pile', /"stack"|\bat /.test(lignePanne), lignePanne.slice(0, 400));
check('la requête est refusée', panne.status >= 400, `statut ${panne.status}`);

api.kill();
await terminer();
