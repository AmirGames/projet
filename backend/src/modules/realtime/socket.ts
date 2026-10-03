import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { originesAutorisees } from '../auth/origines-autorisees';
import { logger } from '../../config/logger';
import { verifyToken } from '../auth/auth.middleware';
import { AuthenticatedSocket } from '../../types/socket';
import { db } from '../../services/db';
import { compteSocket, accesCommande, accesSalon } from './socket-access';

// Les notifications sont adressées par e-mail : chaque connexion rejoint donc
// un salon nominatif, ce qui permet de la pousser au bon destinataire.
const salonUtilisateur = (email: string) => `user-${email.toLowerCase()}`;

/** Salon de l'équipe support de la plateforme (chat livreurs). */
const SALON_SUPPORT = 'support-livreurs';

/**
 * Flux global du superowner. Les rôles partiels n'ont pas accès à tous
 * les identifiants et sections que transporte ce flux.
 */
const SALON_PLATEFORME = 'plateforme';

/** Salon public d'une boutique : disponibilité des produits, horaires. */
const salonBoutique = (storeId: string) => `store-${storeId}`;

export let io: SocketIOServer;

/** Autorisation au moment de l'envoi, y compris pour les sockets Redis.
 * Un salon rejoint hier ne constitue pas un droit aujourd'hui.
 */
async function envoyerPrive(salons: string[], evenement: string, donnees: unknown) {
  if (!io || !salons.length) return;
  try {
    const connexions = await io.in(salons).fetchSockets();
    await Promise.all(connexions.map(async (socket) => {
      try {
        const compte = await compteSocket(socket.data.jeton);
        if (!compte) { socket.disconnect(true); return; }
        let autorise = false;
        for (const salon of salons) {
          if (!socket.rooms.has(salon)) continue;
          if (await accesSalon(compte, salon)) autorise = true;
          else await socket.leave(salon);
        }
        if (autorise) socket.emit(evenement, donnees);
      } catch (err) {
        // Une erreur de base/session ne doit jamais ouvrir l'accès.
        logger.error('Événement privé refusé', { socketId: socket.id, error: String(err) });
      }
    }));
  } catch (err) {
    logger.error('Impossible de diffuser un événement privé', { evenement, error: String(err) });
  }
}

export function initializeSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: originesAutorisees(),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(); // Les vitrines restent publiques.
    try {
      const jeton = verifyToken(token);
      const compte = await compteSocket(jeton);
      if (!compte) return next(new Error('Invalid token'));
      socket.userId = compte.id;
      socket.data.jeton = jeton;
      socket.data.compteInitial = compte;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const compte = socket.data.compteInitial;
    delete socket.data.compteInitial;
    if (compte) {
      socket.join(`compte-${compte.id}`);
      if (compte.emailVerified) socket.join(salonUtilisateur(compte.email));
      // L'envoi revérifie la permission exacte et les rôles en base.
      if (compte.isSuperOwner || compte.isSystemAdmin) socket.join([SALON_SUPPORT, SALON_PLATEFORME]);
    }

    socket.use(async (_packet, next) => {
      try {
        if (socket.userId && !(await compteSocket(socket.data.jeton))) {
          socket.disconnect(true);
          return next(new Error('Invalid token'));
        }
        next();
      } catch {
        socket.disconnect(true);
        next(new Error('Invalid token'));
      }
    });

    const identifiant = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128;
    socket.on('join-store', (storeId: string) => {
      if (identifiant(storeId) && socket.rooms.size < 100) socket.join(salonBoutique(storeId));
    });
    socket.on('leave-store', (storeId: string) => {
      if (identifiant(storeId)) socket.leave(salonBoutique(storeId));
    });
    socket.on('join-order', async (orderId: string, ack?: (result: { ok: boolean }) => void) => {
      let autorise = false;
      try {
        if (identifiant(orderId) && socket.rooms.size < 100) {
          const actuel = await compteSocket(socket.data.jeton);
          autorise = !!actuel && await accesCommande(actuel, orderId);
        }
        if (autorise) await socket.join(`order-${orderId}`);
      } catch (err) {
        logger.error('Impossible de vérifier le suivi de commande', { socketId: socket.id, error: String(err) });
      }
      if (!autorise) socket.emit('acces-refuse', { salon: 'order', code: 'FORBIDDEN', orderId });
      if (typeof ack === 'function') ack({ ok: autorise });
    });
    socket.on('leave-order', (orderId: string) => {
      if (identifiant(orderId)) socket.leave(`order-${orderId}`);
    });
    socket.on('error', (error) => logger.error('Socket error', { error, userId: socket.userId }));
  });

  return io;
}

/** Ce qu'il en est de Redis, pour la surveillance. */
let redisEtat: { configure: boolean; relie: boolean; pret: () => boolean } = {
  configure: false,
  relie: false,
  pret: () => false,
};

export function etatTempsReel() {
  return {
    connexions: io ? io.engine.clientsCount : 0,
    redis: {
      configure: redisEtat.configure,
      relie: redisEtat.relie,
      pret: redisEtat.relie && redisEtat.pret(),
    },
  };
}

/** Au-delà, on renonce à Redis et on reste sur une seule instance. */
const DELAI_CONNEXION_REDIS_MS = 5000;

/**
 * Relie les instances du serveur entre elles, par Redis.
 *
 * Sans cela, chaque instance ne connaît que ses propres connexions : un
 * événement émis sur l'une n'arrive pas aux navigateurs branchés sur l'autre,
 * et le temps réel ne marche plus qu'une fois sur deux dès qu'on en lance
 * plusieurs. Avec une seule instance (le développement), Redis est facultatif :
 * sans REDIS_URL, ou si Redis ne répond pas, on reste en mémoire.
 */
export async function brancherRedis(url = process.env.REDIS_URL) {
  if (!io) return false;

  if (!url) {
    logger.info('Temps réel : une seule instance (REDIS_URL absent)');
    return false;
  }

  const emetteur = createClient({
    url,
    socket: { reconnectStrategy: (tentatives) => Math.min(tentatives * 500, 5000) },
  });
  const recepteur = emetteur.duplicate();

  // Sans écouteur, une erreur de Redis ferait tomber tout le serveur. Pendant
  // la première tentative, chaque essai raté en produirait une : le bilan
  // dit une fois ce qu'il en est.
  let relie = false;
  const signaler = (err: unknown) => {
    if (!relie) return;
    logger.error('Temps réel : incident Redis', {
      error: err instanceof Error ? err.message : err,
    });
  };
  emetteur.on('error', signaler);
  recepteur.on('error', signaler);

  let minuteur: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      Promise.all([emetteur.connect(), recepteur.connect()]),
      new Promise((_, rejeter) => {
        minuteur = setTimeout(
          () => rejeter(new Error('Redis ne répond pas')),
          DELAI_CONNEXION_REDIS_MS
        );
      }),
    ]);

    io.adapter(createAdapter(emetteur, recepteur));
    relie = true;
    redisEtat = {
      configure: true,
      relie: true,
      pret: () => emetteur.isReady && recepteur.isReady,
    };
    logger.info('Temps réel : instances reliées par Redis');
    return true;
  } catch (err) {
    emetteur.destroy();
    recepteur.destroy();
    redisEtat = { configure: true, relie: false, pret: () => false };
    logger.warn('Temps réel : Redis injoignable, on reste sur une seule instance', {
      error: err instanceof Error ? err.message : err,
    });
    return false;
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Pousse une notification à son destinataire, s'il est connecté.
 *
 * Sans cela la cloche n'était alimentée qu'au chargement de la page : il
 * fallait recharger pour voir arriver un nouveau message.
 */
export function emitNotification(recipientEmail: string, notification: unknown) {
  if (!io || !recipientEmail) return;

  return envoyerPrive([salonUtilisateur(recipientEmail)], 'notification', notification);
}

export async function emitOrderUpdate(orderId: string, status: string, data?: any) {
  if (!io) return;

  await envoyerPrive([`order-${orderId}`], 'order-update', {
    orderId,
    status,
    timestamp: new Date().toISOString(),
    ...data,
  });

  void prevenirLaBoutique(orderId, { status });
}

export async function emitDeliveryUpdate(orderId: string, data: any) {
  if (!io) return;

  await envoyerPrive([`order-${orderId}`], 'delivery-update', {
    orderId,
    timestamp: new Date().toISOString(),
    ...data,
  });

  void prevenirLaBoutique(orderId, { deliveryStatus: data?.status });
}

/**
 * Toute évolution d'une commande prévient aussi l'équipe de la boutique.
 *
 * Sans cela, une commande livrée, annulée ou avancée depuis un autre écran
 * restait figée sur les autres appareils du commerçant jusqu'au
 * rafraîchissement suivant.
 */
async function prevenirLaBoutique(orderId: string, donnees: Record<string, unknown>) {
  try {
    const commande = await db.order.findUnique({ where: { id: orderId }, select: { storeId: true } });
    if (commande) {
      await emitMerchantEvent(commande.storeId, 'commande-maj', { orderId, storeId: commande.storeId, ...donnees });
    }
  } catch (err) {
    logger.error("Impossible de prévenir la boutique d'une commande", {
      orderId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Pousse un événement aux visiteurs d'une boutique.
 *
 * Sert aux informations publiques du menu : un plat qui passe en épuisé doit
 * disparaître du panier possible sans que le client ait à recharger.
 */
export function emitStoreEvent(storeId: string, evenement: string, donnees: unknown) {
  if (!io || !storeId) return;

  io.to(salonBoutique(storeId)).emit(evenement, donnees);
}

/**
 * Pousse un événement à l'équipe d'une boutique : ses commandes.
 *
 * Le salon public de la boutique ne convient pas — n'importe quel visiteur de
 * la vitrine y est, et une commande porte un nom et un téléphone. On passe
 * donc par l'identifiant de chaque membre, sans dépendre d'un e-mail déclaré.
 */
export async function emitMerchantEvent(storeId: string, evenement: string, donnees: unknown) {
  if (!io || !storeId) return;

  try {
    const boutique = await db.store.findUnique({ where: { id: storeId }, select: { orgId: true } });
    if (!boutique) return;

    const membres = await db.membership.findMany({
      where: { orgId: boutique.orgId },
      select: { user: { select: { id: true } } },
    });

    for (const membre of membres) {
      await envoyerPrive([`compte-${membre.user.id}`], evenement, donnees);
    }
  } catch (err) {
    logger.error("Impossible de prévenir l'équipe de la boutique", {
      storeId,
      evenement,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/** Pousse un événement à tous les membres d'une organisation. */
export async function emitOrgEvent(orgId: string, evenement: string, donnees: unknown) {
  if (!io || !orgId) return;

  try {
    const membres = await db.membership.findMany({
      where: { orgId },
      select: { user: { select: { id: true } } },
    });

    for (const membre of membres) {
      await envoyerPrive([`compte-${membre.user.id}`], evenement, donnees);
    }
  } catch (err) {
    logger.error("Impossible de prévenir l'organisation", {
      orgId,
      evenement,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Prévient toute l'équipe d'un commerçant que son compte a changé d'état.
 *
 * Une suspension prise en compte au prochain rechargement laisse le commerçant
 * travailler dans une interface qui ne répond plus : chaque enregistrement
 * échoue sans qu'il comprenne pourquoi. L'écran doit basculer tout de suite.
 */
export async function emitOrgStatus(
  orgId: string,
  donnees: { status: string; reason?: string | null }
) {
  if (!io || !orgId) return;

  try {
    const membres = await db.membership.findMany({
      where: { orgId },
      select: { user: { select: { id: true } } },
    });

    for (const membre of membres) {
      await envoyerPrive([`compte-${membre.user.id}`], "compte-statut", {
        orgId,
        ...donnees,
      });
    }
  } catch (err) {
    logger.error("Impossible de diffuser le changement de statut", {
      orgId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Pousse un événement à un livreur précis.
 *
 * Une course proposée n'a de valeur que pendant quelques dizaines de
 * secondes : l'attendre au prochain rafraîchissement de page la ferait
 * expirer avant d'avoir été vue. Le salon est le même que celui des
 * notifications, un compte n'ayant qu'une identité.
 */
export function emitDriverEvent(email: string, evenement: string, donnees: unknown) {
  if (!io || !email) return;

  return envoyerPrive([salonUtilisateur(email)], evenement, donnees);
}

/**
 * Pousse un événement à tous les appareils connectés d'un compte : ses
 * onglets du site comme ses téléphones (un panier modifié ailleurs, par
 * exemple).
 */
export function emitUserEvent(email: string, evenement: string, donnees: unknown) {
  if (!io || !email) return;

  return envoyerPrive([salonUtilisateur(email)], evenement, donnees);
}

/** Pousse un événement à l'équipe support (superowners et admins système). */
export function emitSupportEvent(evenement: string, donnees: unknown) {
  if (!io) return;

  return envoyerPrive([SALON_SUPPORT], evenement, donnees);
}

/** Ce qu'un écran doit savoir pour décider s'il se relit. */
export interface Modification {
  /** La famille de données : `orders`, `products`, `store-hours`… */
  ressource: string;
  action: 'creation' | 'modification' | 'suppression';
  /** L'identifiant de la donnée touchée, quand il est connu. */
  id?: string;
  storeId?: string;
  orgId?: string;
}

/** Les destinataires d'une modification. */
export interface Destinataires {
  /** Toute l'équipe de ces organisations. */
  orgIds?: string[];
  /** Les visiteurs de ces vitrines : seulement pour ce qui y est public. */
  boutiquesPubliques?: string[];
  /** Ceux qui suivent ces commandes (déjà autorisés à y entrer). */
  commandes?: string[];
  /** Ces comptes, par leur e-mail. */
  emails?: string[];
  /** L'équipe de la plateforme. */
  plateforme?: boolean;
}

/**
 * Prévient les écrans ouverts qu'une donnée a changé.
 *
 * Les identifiants d'objets et d'organisations restent privés : les salons
 * sont revérifiés avant diffusion. L'écran relit ensuite les données par l'API.
 *
 * Tous les salons sont visés en un seul envoi : un compte présent dans
 * plusieurs (un superowner membre d'une organisation) ne le reçoit qu'une fois.
 */
export async function signalerModification(modification: Modification, destinataires: Destinataires) {
  if (!io) return;

  try {
    const salons = new Set<string>();

    for (const email of destinataires.emails || []) {
      if (email) salons.add(salonUtilisateur(email));
    }
    for (const orderId of destinataires.commandes || []) {
      salons.add(`order-${orderId}`);
    }
    if (destinataires.plateforme) salons.add(SALON_PLATEFORME);

    const orgIds = [...new Set((destinataires.orgIds || []).filter(Boolean))];
    if (orgIds.length > 0) {
      const membres = await db.membership.findMany({
        where: { orgId: { in: orgIds } },
        select: { user: { select: { id: true } } },
      });
      for (const membre of membres) salons.add(`compte-${membre.user.id}`);
    }

    const evenement = { ...modification, horodatage: new Date().toISOString() };

    if (salons.size > 0) {
      await envoyerPrive([...salons], 'donnees-modifiees', evenement);
    }

    // La vitrine ne reçoit que le nom de la famille et la boutique : ni
    // l'identifiant ni l'organisation ne la regardent.
    for (const storeId of new Set(destinataires.boutiquesPubliques || [])) {
      io.to(salonBoutique(storeId)).emit('donnees-modifiees', {
        ressource: modification.ressource,
        action: modification.action,
        storeId,
        horodatage: evenement.horodatage,
      });
    }
  } catch (err) {
    logger.error('Impossible de diffuser une modification', {
      ressource: modification.ressource,
      error: err instanceof Error ? err.message : err,
    });
  }
}
