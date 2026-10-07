import { db } from "../../services/db";
import { io } from "../realtime/socket";
import { logger } from "../../config/logger";

/**
 * Événements temps réel ZupDrive.
 *
 * Chaque course a deux salons :
 * - `course-{courseId}` : suivi par passager et chauffeur (pour le chat/ETA)
 * - `driver-{driverId}-location` : localisation chauffeur (suivi GPS)
 *
 * Événements :
 * - driver-location: Position GPS du chauffeur en temps réel
 * - course-status: Changement d'état de la course
 * - eta-update: ETA mis à jour
 * - chat-message: Message chat passager ↔ chauffeur
 * - driver-arrived: Chauffeur arrivé au point de départ
 */

const salonCourse = (courseId: string) => `course-${courseId}`;
const salonLocalisationChauffeur = (driverId: string) => `driver-${driverId}-location`;

export class ZupDriveRealtimeService {
  /**
   * Le chauffeur met à jour sa position GPS en temps réel.
   * Broadcast au passager et à l'admin.
   */
  static async broadcastDriverLocation(
    driverId: string,
    courseId: string,
    latitude: number,
    longitude: number,
    accuracyMeters?: number
  ) {
    if (!io) return;

    const timestamp = new Date();

    // Broadcast position au chauffeur (pour tracking)
    await io
      .to(salonLocalisationChauffeur(driverId))
      .timeout(1000)
      .emitWithAck("driver-location", {
        driverId,
        courseId,
        latitude,
        longitude,
        accuracyMeters,
        timestamp: timestamp.toISOString(),
      })
      .catch((err) => logger.warn("Driver location broadcast failed", { driverId, err }));

    // Broadcast position au passager (dans le salon course)
    await io
      .to(salonCourse(courseId))
      .timeout(1000)
      .emitWithAck("driver-location-update", {
        driverId,
        latitude,
        longitude,
        timestamp: timestamp.toISOString(),
      })
      .catch((err) => logger.warn("Passenger location update failed", { courseId, err }));

    logger.debug("Driver location broadcasted", { driverId, courseId, lat: latitude, lng: longitude });
  }

  /**
   * Mise à jour du statut d'une course.
   * RECHERCHE → ACCEPTEE → ARRIVEE → EN_COURS → TERMINEE / ANNULEE
   */
  static async broadcastCourseStatus(
    courseId: string,
    statut: string,
    data?: {
      chauffeurId?: string;
      nomChauffeur?: string;
      plaqueVehicule?: string;
      motifAnnulation?: string;
    }
  ) {
    if (!io) return;

    await io
      .to(salonCourse(courseId))
      .timeout(1000)
      .emitWithAck("course-status", {
        courseId,
        statut,
        timestamp: new Date().toISOString(),
        ...data,
      })
      .catch((err) => logger.warn("Course status broadcast failed", { courseId, err }));

    logger.info("Course status broadcasted", { courseId, statut });
  }

  /**
   * ETA mis à jour basé sur la position chauffeur et l'itinéraire.
   * Appelé à chaque mise à jour GPS ou recalcul d'itinéraire.
   */
  static async broadcastEtaUpdate(
    courseId: string,
    etaSeconds: number,
    distanceMeters: number
  ) {
    if (!io) return;

    const etaTime = new Date(Date.now() + etaSeconds * 1000);

    await io
      .to(salonCourse(courseId))
      .timeout(1000)
      .emitWithAck("eta-update", {
        courseId,
        etaSeconds,
        etaTime: etaTime.toISOString(),
        distanceMeters,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => logger.warn("ETA update broadcast failed", { courseId, err }));

    logger.debug("ETA updated", { courseId, etaSeconds, distanceMeters });
  }

  /**
   * Chauffeur arrivé au point de départ.
   * Passager reçoit notification et peut descendre.
   */
  static async broadcastDriverArrived(courseId: string, driverId: string, nomChauffeur: string) {
    if (!io) return;

    await io
      .to(salonCourse(courseId))
      .timeout(1000)
      .emitWithAck("driver-arrived", {
        courseId,
        driverId,
        nomChauffeur,
        message: `${nomChauffeur} est arrivé(e) au point de départ.`,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => logger.warn("Driver arrived broadcast failed", { courseId, err }));

    logger.info("Driver arrived broadcasted", { courseId, driverId });
  }

  /**
   * Message chat dans une course.
   * Bidirectionnel: passager ↔ chauffeur.
   */
  static async broadcastChatMessage(
    courseId: string,
    _senderId: string,
    senderType: "passenger" | "driver",
    message: string
  ) {
    if (!io) return;

    // Personne ne voit les IDs internes, juste le type
    await io
      .to(salonCourse(courseId))
      .timeout(1000)
      .emitWithAck("chat-message", {
        courseId,
        senderType,
        message,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => logger.warn("Chat message broadcast failed", { courseId, err }));

    logger.debug("Chat message broadcasted", { courseId, senderType });
  }

  /**
   * Notification urgente (ex: chauffeur annule, problème).
   * Push + Chat + historique DB.
   */
  static async broadcastAlert(
    courseId: string,
    type: "driver-cancelled" | "system-issue" | "safety-report",
    message: string,
    data?: any
  ) {
    if (!io) return;

    await io
      .to(salonCourse(courseId))
      .timeout(1000)
      .emitWithAck("alert", {
        courseId,
        type,
        message,
        severity: type === "safety-report" ? "HIGH" : "MEDIUM",
        timestamp: new Date().toISOString(),
        ...data,
      })
      .catch((err) => logger.warn("Alert broadcast failed", { courseId, err }));

    logger.warn("Alert broadcasted", { courseId, type });
  }

  /**
   * Rejoindre le salon de suivi d'une course.
   * Appelé côté client pour écouter les mises à jour.
   */
  static async joinCourse(socketId: string, courseId: string, userId: string): Promise<boolean> {
    if (!io) return false;

    try {
      const course = await db.courseDrive.findUnique({ where: { id: courseId } });
      if (!course) return false;

      // Vérifier que l'utilisateur a le droit (passager ou chauffeur)
      const isPassenger = course.passagerId === userId;
      const isDriver = course.chauffeurId
        ? (await db.chauffeurDrive.findUnique({ where: { id: course.chauffeurId } }))?.userId === userId
        : false;

      if (!isPassenger && !isDriver) {
        logger.warn("Unauthorized course join attempt", { userId, courseId });
        return false;
      }

      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        await socket.join(salonCourse(courseId));

        // Si c'est le chauffeur, rejoindre aussi le salon localisation
        if (isDriver) {
          const chauffeur = await db.chauffeurDrive.findUnique({
            where: { userId },
          });
          if (chauffeur) {
            await socket.join(salonLocalisationChauffeur(chauffeur.id));
          }
        }
      }

      logger.info("Socket joined course", { socketId, courseId, isPassenger, isDriver });
      return true;
    } catch (err) {
      logger.error("Failed to join course", { socketId, courseId, err });
      return false;
    }
  }

  /**
   * Quitter le salon de suivi d'une course.
   */
  static async leaveCourse(socketId: string, courseId: string) {
    if (!io) return;

    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      await socket.leave(salonCourse(courseId));
      logger.info("Socket left course", { socketId, courseId });
    }
  }

  /**
   * Statistiques du système temps réel.
   */
  static getStats() {
    if (!io) return null;

    return {
      totalConnections: io.engine.clientsCount,
      activeRooms: io.sockets.adapter.rooms.size,
      uptime: Math.floor(process.uptime()),
    };
  }
}
