import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './logger';
import { verifyToken } from '../middleware/auth';
import { AuthenticatedSocket } from '../types/socket';
import { db } from '../services/db';

// Les notifications sont adressées par e-mail : chaque connexion rejoint donc
// un salon nominatif, ce qui permet de la pousser au bon destinataire.
const salonUtilisateur = (email: string) => `user-${email.toLowerCase()}`;

/** Salon de l'équipe support de la plateforme (chat livreurs). */
const SALON_SUPPORT = 'support-livreurs';

/** Salon public d'une boutique : disponibilité des produits, horaires. */
const salonBoutique = (storeId: string) => `store-${storeId}`;

/**
 * Qui a le droit de suivre une commande en direct.
 *
 * Le client qui l'a passée, l'équipe de la boutique, le livreur qui
 * l'apporte, et la plateforme. Personne d'autre.
 */
async function peutSuivreLaCommande(socket: AuthenticatedSocket, orderId: string) {
  if (!socket.userId) return false;

  const commande = await db.order.findUnique({
    where: { id: orderId },
    select: {
      customerEmail: true,
      store: { select: { orgId: true } },
      delivery: { select: { driver: { select: { userId: true } } } },
    },
  });

  if (!commande) return false;

  const utilisateur = await db.user.findUnique({
    where: { id: socket.userId },
    select: { email: true, isSuperOwner: true, isSystemAdmin: true },
  });

  if (!utilisateur) return false;
  if (utilisateur.isSuperOwner || utilisateur.isSystemAdmin) return true;

  if (
    commande.customerEmail &&
    utilisateur.email.toLowerCase() === commande.customerEmail.toLowerCase()
  ) {
    return true;
  }

  if (commande.delivery?.driver?.userId === socket.userId) return true;

  // L'équipe de la boutique suit les commandes de son organisation.
  const appartenance = await db.membership.findFirst({
    where: { userId: socket.userId, orgId: commande.store.orgId },
    select: { id: true },
  });

  return Boolean(appartenance);
}

export let io: SocketIOServer;

export function initializeSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;

    // Une connexion sans jeton est acceptée, mais reste anonyme : la vitrine
    // est publique, et exiger un compte pour voir un plat passer en épuisé
    // priverait de mise à jour la plupart des visiteurs. Ce qu'un anonyme
    // peut suivre est décidé salon par salon, plus bas.
    if (!token) {
      return next();
    }

    try {
      const decoded = verifyToken(token);
      socket.userId = decoded.userId;
      // userRole and organizationId are no longer in JWT; load from DB if needed
      next();
    } catch (err) {
      // Un jeton présent mais invalide est une anomalie, pas un visiteur.
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    logger.info('User connected', { userId: socket.userId, socketId: socket.id });

    // Le menu d'une boutique est public : n'importe qui peut suivre ses
    // changements de disponibilité.
    socket.on('join-store', (storeId: string) => {
      if (typeof storeId !== 'string' || !storeId) return;
      socket.join(salonBoutique(storeId));
    });

    socket.on('leave-store', (storeId: string) => {
      if (typeof storeId !== 'string' || !storeId) return;
      socket.leave(salonBoutique(storeId));
    });

    socket.on('join-order', async (orderId: string) => {
      // Une commande porte un nom, un téléphone, une adresse et la position
      // du livreur. N'importe quel connecté pouvait suivre celle d'un
      // inconnu : il suffisait d'en deviner l'identifiant.
      if (typeof orderId !== 'string' || !orderId) return;

      if (!(await peutSuivreLaCommande(socket, orderId))) {
        logger.warn('Suivi de commande refusé', { orderId, userId: socket.userId });
        // « error » est un nom réservé côté client : un refus envoyé sous ce
        // nom n'arrive pas de façon fiable.
        socket.emit('acces-refuse', { salon: 'order', code: 'FORBIDDEN', orderId });
        return;
      }

      socket.join(`order-${orderId}`);
      logger.info('User joined order room', { orderId, socketId: socket.id });
    });

    socket.on('leave-order', (orderId: string) => {
      if (typeof orderId !== 'string' || !orderId) return;
      socket.leave(`order-${orderId}`);
    });

    socket.on('disconnect', () => {
      logger.info('User disconnected', { userId: socket.userId, socketId: socket.id });
    });

    socket.on('error', (error) => {
      logger.error('Socket error', { error, userId: socket.userId });
    });

    // Le jeton ne porte que l'identifiant : on résout l'e-mail une fois, à la
    // connexion, plutôt qu'à chaque notification envoyée.
    //
    // Après l'enregistrement des écouteurs, et non avant : attendre la base
    // ici laissait passer les premiers messages du client — celui-ci émet
    // dès « connect », et un événement sans écouteur est perdu, pas mis en
    // attente. Le suivi de commande ratait ainsi son salon par intermittence.
    if (socket.userId) {
      try {
        const utilisateur = await db.user.findUnique({
          where: { id: socket.userId },
          select: { email: true, isSuperOwner: true, isSystemAdmin: true },
        });

        if (utilisateur) {
          socket.data.email = utilisateur.email;
          socket.join(salonUtilisateur(utilisateur.email));

          // L'équipe de la plateforme reçoit les messages des livreurs en
          // direct, sur n'importe quel écran.
          if (utilisateur.isSuperOwner || utilisateur.isSystemAdmin) {
            socket.join(SALON_SUPPORT);
          }
        }
      } catch (err) {
        logger.error('Impossible de rattacher la connexion à un utilisateur', {
          socketId: socket.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  });

  return io;
}

/**
 * Pousse une notification à son destinataire, s'il est connecté.
 *
 * Sans cela la cloche n'était alimentée qu'au chargement de la page : il
 * fallait recharger pour voir arriver un nouveau message.
 */
export function emitNotification(recipientEmail: string, notification: unknown) {
  if (!io || !recipientEmail) return;

  io.to(salonUtilisateur(recipientEmail)).emit('notification', notification);
}

export function emitOrderUpdate(orderId: string, status: string, data?: any) {
  if (!io) return;

  io.to(`order-${orderId}`).emit('order-update', {
    orderId,
    status,
    timestamp: new Date().toISOString(),
    ...data,
  });

  void prevenirLaBoutique(orderId, { status });
}

export function emitDeliveryUpdate(orderId: string, data: any) {
  if (!io) return;

  io.to(`order-${orderId}`).emit('delivery-update', {
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
 * donc par le salon nominatif de chaque membre de l'organisation.
 */
export async function emitMerchantEvent(storeId: string, evenement: string, donnees: unknown) {
  if (!io || !storeId) return;

  try {
    const boutique = await db.store.findUnique({ where: { id: storeId }, select: { orgId: true } });
    if (!boutique) return;

    const membres = await db.membership.findMany({
      where: { orgId: boutique.orgId },
      select: { user: { select: { email: true } } },
    });

    for (const membre of membres) {
      io.to(salonUtilisateur(membre.user.email)).emit(evenement, donnees);
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
      select: { user: { select: { email: true } } },
    });

    for (const membre of membres) {
      io.to(salonUtilisateur(membre.user.email)).emit(evenement, donnees);
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
      select: { user: { select: { email: true } } },
    });

    for (const membre of membres) {
      io.to(salonUtilisateur(membre.user.email)).emit("compte-statut", {
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

  io.to(salonUtilisateur(email)).emit(evenement, donnees);
}

/** Pousse un événement à l'équipe support (superowners et admins système). */
export function emitSupportEvent(evenement: string, donnees: unknown) {
  if (!io) return;

  io.to(SALON_SUPPORT).emit(evenement, donnees);
}
