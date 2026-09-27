// La règle du mot de passe, à chaque porte où l'on en choisit un : 8 caractères
// minimum, dont un chiffre, une minuscule et une majuscule ; les caractères
// spéciaux permis sans être exigés. Chaque refus est relu en base (aucun compte
// créé, aucun mot de passe changé).
//
// La connexion, elle, n'applique pas la règle : un compte créé avant elle,
// avec un mot de passe qui ne la respecte pas, doit toujours pouvoir entrer.

import { createHash } from 'crypto';
import { titre, check, j, uniq, post, sqlScalaire, sqlExec, terminer } from './outils.mjs';

// Chaque mot de passe refusé, avec ce que le message doit dire.
const REFUSES = [
  ['Mot1pas', /8 caractères/],
  ['Motdepasse', /chiffre/],
  ['motdepasse1', /majuscule/],
  ['MOTDEPASSE1', /minuscule/],
  ['12345678', /minuscule/],
];
const SANS_SPECIAL = 'Motdepasse1';
const AVEC_SPECIAL = 'Motdepasse1!';

const comptes = (email) => sqlScalaire(`SELECT COUNT(*) FROM "User" WHERE email = '${email}'`);

// Le premier compte devient la plateforme : il est créé à part.
await post('/api/auth/signup', {
  conditionsAcceptees: true,
  email: `plateforme-${uniq}@test.fr`,
  password: 'Password123!',
  name: 'Plateforme',
});

async function porte(nom, envoyer) {
  titre(nom);
  let n = 0;
  for (const [motDePasse, attendu] of REFUSES) {
    const email = `refus-${++n}-${nom.length}-${uniq}@test.fr`;
    const reponse = await envoyer(email, motDePasse);
    const corps = await j(reponse);
    check(
      `« ${motDePasse} » refusé en 400`,
      reponse.status === 400,
      `status=${reponse.status} ${JSON.stringify(corps)?.slice(0, 120)}`
    );
    check(`… en disant ce qui manque`, /mot de passe/i.test(corps?.error || '') && attendu.test(corps?.error || ''), corps?.error);
    check(`… sans créer de compte`, (await comptes(email)) === '0');
  }

  for (const motDePasse of [SANS_SPECIAL, AVEC_SPECIAL]) {
    const email = `ok-${motDePasse.length}-${nom.length}-${uniq}@test.fr`;
    const reponse = await envoyer(email, motDePasse);
    check(
      `« ${motDePasse} » accepté`,
      reponse.status === 201,
      `status=${reponse.status} ${JSON.stringify(await j(reponse))?.slice(0, 120)}`
    );
    check(`… et le compte se connecte`, (await post('/api/auth/login', { email, password: motDePasse })).status === 200);
  }
}

await porte('Inscription client', (email, password) =>
  post('/api/auth/signup', { conditionsAcceptees: true, email, password, name: 'Client Test' })
);

await porte('Inscription livreur', (email, password) =>
  post('/api/drivers/register', {
    conditionsAcceptees: true,
    name: 'Livreur Test',
    email,
    password,
    phone: '0470123456',
    vehicleType: 'bike',
  })
);

let boutique = 0;
await porte('Inscription commerçant', (email, password) =>
  post('/api/auth/merchant-register', {
    conditionsAcceptees: true,
    businessName: 'Commerce Test',
    email,
    password,
    businessType: 'restaurant',
    phone: '0470123456',
    address: '1 rue de Test',
    city: 'Namur',
    postalCode: '5000',
    description: 'Un commerce de test',
    storeName: 'Boutique Test',
    storeSlug: `mdp-${uniq}-${++boutique}`,
  })
);

// ===== Réinitialisation =====

titre('Nouveau mot de passe par le lien reçu');
const emailReinit = `reinit-${uniq}@test.fr`;
await post('/api/auth/signup', { conditionsAcceptees: true, email: emailReinit, password: 'Password123!', name: 'Reinit Test' });
const empreinteAvant = await sqlScalaire(`SELECT "passwordHash" FROM "User" WHERE email = '${emailReinit}'`);

// Le jeton est posé en base comme le ferait /forgot-password : on n'en garde
// que l'empreinte.
const jeton = createHash('sha256').update(`jeton-${uniq}`).digest('hex');
await sqlExec(
  `UPDATE "User" SET "resetTokenHash" = '${createHash('sha256').update(jeton).digest('hex')}', "resetTokenExpiresAt" = NOW() + INTERVAL '1 hour' WHERE email = '${emailReinit}'`
);

for (const [motDePasse, attendu] of REFUSES) {
  const reponse = await post('/api/auth/reset-password', { jeton, password: motDePasse });
  const corps = await j(reponse);
  check(`« ${motDePasse} » refusé en 400`, reponse.status === 400, `status=${reponse.status}`);
  check(`… en disant ce qui manque`, attendu.test(corps?.error || ''), corps?.error);
}
check(
  'le mot de passe n’a pas changé',
  (await sqlScalaire(`SELECT "passwordHash" FROM "User" WHERE email = '${emailReinit}'`)) === empreinteAvant
);

const reinit = await post('/api/auth/reset-password', { jeton, password: SANS_SPECIAL });
check('un mot de passe conforme est accepté', reinit.status === 200, `status=${reinit.status}`);
check('… et ouvre le compte', (await post('/api/auth/login', { email: emailReinit, password: SANS_SPECIAL })).status === 200);

// ===== Les anciens comptes =====

titre('Un compte d’avant la règle se connecte toujours');
const ancien = `ancien-${uniq}@test.fr`;
await sqlExec(
  `INSERT INTO "User" (id, email, name, "passwordHash", status, "createdAt", "updatedAt") VALUES ('u-mdp-${uniq}', '${ancien}', 'Ancien Compte', crypt('abcdef', gen_salt('bf', 10)), 'ACTIVE', NOW(), NOW())`
);
// Sans fiche client, la connexion refuse le compte faute d'espace : ce n'est
// pas le mot de passe qu'on vérifierait.
await sqlExec(
  `INSERT INTO "Customer" (id, "userId", name, email, "createdAt", "updatedAt") VALUES ('c-mdp-${uniq}', 'u-mdp-${uniq}', 'Ancien Compte', '${ancien}', NOW(), NOW())`
);
check('connexion avec « abcdef »', (await post('/api/auth/login', { email: ancien, password: 'abcdef' })).status === 200);

await terminer();
