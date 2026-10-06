// Vérifie l'entrée d'un membre dans l'équipe et l'interdiction des mots de passe en clair.

import { inscription, check, j, uniq, post, sqlScalaire, sqlExec, terminer } from './outils.mjs';

const sup = await j(await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const S = sup.accessToken;

console.log('[Entrée d\'un membre dans l\'équipe]');
// Un membre de l'équipe n'est plus créé par la plateforme avec un mot de passe
// choisi pour lui : il crée son compte, et le superowner le fait entrer dans
// l'équipe (POST /api/superowner/admins, qui a remplacé /api/super-admin/admins).
const email = `admin-${uniq}@t.fr`;
const compte = await post('/api/auth/signup', { conditionsAcceptees: true, email, name: 'Admin Test', password: 'MotDePasse123!' });
check('compte du futur membre créé', compte.status === 201, `status=${compte.status}`);

const nonConfirme = await post('/api/superowner/admins', { email, role: 'ADMIN', plateforme: 'EAT' }, S);
check('adresse non confirmée : promotion refusée', nonConfirme.status === 403, `status=${nonConfirme.status}`);
check('aucun droit attribué avant confirmation', (await sqlScalaire(`SELECT "isSystemAdmin"::text FROM "User" WHERE email = '${email}'`)) === 'false');
// Fixture de la base dédiée : simule une confirmation, pas une exemption du contrôle.
await sqlExec(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`);

const creation = await post('/api/superowner/admins', { email, role: 'ADMIN', plateforme: 'EAT' }, S);
check('entré dans l\'équipe', creation.status === 201, `status=${creation.status} ${JSON.stringify(await j(creation))?.slice(0, 150)}`);
check('admin système en base', (await sqlScalaire(`SELECT "isSystemAdmin"::text FROM "User" WHERE email = '${email}'`)) === 'true');
check(
  'rôle Administrateur sur ZupEat',
  (await sqlScalaire(`SELECT a.role FROM "AccesEquipe" a JOIN "User" u ON u.id = a."userId" WHERE u.email = '${email}' AND a.plateforme = 'EAT'`)) === 'ADMIN'
);

const enBase = await sqlScalaire(`SELECT "passwordHash" FROM "User" WHERE email = '${email}'`);
check('mot de passe haché en base', enBase.startsWith('$2'), enBase.slice(0, 20));
check('le mot de passe n\'apparaît pas en base', !enBase.includes('MotDePasse123'), enBase.slice(0, 20));

const connexion = await post('/api/auth/login', { email, password: 'MotDePasse123!' });
check('ce membre peut se connecter', connexion.status === 200, `status=${connexion.status} ${JSON.stringify(await j(connexion))?.slice(0, 120)}`);

console.log('\n[Aucun mot de passe en clair]');
// La base refuse toute valeur qui n'est pas une empreinte bcrypt.
const ancien = `ancien-${uniq}@t.fr`;
let refus = '';
try {
  await sqlExec(`INSERT INTO "User" (id, email, name, "passwordHash", "isSystemAdmin", status, "createdAt", "updatedAt") VALUES ('u-${uniq}', '${ancien}', 'Ancien Admin', 'MonMotDePasse', true, 'ACTIVE', NOW(), NOW())`);
} catch (err) {
  refus = String(err?.message ?? err);
}
check('la base refuse un mot de passe en clair', refus.includes('User_passwordHash_bcrypt'), refus.slice(0, 150) || 'insertion acceptée');
check('aucun compte en clair en base', await sqlScalaire(`SELECT COUNT(*) FROM "User" WHERE "passwordHash" NOT LIKE '$2%'`) === '0');

// Un compte converti par la migration (empreinte $2a$ de pgcrypto) se connecte.
await sqlExec(`INSERT INTO "User" (id, email, name, "passwordHash", "isSystemAdmin", status, "createdAt", "updatedAt") VALUES ('u-${uniq}', '${ancien}', 'Ancien Admin', crypt('MonMotDePasse', gen_salt('bf', 10)), true, 'ACTIVE', NOW(), NOW())`);

const converti = await post('/api/auth/login', { email: ancien, password: 'MonMotDePasse' });
check('un compte converti par la migration se connecte', converti.status === 200, `status=${converti.status} ${JSON.stringify(await j(converti))?.slice(0, 120)}`);

const mauvais = await post('/api/auth/login', { email: ancien, password: 'PasLeBon' });
check('un mauvais mot de passe reste refusé', mauvais.status === 401, `status=${mauvais.status}`);

// Le contenu de la colonne n'est jamais un mot de passe : le saisir tel quel échoue.
const empreinte = await sqlScalaire(`SELECT "passwordHash" FROM "User" WHERE email='${ancien}'`);
const parEmpreinte = await post('/api/auth/login', { email: ancien, password: empreinte });
check('l\'empreinte elle-même n\'ouvre pas le compte', parEmpreinte.status === 401, `status=${parEmpreinte.status}`);

await terminer();
