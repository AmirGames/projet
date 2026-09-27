// Une adresse déjà prise, à chaque porte d'inscription : jamais de 500, jamais
// de compte en double ni orphelin. Chaque contrôle relit la base.
//
// Le refus simple de /auth/signup est vérifié dans verif-compte-email ; ici,
// les cas qui passent le premier contrôle et butaient ensuite sur une autre
// contrainte d'unicité.

import { titre, check, j, uniq, post, sqlScalaire, sqlExec, terminer } from './outils.mjs';

const MOT_DE_PASSE = 'Password123!';

const inscrire = (email, name = 'Doublon Test') =>
  post('/api/auth/signup', { conditionsAcceptees: true, email, password: MOT_DE_PASSE, name });

const comptes = (email) => sqlScalaire(`SELECT COUNT(*) FROM "User" WHERE email = '${email}'`);
const fiches = (email) => sqlScalaire(`SELECT COUNT(*) FROM "Customer" WHERE email = '${email}'`);

// Le premier compte devient la plateforme : il est créé à part.
await inscrire(`plateforme-${uniq}@test.fr`, 'Plateforme');

titre('Inscription après une commande passée sans compte');
// La commande sans compte a créé une fiche client à cette adresse, unique elle
// aussi : l'inscription la recréait, échouait, et laissait un compte sans fiche.
const emailInvite = `invite-${uniq}@test.fr`;
await sqlExec(
  `INSERT INTO "Customer" (id, name, email, "createdAt", "updatedAt") VALUES ('invite-${uniq}', 'Invité', '${emailInvite}', NOW(), NOW())`
);
const apresCommande = await inscrire(emailInvite, 'Invité Inscrit');
const apresCommandeData = await j(apresCommande);
check('l inscription passe', apresCommande.status === 201, `status=${apresCommande.status} ${JSON.stringify(apresCommandeData)}`);
check('la fiche existante est reprise', apresCommandeData?.customer?.id === `invite-${uniq}`, JSON.stringify(apresCommandeData?.customer));
check('toujours une seule fiche', (await fiches(emailInvite)) === '1', `fiches=${await fiches(emailInvite)}`);
check(
  'rattachée au nouveau compte',
  (await sqlScalaire(`SELECT "userId" FROM "Customer" WHERE email = '${emailInvite}'`)) === apresCommandeData?.user?.id,
  await sqlScalaire(`SELECT "userId" FROM "Customer" WHERE email = '${emailInvite}'`)
);

titre('Inscriptions simultanées sur la même adresse');
// Toutes passent le contrôle d'existence avant qu'aucune n'écrive : c'est la
// contrainte de la base qui tranche, et le gestionnaire d'erreurs qui la traduit.
const emailCourse = `course-${uniq}@test.fr`;
const reponses = await Promise.all(Array.from({ length: 5 }, () => inscrire(emailCourse)));
const statuts = reponses.map((r) => r.status);
check('une seule inscription aboutit', statuts.filter((s) => s === 201).length === 1, `statuts=${statuts}`);
check('les autres sont refusées en 409, aucune en 500', statuts.filter((s) => s !== 201).every((s) => s === 409), `statuts=${statuts}`);
check('un seul compte en base', (await comptes(emailCourse)) === '1', `comptes=${await comptes(emailCourse)}`);
check('une seule fiche client', (await fiches(emailCourse)) === '1', `fiches=${await fiches(emailCourse)}`);

titre('Les autres portes d inscription');
const email = `doublon-${uniq}@test.fr`;
await inscrire(email);

const livreur = await post('/api/drivers/register', {
  conditionsAcceptees: true, name: 'Livreur', email, password: MOT_DE_PASSE, phone: '0611111111', vehicleType: 'bike',
});
const livreurData = await j(livreur);
check('inscription livreur refusée', livreur.status === 409 && livreurData?.code === 'EMAIL_EXISTS', `status=${livreur.status} ${JSON.stringify(livreurData)}`);
check('aucune fiche livreur écrite', (await sqlScalaire(`SELECT COUNT(*) FROM "Driver" WHERE email = '${email}'`)) === '0');

const commercant = await post('/api/auth/merchant-register', {
  conditionsAcceptees: true, businessName: 'Doublon SARL', email, password: MOT_DE_PASSE,
  businessType: 'restaurant', phone: '0400000000', address: '1 rue', city: 'Lyon', postalCode: '69001',
  description: 'Un commerce', storeName: 'Doublon', storeSlug: `doublon-${uniq}`,
});
const commercantData = await j(commercant);
check('inscription commerçant refusée', commercant.status === 400 && commercantData?.code === 'EMAIL_EXISTS', `status=${commercant.status} ${JSON.stringify(commercantData)}`);
check('aucun compte en plus', (await comptes(email)) === '1', `comptes=${await comptes(email)}`);

titre('Devenir livreur sur une adresse déjà portée par une fiche livreur');
// Un livreur change l'adresse de son compte : sa fiche garde l'ancienne. Un
// nouveau compte sur cette ancienne adresse butait sur Driver.email.
const ancienne = `ancien-${uniq}@test.fr`;
const ancienLivreur = await j(await post('/api/drivers/register', {
  conditionsAcceptees: true, name: 'Ancien', email: ancienne, password: MOT_DE_PASSE, phone: '0622222222', vehicleType: 'car',
}));
check('le premier livreur est inscrit', !!ancienLivreur?.driver?.id, JSON.stringify(ancienLivreur));
await sqlExec(`UPDATE "User" SET email = 'nouvelle-${uniq}@test.fr' WHERE email = '${ancienne}'`);

const repreneur = await j(await inscrire(ancienne, 'Repreneur'));
const devenir = await post('/api/auth/me/become-driver', { phone: '0633333333', vehicleType: 'bike' }, repreneur?.accessToken);
const devenirData = await j(devenir);
check('refusé en 409', devenir.status === 409, `status=${devenir.status} ${JSON.stringify(devenirData)}`);
check('avec le code EMAIL_EXISTS', devenirData?.code === 'EMAIL_EXISTS', JSON.stringify(devenirData));
check(
  'aucune fiche livreur pour le repreneur',
  (await sqlScalaire(`SELECT COUNT(*) FROM "Driver" WHERE "userId" = '${repreneur?.user?.id}'`)) === '0'
);

await terminer();
