// Les salons en direct : qui peut suivre quoi, et le changement de
// disponibilité poussé aux visiteurs d'une boutique.

import { io } from 'socket.io-client';

import { inscription, titre, check, j, uniq, post, get, patch, terminer, API } from './outils.mjs';

/** Ouvre une connexion, avec ou sans compte. */
function connecter(jeton) {
  return new Promise((resoudre, rejeter) => {
    const socket = io(API, {
      auth: jeton ? { token: jeton } : {},
      transports: ['websocket'],
      timeout: 5000,
    });

    socket.on('connect', () => resoudre(socket));
    socket.on('connect_error', (err) => rejeter(err));
  });
}

/** Attend un événement, ou renvoie null au bout du délai. */
function attendre(socket, evenement, delaiMs = 5000) {
  return new Promise((resoudre) => {
    const minuteur = setTimeout(() => resoudre(null), delaiMs);

    socket.once(evenement, (donnees) => {
      clearTimeout(minuteur);
      resoudre(donnees);
    });
  });
}

// ===== Le décor =====

await inscription({ email: `p-${uniq}@t.fr`, password: 'Password123!', name: `P ${uniq}` });

const commercant = await j(
  await inscription({ email: `m-${uniq}@t.fr`, password: 'Password123!', name: `M ${uniq}` })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Pizzeria ${uniq}`,
      slug: `pizzeria-${uniq}`,
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
  await post('/api/products', { storeId, name: 'Margherita', price: 12, status: 'ACTIVE' }, T)
);
const productId = produit.product?.id || produit.id;

const client = await j(
  await inscription({ email: `c-${uniq}@t.fr`, password: 'Password123!', name: `C ${uniq}` })
);

const commande = await j(
  await post('/api/orders', { conditionsAcceptees: true,
    storeId,
    customerName: `C ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: '0600000000',
    deliveryType: 'PICKUP',
    totalAmount: 12,
    items: [{ productId, quantity: 1, price: 12 }],
  })
);
const orderId = commande.order?.id || commande.id;

// ===== Connexion sans compte =====

titre('Un visiteur sans compte');
let anonyme = null;
let erreurAnonyme = null;

try {
  anonyme = await connecter(null);
} catch (err) {
  erreurAnonyme = err?.message || String(err);
}

check('il peut se connecter au direct', !!anonyme, erreurAnonyme || '');

titre('Jeton invalide');
let refus = null;
try {
  await connecter('jeton-bidon');
} catch (err) {
  refus = err?.message || String(err);
}
check('un jeton invalide est refusé', !!refus, refus || 'accepté à tort');

// ===== Disponibilité poussée en direct =====

titre('Changement de disponibilité');
anonyme.emit('join-store', storeId);
await new Promise((r) => setTimeout(r, 300));

const attenteEpuise = attendre(anonyme, 'produit-disponibilite');
await patch(`/api/products/${productId}/availability`, { isAvailable: false, storeId }, T);
const epuise = await attenteEpuise;

check('le visiteur est prévenu sans recharger', !!epuise, 'aucun événement reçu');
check('le produit est identifié', epuise?.productId === productId, JSON.stringify(epuise));
check('le nom est transmis', epuise?.name === 'Margherita', epuise?.name);
check('l’indisponibilité est annoncée', epuise?.isAvailable === false, `${epuise?.isAvailable}`);

const attenteRetour = attendre(anonyme, 'produit-disponibilite');
await patch(`/api/products/${productId}/availability`, { isAvailable: true, storeId }, T);
const retour = await attenteRetour;

check('le retour en disponible est poussé aussi', retour?.isAvailable === true, JSON.stringify(retour));

titre('Une autre boutique ne reçoit rien');
const autre = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Autre ${uniq}`,
      slug: `autre-${uniq}`,
      address: '2 rue',
      city: 'Lyon',
      postalCode: '69003',
      phone: '0400000001',
    },
    T
  )
);

const autreSocket = await connecter(null);
autreSocket.emit('join-store', autre.store?.id || autre.id);
await new Promise((r) => setTimeout(r, 300));

const silence = attendre(autreSocket, 'produit-disponibilite', 2500);
await patch(`/api/products/${productId}/availability`, { isAvailable: false, storeId }, T);
check('le salon d’une autre boutique reste muet', (await silence) === null, 'événement reçu à tort');
autreSocket.disconnect();

// ===== Qui peut suivre une commande =====

titre('Suivi d’une commande');
const suiviAnonyme = attendre(anonyme, 'acces-refuse', 2500);
anonyme.emit('join-order', orderId);
const refusAnonyme = await suiviAnonyme;

check(
  'un anonyme ne peut pas suivre une commande',
  refusAnonyme?.code === 'FORBIDDEN',
  JSON.stringify(refusAnonyme)
);

const intrus = await j(
  await inscription({ email: `x-${uniq}@t.fr`, password: 'Password123!', name: `X ${uniq}` })
);
const socketIntrus = await connecter(intrus.accessToken);
const refusIntrus = attendre(socketIntrus, 'acces-refuse', 2500);
socketIntrus.emit('join-order', orderId);

check(
  'un inconnu connecté ne peut pas suivre la commande d’un autre',
  (await refusIntrus)?.code === 'FORBIDDEN',
  'accepté à tort'
);
socketIntrus.disconnect();

const socketClient = await connecter(client.accessToken);
const refusClient = attendre(socketClient, 'acces-refuse', 2500);
socketClient.emit('join-order', orderId);
check('le client qui a commandé y a accès', (await refusClient) === null, 'refusé à tort');
socketClient.disconnect();

const socketCommercant = await connecter(T);
const refusCommercant = attendre(socketCommercant, 'acces-refuse', 2500);
socketCommercant.emit('join-order', orderId);
check('la boutique y a accès', (await refusCommercant) === null, 'refusé à tort');
socketCommercant.disconnect();

anonyme.disconnect();
await terminer();
