// Vérifie la création d'admin et la réparation des mots de passe en clair.

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

console.log('\n[Réparation d\'un compte existant en clair]');
// On simule un compte créé avant la correction.
const ancien = `ancien-${uniq}@t.fr`;
await sqlExec(`INSERT INTO "User" (id, email, name, "passwordHash", "isSystemAdmin", status, "createdAt", "updatedAt") VALUES ('u-${uniq}', '${ancien}', 'Ancien Admin', 'MonMotDePasse', true, 'ACTIVE', NOW(), NOW())`);
check('compte en clair présent', await sqlScalaire(`SELECT "passwordHash" FROM "User" WHERE email='${ancien}'`) === 'MonMotDePasse');

const mauvais = await post('/api/auth/login', { email: ancien, password: 'PasLeBon' });
check('un mauvais mot de passe reste refusé', mauvais.status === 401, `status=${mauvais.status}`);

const reparation = await post('/api/auth/login', { email: ancien, password: 'MonMotDePasse' });
check('connexion réussie', reparation.status === 200, `status=${reparation.status} ${JSON.stringify(await j(reparation))?.slice(0, 120)}`);

const apres = await sqlScalaire(`SELECT "passwordHash" FROM "User" WHERE email='${ancien}'`);
check('mot de passe converti en empreinte', apres.startsWith('$2'), apres.slice(0, 20));
check('le clair a disparu de la base', apres !== 'MonMotDePasse');

const seconde = await post('/api/auth/login', { email: ancien, password: 'MonMotDePasse' });
check('la connexion fonctionne toujours après conversion', seconde.status === 200, `status=${seconde.status}`);

const apresConversion = await post('/api/auth/login', { email: ancien, password: 'MonMotDePasse2' });
check('un mauvais mot de passe reste refusé après conversion', apresConversion.status === 401, `status=${apresConversion.status}`);

const evenement = await sqlScalaire(`SELECT action FROM "SecurityEvent" WHERE actor='${ancien}' AND action='PASSWORD_REHASHED'`);
check('conversion tracée dans le journal de sécurité', evenement === 'PASSWORD_REHASHED', evenement);

await terminer();
