// Une session dont le compte a disparu, et les messages de refus lisibles.

import { inscription, titre, check, j, uniq, post, get, terminer, sqlExec } from './outils.mjs';

const MDP = 'Password123!';

await inscription({ email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` });

// ===== Le refus dit pourquoi =====

titre('Un refus de validation dit ce qui ne va pas');
const bancal = await inscription({ email: 'pas-une-adresse', password: '123' });
const refus = await j(bancal);

check('le refus est un 400', bancal.status === 400, `statut ${bancal.status}`);
check(
  'ce n’est plus « Validation error »',
  refus?.error !== 'Validation error',
  refus?.error
);
check('l’adresse est mise en cause', /[Ee]mail invalide/.test(refus?.error || ''), refus?.error);
check(
  'le mot de passe aussi, et il est nommé',
  /[Mm]ot de passe.*6 caractères/.test(refus?.error || ''),
  refus?.error
);
check('le détail par champ reste disponible', refus?.details?.fieldErrors !== undefined, JSON.stringify(refus?.details));

titre('Un seul reproche ne fait qu’une phrase');
const sansNom = await j(await inscription({ email: `x-${uniq}@t.fr`, password: MDP, name: 'a' }));
check(
  'le champ fautif est nommé',
  /Nom\s*:\s*Minimum 2 caractères/.test(sansNom?.error || ''),
  sansNom?.error
);
check('sans tiret de séparation', !/ — /.test(sansNom?.error || ''), sansNom?.error);

// ===== Une session dont le compte n'existe plus =====

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;
const R = commercant.refreshToken;

titre('Tant que le compte existe');
check('il lit son profil', (await get('/api/auth/me', T)).status === 200, 'refusé à tort');

titre('Le renouvellement rend aussi le compte');
// La route ne rendait que le jeton : l'écran se croyait déconnecté juste après
// un renouvellement réussi.
const renouvele = await j(await post('/api/auth/refresh', { refreshToken: R }));
check('un nouveau jeton est délivré', typeof renouvele?.accessToken === 'string', JSON.stringify(renouvele)?.slice(0, 120));
check('le compte accompagne le jeton', renouvele?.user?.email === `m-${uniq}@t.fr`, JSON.stringify(renouvele?.user));
check('son organisation aussi', typeof renouvele?.organization?.id === 'string', JSON.stringify(renouvele?.organization));

/**
 * Un compte qui disparaît sous les pieds du navigateur : base remise à zéro,
 * utilisateur supprimé. Le jeton, lui, reste signé et valable.
 *
 * Ce compte-ci n'est jamais lu avant sa suppression : le souvenir de trente
 * secondes que garde le serveur n'a donc rien à rendre, et le refus est
 * immédiat — inutile d'attendre dans une vérification.
 */
titre('Quand le compte disparaît');
const condamne = await j(
  await inscription({ email: `d-${uniq}@t.fr`, password: MDP, name: `D ${uniq}` })
);
const TD = condamne.accessToken;
const RD = condamne.refreshToken;

await sqlExec(`DELETE FROM "Membership" WHERE "userId" = '${condamne.user.id}'`);
await sqlExec(`DELETE FROM "Organization" WHERE id = '${condamne.organization.id}'`);
await sqlExec(`DELETE FROM "User" WHERE id = '${condamne.user.id}'`);

const profil = await get('/api/auth/me', TD);
check('le profil répond 401, et non 404', profil.status === 401, `statut ${profil.status}`);

const corpsProfil = await j(profil);
check('avec un code lisible', corpsProfil?.code === 'SESSION_INVALIDE', corpsProfil?.code);
check(
  'et une phrase qui dit quoi faire',
  /[Rr]econnectez-vous/.test(corpsProfil?.error || ''),
  corpsProfil?.error
);

const renouvellement = await post('/api/auth/refresh', { refreshToken: RD });
check('le renouvellement aussi répond 401', renouvellement.status === 401, `statut ${renouvellement.status}`);
check(
  'avec le même code',
  (await j(renouvellement))?.code === 'SESSION_INVALIDE',
  'code inattendu'
);

titre('Et l’administration ne parle plus d’accès refusé');
// Un « Accès refusé » en 403 laissait croire à une permission manquante, là où
// le compte n'existait simplement plus.
const config = await get('/api/admin/config', TD);
check('elle répond 401', config.status === 401, `statut ${config.status}`);
check(
  'et non 403 « Accès refusé »',
  (await j(config))?.error !== 'Accès refusé',
  'message trompeur'
);

titre('Un compte bien vivant garde ses droits');
const plateforme = await j(await post('/api/auth/login', { email: `p-${uniq}@t.fr`, password: MDP }));
check(
  'la plateforme lit sa configuration',
  (await get('/api/admin/config', plateforme.accessToken)).status === 200,
  'bloquée à tort'
);
check(
  'et son profil',
  (await get('/api/auth/me', plateforme.accessToken)).status === 200,
  'bloqué à tort'
);

await terminer();
