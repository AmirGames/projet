// Vérifie la création d'admin et l'interdiction des mots de passe en clair.

import { inscription, check, j, uniq, post, sqlScalaire, sqlExec, terminer } from './outils.mjs';

const sup = await j(await inscription({ email: `s-${uniq}@t.fr`, password: 'Password123!', name: `S ${uniq}` }));
const S = sup.accessToken;

console.log('[Création d\'un administrateur]');
const email = `admin-${uniq}@t.fr`;
const creation = await post('/api/super-admin/admins', { email, name: 'Admin Test', password: 'MotDePasse123!' }, S);
check('admin créé', creation.status < 300, `status=${creation.status} ${JSON.stringify(await j(creation))?.slice(0, 150)}`);

const enBase = await sqlScalaire(`SELECT "passwordHash" FROM "User" WHERE email = '${email}'`);
check('mot de passe haché en base (en clair auparavant)', enBase.startsWith('$2'), enBase.slice(0, 20));
check('le mot de passe n\'apparaît pas en base', !enBase.includes('MotDePasse123'), enBase.slice(0, 20));

const connexion = await post('/api/auth/login', { email, password: 'MotDePasse123!' });
check('cet admin peut se connecter (impossible auparavant)', connexion.status === 200, `status=${connexion.status} ${JSON.stringify(await j(connexion))?.slice(0, 120)}`);

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
