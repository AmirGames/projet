import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { logger } from './logger';
import { verifyToken } from '../middleware/auth';
import { AuthenticatedSocket } from '../types/socket';
import { db } from '../services/db';

// Les notifications sont adressées par e-mail : chaque connexion rejoint donc
// un salon nominatif, ce qui permet de la pousser au bon destinataire.
const salonUtilisateur = (email: string) => `user-${email.toLowerCase()}`;

/** Salon de l'équipe support de la plateforme (chat livreurs). */
const SALON_SUPPORT = 'support-livreurs';

/**
 * Salon de toute l'équipe de la plateforme : ses tableaux de bord portent sur
 * l'ensemble des commerçants, ils se tiennent donc à jour de tout.
 */
const SALON_PLATEFORME = 'plateforme';

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
            socket.join([SALON_SUPPORT, SALON_PLATEFORME]);
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
    logger.info('Temps réel : instances reliées par Redis');
    return true;
  } catch (err) {
    emetteur.destroy();
    recepteur.destroy();
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
 * L'événement ne porte aucune donnée, seulement ce qui a changé et où : chaque
 * écran se relit ensuite par l'API, qui applique ses propres droits. On peut
 * donc le diffuser largement sans rien divulguer.
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
        select: { user: { select: { email: true } } },
      });
      for (const membre of membres) salons.add(salonUtilisateur(membre.user.email));
    }

    const evenement = { ...modification, horodatage: new Date().toISOString() };

    if (salons.size > 0) {
      io.to([...salons]).emit('donnees-modifiees', evenement);
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
