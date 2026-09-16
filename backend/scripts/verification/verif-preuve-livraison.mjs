// Une course ne se clôt pas sur un simple clic : il faut prouver la remise.

import {
  titre,
  check,
  j,
  uniq,
  post,
  get,
  patch,
  terminer,
  sqlScalaire,
  sqlExec,
  validerLivreur,
  codeDeRemise,
} from './outils.mjs';

const MDP = 'Password123!';

const plateforme = await j(
  await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Resto ${uniq}`,
      slug: `resto-${uniq}`,
      address: '1 place Bellecour',
      city: 'Lyon',
      postalCode: '69002',
      phone: '0400000000',
      latitude: 45.764,
      longitude: 4.8357,
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post('/api/products', { storeId, name: `Plat ${uniq}`, price: 15, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

const livreur = await j(
  await post('/api/drivers/register', {
    name: `Karim ${uniq}`,
    email: `d-${uniq}@t.fr`,
    password: MDP,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  })
);
const D = livreur.accessToken;

await validerLivreur(D, TP);
await patch('/api/drivers/availability', { isOnline: true }, D);
await patch('/api/drivers/location', { latitude: 45.764, longitude: 4.8357 }, D);

/** Une course acceptée et récupérée, prête à être remise. */
async function courseAuSeuil() {
  const commande = await j(
    await post('/api/orders', {
      storeId,
      customerName: `Client ${uniq}`,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'DELIVERY',
      deliveryAddress: '12 avenue Thiers',
      deliveryCity: 'Lyon',
      deliveryLat: 45.78,
      deliveryLng: 4.86,
      totalAmount: 15,
      feesAmount: 3,
      items: [{ productId, quantity: 1, price: 15 }],
    })
  );

  const orderId = commande.order?.id || commande.id;
  const attribution = await j(await post(`/api/orders/${orderId}/dispatch`, {}, T));
  const courseId = attribution?.data?.deliveryId;

  await patch(`/api/drivers/deliveries/${courseId}/accept`, null, D);
  await patch(`/api/drivers/deliveries/${courseId}`, { status: 'PICKED_UP' }, D);

  return { orderId, courseId };
}

// ===== Le code naît avec la course =====

titre('Chaque course porte un code de remise');
const { orderId, courseId } = await courseAuSeuil();

const code = await codeDeRemise(courseId);
check('un code est posé', /^\d{4}$/.test(code), code);

titre('Le client le lit, le livreur jamais');
// Sans cette asymétrie, le code ne prouve rien : un livreur qui le lit n'a
// besoin de personne pour clore la course.
const vuClient = await j(await get(`/api/orders/${orderId}`));
check('le client voit son code', vuClient?.codeRemise === code, `${vuClient?.codeRemise}`);

const vuLivreur = await j(await get(`/api/drivers/deliveries/${courseId}`, D));
check(
  'le livreur ne le voit pas',
  !JSON.stringify(vuLivreur).includes(code),
  JSON.stringify(vuLivreur?.data)?.slice(0, 300)
);
check('mais sait qu’un code est attendu', vuLivreur?.data?.codeAttendu === true, `${vuLivreur?.data?.codeAttendu}`);
check('et combien d’essais lui restent', vuLivreur?.data?.essaisRestants === 5, `${vuLivreur?.data?.essaisRestants}`);

// ===== Sans preuve, rien ne se clôt =====

titre('Clore sans preuve est refusé');
// Elle passait à DELIVERED sur simple clic : rien ne distinguait un repas remis
// en main propre d'un repas jamais sorti du sac.
const nu = await patch(`/api/drivers/deliveries/${courseId}`, { status: 'DELIVERED' }, D);
check('la remise est refusée', nu.status === 400, `statut ${nu.status}`);
check(
  'et on dit quoi faire',
  /code à quatre chiffres|photographiez/i.test((await j(nu))?.error || ''),
  (await j(nu))?.error
);

const etatApres = await sqlScalaire(`SELECT status FROM "OrderDelivery" WHERE id = '${courseId}'`);
check('la course reste en cours', etatApres === 'PICKED_UP', etatApres);

titre('Un code faux est refusé, et compté');
const faux = await patch(
  `/api/drivers/deliveries/${courseId}`,
  { status: 'DELIVERED', code: code === '0000' ? '1111' : '0000' },
  D
);
check('la remise est refusée', faux.status === 400, `statut ${faux.status}`);
check(
  'et il reste des essais annoncés',
  /4 essais restants/.test((await j(faux))?.error || ''),
  (await j(faux))?.error
);

const essais = await sqlScalaire(`SELECT "codeAttempts" FROM "OrderDelivery" WHERE id = '${courseId}'`);
check('l’essai raté est compté', essais === '1', essais);

// ===== Le bon code clôt la course =====

titre('Le bon code clôt la course');
const remise = await patch(`/api/drivers/deliveries/${courseId}`, { status: 'DELIVERED', code }, D);
check('la remise passe', remise.status === 200, `statut ${remise.status}`);

const type = await sqlScalaire(`SELECT "proofType" FROM "OrderDelivery" WHERE id = '${courseId}'`);
check('la preuve est le code', type === 'CODE', type);

const quand = await sqlScalaire(`SELECT "proofAt" FROM "OrderDelivery" WHERE id = '${courseId}'`);
check('elle est horodatée', quand !== '', quand);

const compteurRemis = await sqlScalaire(
  `SELECT "codeAttempts" FROM "OrderDelivery" WHERE id = '${courseId}'`
);
check('le compteur d’essais est remis à zéro', compteurRemis === '0', compteurRemis);

titre('Le client sait comment sa commande a été remise');
const suivi = await j(await get(`/api/orders/${orderId}`));
check('la preuve lui est dite', suivi?.preuveDeLivraison === 'CODE', suivi?.preuveDeLivraison);
// Le code n'a plus d'objet une fois la course remise : le garder à l'écran
// laisserait croire qu'on peut encore s'en servir.
check('le code n’est plus affiché', suivi?.codeRemise === null, `${suivi?.codeRemise}`);

// ===== Le dépôt sans contact =====

titre('Quand le client est absent, la photo fait preuve');
const absente = await courseAuSeuil();

const photo = await patch(
  `/api/drivers/deliveries/${absente.courseId}`,
  {
    status: 'DELIVERED',
    photoUrl: 'https://exemple.fr/depot.jpg',
    note: 'Devant la porte, chez le gardien',
  },
  D
);
check('la remise passe', photo.status === 200, `statut ${photo.status}`);

const typePhoto = await sqlScalaire(
  `SELECT "proofType" FROM "OrderDelivery" WHERE id = '${absente.courseId}'`
);
check('la preuve est la photo', typePhoto === 'PHOTO', typePhoto);

const lien = await sqlScalaire(
  `SELECT "proofPhoto" FROM "OrderDelivery" WHERE id = '${absente.courseId}'`
);
check('le lien est conservé', lien === 'https://exemple.fr/depot.jpg', lien);

const note = await sqlScalaire(
  `SELECT "proofNote" FROM "OrderDelivery" WHERE id = '${absente.courseId}'`
);
check('l’endroit du dépôt est noté', note === 'Devant la porte, chez le gardien', note);

const vuAbsent = await j(await get(`/api/orders/${absente.orderId}`));
check('le client sait que c’est un dépôt', vuAbsent?.preuveDeLivraison === 'PHOTO', vuAbsent?.preuveDeLivraison);

titre('Une photo qui n’est pas un lien est refusée');
const troisieme = await courseAuSeuil();
const pasUnLien = await patch(
  `/api/drivers/deliveries/${troisieme.courseId}`,
  { status: 'DELIVERED', photoUrl: 'une photo' },
  D
);
check('le dépôt est refusé', pasUnLien.status === 400, `statut ${pasUnLien.status}`);

// ===== Le code ne se force pas =====

titre('Le code se bloque après cinq essais');
// Quatre chiffres se forcent en dix mille tentatives : sans limite, n'importe
// quelle course se clôturerait sans le client.
const bonCode = await codeDeRemise(troisieme.courseId);
const mauvais = bonCode === '0000' ? '1111' : '0000';

for (let essai = 0; essai < 5; essai++) {
  await patch(
    `/api/drivers/deliveries/${troisieme.courseId}`,
    { status: 'DELIVERED', code: mauvais },
    D
  );
}

const bloques = await sqlScalaire(
  `SELECT "codeAttempts" FROM "OrderDelivery" WHERE id = '${troisieme.courseId}'`
);
check('les cinq essais sont comptés', bloques === '5', bloques);

const apresBlocage = await patch(
  `/api/drivers/deliveries/${troisieme.courseId}`,
  { status: 'DELIVERED', code: bonCode },
  D
);
check('même le bon code ne passe plus', apresBlocage.status === 400, `statut ${apresBlocage.status}`);
check(
  'et on renvoie vers la photo',
  /bloqué/i.test((await j(apresBlocage))?.error || ''),
  (await j(apresBlocage))?.error
);

const etatBloque = await sqlScalaire(
  `SELECT status FROM "OrderDelivery" WHERE id = '${troisieme.courseId}'`
);
check('la course n’est toujours pas livrée', etatBloque === 'PICKED_UP', etatBloque);

titre('Le livreur voit que le code est bloqué');
const vuBloque = await j(await get(`/api/drivers/deliveries/${troisieme.courseId}`, D));
check('aucun code n’est plus attendu', vuBloque?.data?.codeAttendu === false, `${vuBloque?.data?.codeAttendu}`);
check('aucun essai ne reste', vuBloque?.data?.essaisRestants === 0, `${vuBloque?.data?.essaisRestants}`);

titre('La photo reste la porte de sortie');
const secours = await patch(
  `/api/drivers/deliveries/${troisieme.courseId}`,
  { status: 'DELIVERED', photoUrl: 'https://exemple.fr/secours.jpg', note: 'Remis en main propre' },
  D
);
check('le dépôt passe', secours.status === 200, `statut ${secours.status}`);
check(
  'la preuve est la photo',
  (await sqlScalaire(`SELECT "proofType" FROM "OrderDelivery" WHERE id = '${troisieme.courseId}'`)) ===
    'PHOTO',
  'preuve inattendue'
);

// ===== Ce que la preuve ne change pas =====

titre('Les étapes précédentes n’en demandent pas');
const quatrieme = await j(
  await post('/api/orders', {
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: `c4-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'DELIVERY',
    deliveryAddress: '3 rue Garibaldi',
    deliveryCity: 'Lyon',
    deliveryLat: 45.77,
    deliveryLng: 4.85,
    totalAmount: 15,
    feesAmount: 3,
    items: [{ productId, quantity: 1, price: 15 }],
  })
);
const orderQuatre = quatrieme.order?.id || quatrieme.id;
const courseQuatre = (await j(await post(`/api/orders/${orderQuatre}/dispatch`, {}, T)))?.data
  ?.deliveryId;

await patch(`/api/drivers/deliveries/${courseQuatre}/accept`, null, D);
const recuperee = await patch(`/api/drivers/deliveries/${courseQuatre}`, { status: 'PICKED_UP' }, D);
check('le retrait passe sans preuve', recuperee.status === 200, `statut ${recuperee.status}`);

titre('Une course abandonnée n’en demande pas non plus');
const abandon = await patch(`/api/drivers/deliveries/${courseQuatre}`, { status: 'FAILED' }, D);
check('l’abandon passe sans preuve', abandon.status === 200, `statut ${abandon.status}`);

titre('Une course d’avant le code se prouve par la photo');
// Les courses créées avant cette règle n'ont pas de code : exiger l'impossible
// les rendrait impossibles à clore.
const ancienne = await courseAuSeuil();
await sqlExec(`UPDATE "OrderDelivery" SET "deliveryCode" = NULL WHERE id = '${ancienne.courseId}'`);

const sansCode = await j(await get(`/api/drivers/deliveries/${ancienne.courseId}`, D));
check('aucun code n’est attendu', sansCode?.data?.codeAttendu === false, `${sansCode?.data?.codeAttendu}`);

const refusSansCode = await patch(
  `/api/drivers/deliveries/${ancienne.courseId}`,
  { status: 'DELIVERED' },
  D
);
check('elle ne se clôt pas pour autant', refusSansCode.status === 400, `statut ${refusSansCode.status}`);
check(
  'et la photo est demandée',
  /[Pp]hotographiez/.test((await j(refusSansCode))?.error || ''),
  (await j(refusSansCode))?.error
);

const parPhoto = await patch(
  `/api/drivers/deliveries/${ancienne.courseId}`,
  { status: 'DELIVERED', photoUrl: 'https://exemple.fr/ancienne.jpg' },
  D
);
check('la photo la clôt', parPhoto.status === 200, `statut ${parPhoto.status}`);

titre('La course d’un autre livreur reste hors de portée');
const autre = await j(
  await post('/api/drivers/register', {
    name: `Sami ${uniq}`,
    email: `d2-${uniq}@t.fr`,
    password: MDP,
    phone: '0622222222',
    vehicleType: 'bike',
  })
);
const cinquieme = await courseAuSeuil();
const vol = await patch(
  `/api/drivers/deliveries/${cinquieme.courseId}`,
  { status: 'DELIVERED', code: await codeDeRemise(cinquieme.courseId) },
  autre.accessToken
);
check('le bon code ne suffit pas à voler la course', vol.status === 403, `statut ${vol.status}`);

await terminer();
