// Un livreur peut créer son compte dans l'application : il doit aussi pouvoir
// l'y supprimer (exigence des stores). La demande désactive le compte tout de
// suite et arrive au support de la plateforme.

import {
  inscrirePlateforme,
  inscription as inscrireCommercant,
  titre,
  check,
  j,
  uniq,
  post,
  put,
  get,
  patch,
  sqlScalaire,
  terminer,
  validerLivreur,
  codeDeRemise,
  declarerPrete,
} from './outils.mjs';

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

// ===== Supprimer son compte ne fait pas perdre la semaine =====
// Un livreur livre dans la semaine, puis supprime son compte le samedi : ses
// courses doivent partir avec l'arrêté du lundi suivant.

titre('Des courses livrées cette semaine, puis la suppression');
const COMMERCE = { latitude: 47.2184, longitude: -1.5536 }; // Nantes : loin des autres suites
const commercant = await j(
  await inscrireCommercant({ email: `m-sup-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;
const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Crêperie ${uniq}`,
      slug: `creperie-${uniq}`,
      address: '1 place Royale',
      city: 'Nantes',
      postalCode: '44000',
      phone: '0200000000',
      latitude: COMMERCE.latitude,
      longitude: COMMERCE.longitude,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;
const produit = await j(await post('/api/products', { storeId, name: 'Galette', price: 12, status: 'ACTIVE' }, T));
const productId = produit.product?.id || produit.id;

const noa = await j(
  await post('/api/drivers/register', {
    conditionsAcceptees: true,
    name: `Noa ${uniq}`,
    email: `noa-${uniq}@t.fr`,
    password: 'Password123!',
    phone: '+33612345679',
    vehicleType: 'bike',
  })
);
const N = noa.accessToken;
const emailNoa = `noa-${uniq}@t.fr`;
await validerLivreur(N, S);
await patch('/api/drivers/availability', { isOnline: true }, N);
await patch('/api/drivers/location', COMMERCE, N);

const commande = await j(
  await post('/api/orders', {
    conditionsAcceptees: true,
    storeId,
    customerName: 'Client Nantes',
    customerEmail: `cn-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '3 rue Crébillon',
    deliveryCity: 'Nantes',
    deliveryPostal: '44000',
    deliveryLat: 47.2139,
    deliveryLng: -1.5601,
    totalAmount: 12,
    feesAmount: 4,
    items: [{ productId, quantity: 1, price: 12 }],
  })
);
const orderId = commande.order?.id || commande.id;
const course = (await j(await post(`/api/orders/${orderId}/dispatch`, {}, T)))?.data?.deliveryId;
const offre = ((await j(await get('/api/drivers/offers', N)))?.data || [])[0];
await post(`/api/drivers/offers/${offre?.id}/accept`, null, N);
await declarerPrete(storeId, orderId, T);
await patch(`/api/drivers/deliveries/${course}`, { status: 'PICKED_UP' }, N);
const livree = await patch(`/api/drivers/deliveries/${course}`, { status: 'DELIVERED', code: await codeDeRemise(course) }, N);
check('la course est livrée', livree.status === 200, `statut ${livree.status}`);
const gain = Number(await sqlScalaire(`SELECT "driverPayout" FROM "OrderDelivery" WHERE id = '${course}'`));

const apercu = (await j(await get('/api/drivers/me/suppression', N)))?.data;
check('l’aperçu donne ce qui reste dû', Math.abs((apercu?.montantDu ?? 0) - gain) < 0.01, JSON.stringify(apercu));
const lundi = apercu?.versementLe ? new Date(apercu.versementLe) : null;
const jourBruxelles = lundi?.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Europe/Brussels' });
const heureBruxelles = lundi?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });
check('et le lundi qui vient, 00 h 00 à Bruxelles', jourBruxelles === 'Monday' && heureBruxelles === '00:00' && lundi > new Date(),
  `${apercu?.versementLe} (${jourBruxelles} ${heureBruxelles})`);

titre('Sans IBAN, la suppression attend');
const sansIban = await post('/api/drivers/me/suppression', {}, N);
const refus = await j(sansIban);
check('elle est refusée', sansIban.status === 409 && refus?.code === 'IBAN_REQUIRED', `statut ${sansIban.status}`);
check('le compte reste actif', (await sqlScalaire(`SELECT status FROM "Driver" WHERE email = '${emailNoa}'`)) === 'ACTIVE');

titre('Avec l’IBAN, la suppression passe et annonce le versement');
const iban = await put('/api/drivers/me/bank-account', { iban: 'FR76 3000 6000 0112 3456 7890 189', accountHolder: `Noa ${uniq}` }, N);
check('l’IBAN est enregistré', iban.status === 200, `statut ${iban.status}`);
const accord = await post('/api/drivers/me/suppression', {}, N);
const accordCorps = await j(accord);
check('la suppression passe', accord.status === 200, `statut ${accord.status}`);
check('le message annonce le montant et le lundi', /versés avec les paiements du lundi/.test(accordCorps?.message || '') && accordCorps.message.includes(gain.toFixed(2).replace('.', ',')),
  accordCorps?.message);
check('la date de la demande est gardée', (await sqlScalaire(`SELECT "suppressionDemandeeLe" IS NOT NULL FROM "Driver" WHERE email = '${emailNoa}'`)) === 'true');
const alerte = await sqlScalaire(
  `SELECT body FROM "DriverSupportMessage" m JOIN "Driver" d ON d.id = m."driverId" WHERE d.email = '${emailNoa}' ORDER BY m."createdAt" DESC LIMIT 1`
);
check('le support sait qu’il ne faut rien effacer avant le versement', /Ne pas effacer/.test(alerte), alerte);
const noaId = await sqlScalaire(`SELECT id FROM "Driver" WHERE email = '${emailNoa}'`);
const fiche = await j(await get(`/api/superowner/drivers/${noaId}`, S));
check('la fiche plateforme montre ce qui reste à verser', Math.abs((fiche?.suppression?.montantDu ?? 0) - gain) < 0.01 && fiche?.suppression?.ibanValide === true,
  JSON.stringify(fiche?.suppression));

titre('Le lundi, ses courses sont arrêtées comme celles des autres');
// L'arrêté de la semaine, tel que le lance la tâche du lundi (tous les livreurs).
const debut = new Date(Date.now() - 7 * 86400000).toISOString();
const fin = new Date(Date.now() + 60000).toISOString();
const arrete = await post('/api/superowner/payouts/draw', { periodStart: debut, periodEnd: fin }, S);
check('l’arrêté passe', arrete.status === 200 || arrete.status === 201, `statut ${arrete.status}`);
const releve = await sqlScalaire(
  `SELECT p.status || ':' || p.amount FROM "DriverPayout" p JOIN "Driver" d ON d.id = p."driverId" WHERE d.email = '${emailNoa}'`
);
check('un relevé est prêt à verser, compte supprimé ou non', releve.startsWith('PENDING:') && Math.abs(Number(releve.split(':')[1]) - gain) < 0.01, releve);
const apres = (await j(await get('/api/drivers/me/suppression', N)))?.data;
check('il peut encore suivre son versement', Math.abs((apres?.montantDu ?? 0) - gain) < 0.01, JSON.stringify(apres));

await terminer();
