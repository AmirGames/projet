// Connexion et inscription limitées : de quoi se tromper de mot de passe,
// pas de quoi en essayer des milliers.

import { titre, check, j, uniq, post, terminer } from './outils.mjs';

const MDP = 'Password123!';
const cible = `cible-${uniq}@t.fr`;
const voisin = `voisin-${uniq}@t.fr`;

for (const email of [cible, voisin]) {
  await post('/api/auth/signup', { conditionsAcceptees: true, email, password: MDP, name: `L ${uniq}` });
}

// ===== Connexion =====

titre('Connexion : dix essais par quart d\'heure');
const statuts = [];
for (let essai = 0; essai < 10; essai++) {
  statuts.push((await post('/api/auth/login', { email: cible, password: 'PasLeBon' })).status);
}
check('les dix premiers essais sont examinés', statuts.every((s) => s === 401), statuts.join(','));

const onzieme = await post('/api/auth/login', { email: cible, password: 'PasLeBon' });
const corps = await j(onzieme);
check('le onzième est refusé sans être examiné', onzieme.status === 429, `statut=${onzieme.status}`);
check(
  'le refus dit quoi faire, pas seulement « erreur »',
  /trop de tentatives/i.test(corps?.error || ''),
  JSON.stringify(corps)
);

// Sinon la limite ne servirait à rien : l'attaquant finirait par tomber
// juste pendant le blocage et la réponse le lui dirait.
const bonMotDePasse = await post('/api/auth/login', { email: cible, password: MDP });
check(
  'même le bon mot de passe attend la fin du blocage',
  bonMotDePasse.status === 429,
  `statut=${bonMotDePasse.status}`
);

const autreCompte = await post('/api/auth/login', { email: voisin, password: MDP });
check(
  'un autre compte, depuis la même adresse IP, se connecte normalement',
  autreCompte.status === 200 && !!(await j(autreCompte))?.accessToken,
  `statut=${autreCompte.status}`
);

// ===== Inscription =====

// Hors production, la limite d'inscription est éteinte : sans ça, les
// vérifications — qui créent des centaines de comptes depuis la même
// machine — échoueraient toutes.
titre('Inscription hors production');
const inscriptions = [];
for (let n = 0; n < 12; n++) {
  const reponse = await post('/api/auth/signup', { conditionsAcceptees: true,
    email: `serie-${n}-${uniq}@t.fr`,
    password: MDP,
    name: `S ${n}`,
  });
  inscriptions.push(reponse.status);
}
check(
  'douze inscriptions de suite passent hors production',
  inscriptions.every((s) => s === 201 || s === 200),
  inscriptions.join(',')
);

await terminer();
