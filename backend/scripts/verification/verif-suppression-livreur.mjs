// Un livreur peut créer son compte dans l'application : il doit aussi pouvoir
// l'y supprimer (exigence des stores). La demande désactive le compte tout de
// suite et arrive au support de la plateforme.

import { inscrirePlateforme, titre, check, j, uniq, post, get, patch, sqlScalaire, terminer, validerLivreur } from './outils.mjs';

const plateforme = await inscrirePlateforme();
const S = plateforme.accessToken;

titre('Inscription depuis l’application');
const inscription = await post('/api/drivers/register', {
  conditionsAcceptees: true,
  name: `Lina ${uniq}`,
  email: `lina-${uniq}@t.fr`,
  password: 'Password123!',
  phone: '+33612345678',
  vehicleType: 'bike',
});
const compte = await j(inscription);
check('le compte est créé', inscription.status === 201 && !!compte?.accessToken, `statut ${inscription.status}`);
const D = compte.accessToken;
const sansConditions = await post('/api/drivers/register', {
  name: `Sans ${uniq}`,
  email: `sans-${uniq}@t.fr`,
  password: 'Password123!',
  phone: '+33612345678',
  vehicleType: 'bike',
});
check('sans accepter les conditions, refusé', sansConditions.status === 400, `statut ${sansConditions.status}`);

await validerLivreur(D, S);
await patch('/api/drivers/availability', { isOnline: true }, D);
await post('/api/push-devices', { token: `ExponentPushToken[${uniq}]`, platform: 'android', app: 'delivery' }, D);

titre('La demande de suppression');
const refusSansJeton = await post('/api/drivers/me/suppression', {});
check('il faut être connecté', refusSansJeton.status === 401, `statut ${refusSansJeton.status}`);

const demande = await post('/api/drivers/me/suppression', { motif: 'J’arrête la livraison' }, D);
const reponse = await j(demande);
check('la demande passe', demande.status === 200 && reponse?.success === true, JSON.stringify(reponse));
check('le délai est annoncé', /30 jours/.test(reponse?.message || ''), reponse?.message);

const email = `lina-${uniq}@t.fr`;
check('le compte est désactivé', (await sqlScalaire(`SELECT status FROM "Driver" WHERE email = '${email}'`)) === 'INACTIVE');
check('il passe hors ligne', (await sqlScalaire(`SELECT "isOnline" FROM "Driver" WHERE email = '${email}'`)) === 'false');
const appareils = await sqlScalaire(
  `SELECT count(*) FROM "PushDevice" p JOIN "User" u ON u.id = p."userId" WHERE u.email = '${email}'`
);
check('plus aucune notification vers son téléphone', appareils === '0', appareils);
const message = await sqlScalaire(
  `SELECT body FROM "DriverSupportMessage" m JOIN "Driver" d ON d.id = m."driverId" WHERE d.email = '${email}' ORDER BY m."createdAt" DESC LIMIT 1`
);
check('la plateforme reçoit la demande', /suppression/.test(message) && /J’arrête la livraison/.test(message), message);

const enLigne = await patch('/api/drivers/availability', { isOnline: true }, D);
check('il ne peut plus passer en ligne', enLigne.status !== 200, `statut ${enLigne.status}`);
const moi = (await j(await get('/api/drivers/me', D)))?.data;
check('son écran le lui dit', moi?.status === 'INACTIVE' && /Suppression du compte demandée/.test(moi?.statusReason || ''), JSON.stringify(moi?.statusReason));

await terminer();
