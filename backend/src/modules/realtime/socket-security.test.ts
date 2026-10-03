import { createServer, Server } from 'http';
import { io as clientIo, Socket } from 'socket.io-client';
import { db } from '../../services/db';
import { SsoService } from '../auth/sso.service';
import { verifyToken } from '../auth/auth.middleware';
import { compteSocket, accesCommande } from './socket-access';
import {
  initializeSocket, io, emitNotification, emitOrderUpdate, emitDeliveryUpdate,
  emitMerchantEvent, emitOrgStatus, emitSupportEvent, signalerModification,
} from './socket';

jest.mock('../../services/db', () => ({ db: {
  user: { findUnique: jest.fn() }, order: { findUnique: jest.fn() },
  membership: { findFirst: jest.fn(), findMany: jest.fn() },
  store: { findUnique: jest.fn() }, platformRole: { findUnique: jest.fn() },
} }));
jest.mock('../auth/sso.service', () => ({ SsoService: { sessionActive: jest.fn() } }));
jest.mock('../auth/auth.middleware', () => ({ verifyToken: jest.fn() }));
jest.mock('../auth/origines-autorisees', () => ({ originesAutorisees: () => ['http://localhost'] }));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const utilisateur = (id: string) => ({
  id, email: `${id}@example.invalid`, emailVerified: true, passwordChangedAt: null as Date | null,
  isSuperOwner: false, isSystemAdmin: false,
  accesEquipe: [] as { plateforme: 'EAT' | 'DRIVE'; role: string }[],
});
let users: Record<string, ReturnType<typeof utilisateur>>;
let membres: string[];
let driverId: string | null;
let sessions: boolean;
let permissions: Record<string, string>;
let serveur: Server;
let origine: string;
let clients: Socket[];
const jeton = (id: string) => ({ userId: id, sid: `session-${id}`, iat: 100, exp: Math.floor(Date.now() / 1000) + 3600 });

beforeEach(async () => {
  users = { alice: utilisateur('alice'), bob: utilisateur('bob'), admin: utilisateur('admin') };
  membres = []; driverId = null; sessions = true; permissions = {}; clients = [];
  (db.user.findUnique as jest.Mock).mockImplementation(async ({ where }) => users[where.id] ?? null);
  (db.order.findUnique as jest.Mock).mockImplementation(async ({ where, select }) => {
    if (where.id !== 'commande-alice') return null;
    if (select.storeId) return { storeId: 'boutique' };
    return { customerEmail: users.alice.email, store: { orgId: 'org-alice' }, delivery: { driver: driverId ? { userId: driverId } : null } };
  });
  (db.membership.findFirst as jest.Mock).mockImplementation(async ({ where }) =>
    where.orgId === 'org-alice' && membres.includes(where.userId) ? { id: 'membership' } : null);
  (db.membership.findMany as jest.Mock).mockImplementation(async () => membres.map((id) => ({ user: { id } })));
  (db.store.findUnique as jest.Mock).mockResolvedValue({ orgId: 'org-alice' });
  (db.platformRole.findUnique as jest.Mock).mockImplementation(async () => ({ permissions }));
  (SsoService.sessionActive as jest.Mock).mockImplementation(async () => sessions);
  (verifyToken as jest.Mock).mockImplementation((id: string) => {
    if (id === 'invalid') throw new Error('invalid');
    return jeton(id);
  });
  serveur = createServer();
  initializeSocket(serveur);
  await new Promise<void>((resolve) => serveur.listen(0, '127.0.0.1', resolve));
  origine = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
});

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

async function connecter(id?: string, transport = 'websocket') {
  const client = clientIo(origine, { transports: [transport], auth: id ? { token: id } : {}, reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
  return client;
}
async function refusConnexion(id: string) {
  const client = clientIo(origine, { transports: ['websocket'], auth: { token: id }, reconnection: false });
  clients.push(client);
  return new Promise<Error>((resolve, reject) => {
    client.once('connect_error', resolve); client.once('connect', () => reject(new Error('Connexion autorisée')));
  });
}
function rejoindre(client: Socket, orderId = 'commande-alice') {
  return new Promise<{ ok: boolean }>((resolve) => client.emit('join-order', orderId, resolve));
}
function evenement(client: Socket, nom: string) {
  return new Promise<any>((resolve) => client.once(nom, resolve));
}
// Une barrière sur la même connexion vérifie l'absence de réception sans
// attendre un délai arbitraire : les événements précédents sont déjà livrés.
async function barriere(client: Socket) {
  const recu = evenement(client, 'test-barriere');
  io.sockets.sockets.get(client.id!)!.emit('test-barriere');
  await recu;
}

test.each(['websocket', 'polling'])('Alice suit sa commande et Bob est refusé (%s)', async (transport) => {
  const alice = await connecter('alice', transport);
  const bob = await connecter('bob', transport);
  expect(await rejoindre(alice)).toEqual({ ok: true });
  expect(await rejoindre(bob)).toEqual({ ok: false });
  const interdit = jest.fn(); bob.on('delivery-update', interdit);
  const recu = evenement(alice, 'delivery-update');
  await emitDeliveryUpdate('commande-alice', { latitude: 50, telephone: 'secret' });
  expect(await recu).toMatchObject({ telephone: 'secret' });
  await barriere(bob); expect(interdit).not.toHaveBeenCalled();
});

test('visiteur : vitrine publique autorisée, commande privée refusée', async () => {
  const visiteur = await connecter();
  expect(await rejoindre(visiteur)).toEqual({ ok: false });
  visiteur.emit('join-store', 'boutique');
  // L'accusé suivant garantit que le join-store a été traité.
  await rejoindre(visiteur);
  const recu = evenement(visiteur, 'donnees-modifiees');
  await signalerModification({ ressource: 'products', action: 'modification', id: 'secret', orgId: 'secret' }, { boutiquesPubliques: ['boutique'] });
  const publicRecu = await recu;
  expect(publicRecu).toMatchObject({ ressource: 'products', storeId: 'boutique' });
  expect(publicRecu).not.toHaveProperty('id');
  expect(publicRecu).not.toHaveProperty('orgId');
  expect(await Promise.resolve(io.sockets.sockets.get(visiteur.id!)!.rooms.has('order-commande-alice'))).toBe(false);
});

test('e-mail non vérifié : ni commande par adresse ni notification personnelle', async () => {
  users.alice.emailVerified = false;
  const alice = await connecter('alice');
  expect(await rejoindre(alice)).toEqual({ ok: false });
  const recu = jest.fn(); alice.on('notification', recu);
  await emitNotification(users.alice.email, { secret: true });
  await barriere(alice); expect(recu).not.toHaveBeenCalled();
});

test('membre non vérifié : reçoit uniquement son organisation, même suspendue', async () => {
  users.bob.emailVerified = false; membres = ['bob'];
  const bob = await connecter('bob');
  expect(await rejoindre(bob)).toEqual({ ok: true });
  const recu = evenement(bob, 'compte-statut');
  await emitOrgStatus('org-alice', { status: 'SUSPENDED' });
  expect(await recu).toEqual({ orgId: 'org-alice', status: 'SUSPENDED' });
});

test.each(['membership', 'livreur'])('droits %s retirés : aucune donnée dans le salon déjà rejoint', async (type) => {
  if (type === 'membership') membres = ['bob']; else driverId = 'bob';
  const bob = await connecter('bob'); expect(await rejoindre(bob)).toEqual({ ok: true });
  membres = []; driverId = null;
  const recu = jest.fn(); bob.on('order-update', recu);
  await emitOrderUpdate('commande-alice', 'DELIVERED');
  await barriere(bob); expect(recu).not.toHaveBeenCalled();
  expect(io.sockets.sockets.get(bob.id!)!.rooms.has('order-commande-alice')).toBe(false);
});

test('notification vérifiée et commande inconnue', async () => {
  const alice = await connecter('alice');
  expect(await rejoindre(alice, 'inconnue')).toEqual({ ok: false });
  const recu = evenement(alice, 'notification');
  await emitNotification(users.alice.email, { titre: 'bonjour' });
  expect(await recu).toEqual({ titre: 'bonjour' });
  expect(SsoService.sessionActive).toHaveBeenCalledWith('session-alice', { sansCache: true });
});

test('deviner un salon utilisateur ne donne pas accès aux notifications de Bob', async () => {
  const alice = await connecter('alice'); const bob = await connecter('bob');
  alice.emit('join-store', 'user-bob@example.invalid');
  alice.emit('join-user', 'bob@example.invalid');
  alice.emit('join', 'user-bob@example.invalid');
  await rejoindre(alice);
  const interdit = jest.fn(); alice.on('notification', interdit);
  const positif = evenement(bob, 'notification');
  await emitNotification(users.bob.email, { secret: 'bob' });
  expect(await positif).toEqual({ secret: 'bob' });
  await barriere(alice); expect(interdit).not.toHaveBeenCalled();
});

test('retrait de vérification e-mail après connexion : notification refusée', async () => {
  const alice = await connecter('alice'); users.alice.emailVerified = false;
  const recu = jest.fn(); alice.on('notification', recu);
  await emitNotification(users.alice.email, { secret: true });
  await barriere(alice); expect(recu).not.toHaveBeenCalled();
});

test('un destinataire présent dans plusieurs salons reçoit une seule modification', async () => {
  membres = ['alice']; const alice = await connecter('alice'); await rejoindre(alice);
  const recu = jest.fn(); alice.on('donnees-modifiees', recu);
  await signalerModification({ ressource: 'orders', action: 'modification' }, {
    commandes: ['commande-alice'], orgIds: ['org-alice'], emails: [users.alice.email],
  });
  await barriere(alice); expect(recu).toHaveBeenCalledTimes(1);
});

test('retrait membership : plus de notification de boutique', async () => {
  membres = ['bob']; const bob = await connecter('bob');
  const positif = evenement(bob, 'commande-maj');
  await emitMerchantEvent('boutique', 'commande-maj', { id: 'commande' }); await positif;
  membres = [];
  const recu = jest.fn(); bob.on('commande-maj', recu);
  await emitMerchantEvent('boutique', 'commande-maj', { secret: true });
  await barriere(bob); expect(recu).not.toHaveBeenCalled();
});

test.each(['session', 'password', 'deleted', 'expired'])('connexion ouverte invalidée (%s) avant notification', async (cause) => {
  const alice = await connecter('alice');
  const recu = jest.fn(); alice.on('notification', recu);
  if (cause === 'session') sessions = false;
  if (cause === 'password') users.alice.passwordChangedAt = new Date(101000);
  if (cause === 'deleted') delete users.alice;
  if (cause === 'expired') io.sockets.sockets.get(alice.id!)!.data.jeton.exp = 1;
  const ferme = evenement(alice, 'disconnect');
  await emitNotification('alice@example.invalid', { secret: true });
  await ferme; expect(recu).not.toHaveBeenCalled();
});

test('session révoquée : prochain message déconnecte sans rejoindre', async () => {
  const alice = await connecter('alice'); sessions = false;
  const ferme = evenement(alice, 'disconnect'); alice.emit('join-store', 'boutique'); await ferme;
  expect(alice.connected).toBe(false);
});

test.each(['invalid', 'deleted', 'session', 'password'])('refus à la connexion (%s)', async (cause) => {
  if (cause === 'deleted') delete users.alice;
  if (cause === 'session') sessions = false;
  if (cause === 'password') users.alice.passwordChangedAt = new Date(101000);
  expect((await refusConnexion(cause === 'invalid' ? cause : 'alice')).message).toBe('Invalid token');
});

test('pas de sid accepté en production', async () => {
  const precedent = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    expect(await compteSocket({ userId: 'alice' })).toBeNull();
  } finally { process.env.NODE_ENV = precedent; }
});

test.each(['DRIVE', 'EAT'])('admin %s sans facturation ne suit pas une commande étrangère', async (plateforme) => {
  users.admin.isSystemAdmin = true;
  users.admin.accesEquipe = [{ plateforme: plateforme as 'EAT' | 'DRIVE', role: 'SUPPORT' }];
  permissions = { 'driver-support': 'read' };
  expect(await accesCommande(users.admin, 'commande-alice')).toBe(false);
});

test('admin EAT facturation peut suivre ; retrait de permission immédiat', async () => {
  users.admin.isSystemAdmin = true; users.admin.accesEquipe = [{ plateforme: 'EAT', role: 'ADMIN' }];
  permissions = { billing: 'read' };
  const admin = await connecter('admin'); expect(await rejoindre(admin)).toEqual({ ok: true });
  permissions = {};
  const recu = jest.fn(); admin.on('delivery-update', recu);
  await emitDeliveryUpdate('commande-alice', { secret: true });
  await barriere(admin); expect(recu).not.toHaveBeenCalled();
});

test('support EAT autorisé, retrait du rôle ferme le flux, DRIVE refusé', async () => {
  users.admin.isSystemAdmin = true; users.admin.accesEquipe = [{ plateforme: 'EAT', role: 'SUPPORT' }];
  permissions = { 'driver-support': 'read' };
  const admin = await connecter('admin');
  const positif = evenement(admin, 'message-support');
  await emitSupportEvent('message-support', { telephone: 'secret' }); await positif;
  users.admin.accesEquipe = [{ plateforme: 'DRIVE', role: 'SUPPORT' }];
  const recu = jest.fn(); admin.on('message-support', recu);
  await emitSupportEvent('message-support', { telephone: 'secret' });
  await barriere(admin); expect(recu).not.toHaveBeenCalled();
});

test('flux plateforme complet réservé au superowner, révocation effective', async () => {
  users.admin.isSystemAdmin = true;
  const admin = await connecter('admin'); const refuse = jest.fn(); admin.on('donnees-modifiees', refuse);
  users.alice.isSuperOwner = true; const alice = await connecter('alice');
  const positif = evenement(alice, 'donnees-modifiees');
  await signalerModification({ ressource: 'billing', action: 'creation', id: 'secret' }, { plateforme: true });
  expect(await positif).toMatchObject({ id: 'secret' }); await barriere(admin); expect(refuse).not.toHaveBeenCalled();
  users.alice.isSuperOwner = false; const recu = jest.fn(); alice.on('donnees-modifiees', recu);
  await signalerModification({ ressource: 'billing', action: 'creation', id: 'secret' }, { plateforme: true });
  await barriere(alice); expect(recu).not.toHaveBeenCalled();
});

test('erreur en base : aucune diffusion privée', async () => {
  const alice = await connecter('alice'); const recu = jest.fn(); alice.on('notification', recu);
  (db.user.findUnique as jest.Mock).mockRejectedValueOnce(new Error('DB indisponible'));
  await emitNotification(users.alice.email, { secret: true });
  await barriere(alice); expect(recu).not.toHaveBeenCalled();
});
