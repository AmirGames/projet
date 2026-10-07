/**
 * ZupDrive Real-time Monitoring & Alerts Service
 *
 * Notifications en temps réel:
 * - Earnings updates après chaque course
 * - Payout status changes (PENDING → PROCESSING → COMPLETED)
 * - Driver performance alerts
 * - Compliance warnings
 * - Admin escalations
 *
 * Channels:
 * - Push notifications (mobile)
 * - Email summaries
 * - In-app notifications
 * - WebSocket (real-time dashboard)
 */

import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/api-error";
import { lireCommissionPourcentage, repartirPrixCourse } from "./commission-drive";

export type NotificationType =
  | "COURSE_COMPLETED"        // Course terminée, revenus ajoutes
  | "EARNINGS_UPDATED"        // Mise à jour des revenus
  | "PAYOUT_REQUESTED"        // Payout demandé
  | "PAYOUT_PROCESSING"       // Virement en cours
  | "PAYOUT_COMPLETED"        // Argent reçu
  | "PAYOUT_FAILED"           // Erreur de virement
  | "RATING_RECEIVED"         // Nouveau avis reçu
  | "REPUTATION_CHANGED"      // Changement de réputation
  | "BADGE_EARNED"            // Nouveau badge
  | "COMPLIANCE_WARNING"      // Alerte conformité
  | "DOCUMENT_APPROVED"       // Document validé
  | "DOCUMENT_REJECTED"       // Document rejeté
  | "DOCUMENT_EXPIRING"       // Document expirant bientôt
  | "SUSPENSION_WARNING"      // Avertissement suspension
  | "ACCOUNT_SUSPENDED"       // Compte suspendu
  | "INCENTIVE_AVAILABLE"     // Nouveau programme bonus
  | "ADMIN_ALERT";            // Alerte admin

export interface NotificationPayload {
  type: NotificationType;
  userId: string;
  chauffeurId?: string;
  title: string;
  message: string;
  data?: Prisma.InputJsonObject;
  priority: "low" | "medium" | "high" | "critical";
  actionUrl?: string;
}

export interface DriverMetrics {
  chauffeurId: string;
  reputationScore: number;
  earningsToday: number;
  earningsWeek: number;
  completionRate: number;
  cancellationRate: number;
  averageRating: number;
  coursesCompleted: number;
  pendingPayout: number;
  documentStatus: "COMPLETE" | "PENDING" | "ISSUES";
  complianceScore: number;
  badges: string[];
  status: "ACTIVE" | "WARNING" | "SUSPENDED" | "INACTIVE";
}

export const ZupDriveMonitoringService = {
  /**
   * Créer une notification
   */
  async createNotification(payload: NotificationPayload): Promise<string> {
    try {
      const notification = await db.notificationDrive.create({
        data: {
          userId: payload.userId,
          chauffeurId: payload.chauffeurId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          data: payload.data ?? {},
          priority: payload.priority,
          actionUrl: payload.actionUrl,
          read: false,
        },
      });

      // Envoyer via différents canaux selon la priorité
      await this.sendNotificationChannels(notification.id, payload);

      return notification.id;
    } catch (error) {
      console.error("Failed to create notification:", error);
      throw new ApiError(500, "Notification creation failed");
    }
  },

  /**
   * Envoyer notification via multiple channels
   */
  async sendNotificationChannels(
    notificationId: string,
    payload: NotificationPayload
  ): Promise<void> {
    const channels: Promise<void>[] = [];

    // Push notification (si priority >= medium)
    if (["medium", "high", "critical"].includes(payload.priority)) {
      channels.push(this.sendPushNotification(notificationId, payload));
    }

    // Email (si high ou critical)
    if (["high", "critical"].includes(payload.priority)) {
      channels.push(this.sendEmailNotification(notificationId, payload));
    }

    // WebSocket (always, pour real-time)
    channels.push(this.broadcastWebSocketNotification(notificationId, payload));

    await Promise.allSettled(channels);
  },

  /**
   * Envoyer push notification (mobile)
   */
  async sendPushNotification(
    _notificationId: string,
    payload: NotificationPayload
  ): Promise<void> {
    // TODO: Integration with Firebase Cloud Messaging or OneSignal
    // Placeholder for real implementation
    console.log(`[PUSH] ${payload.title}: ${payload.message}`);
  },

  /**
   * Envoyer email
   */
  async sendEmailNotification(
    _notificationId: string,
    payload: NotificationPayload
  ): Promise<void> {
    // TODO: Integration with email service (SendGrid, Mailgun)
    // Placeholder for real implementation
    console.log(`[EMAIL] To ${payload.userId}: ${payload.title}`);
  },

  /**
   * Broadcast WebSocket
   */
  async broadcastWebSocketNotification(
    _notificationId: string,
    payload: NotificationPayload
  ): Promise<void> {
    // TODO: WebSocket broadcast to connected clients
    // Placeholder for real implementation
    console.log(`[WS] Broadcasting ${payload.type} to ${payload.userId}`);
  },

  /**
   * Récupérer les notifications non lues
   */
  async getUnreadNotifications(userId: string, limit: number = 20) {
    return db.notificationDrive.findMany({
      where: {
        userId,
        read: false,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        priority: true,
        actionUrl: true,
        createdAt: true,
      },
    });
  },

  /**
   * Marquer notification comme lue
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await db.notificationDrive.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new ApiError(404, "Notification not found");
    }

    await db.notificationDrive.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
  },

  /**
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await db.notificationDrive.updateMany({
      where: {
        userId,
        read: false,
      },
      data: { read: true, readAt: new Date() },
    });

    return result.count;
  },

  /**
   * Note moyenne reçue par un chauffeur : moyenne des notes données par les
   * passagers (NoteCourseDrive). Sans note, la moyenne vaut 0 et le nombre 0.
   */
  async getNoteMoyenne(
    chauffeurId: string
  ): Promise<{ moyenne: number; nombre: number }> {
    const agg = await db.noteCourseDrive.aggregate({
      where: { chauffeurId, auteur: "PASSAGER" },
      _avg: { note: true },
      _count: { _all: true },
    });
    return { moyenne: agg._avg.note ?? 0, nombre: agg._count._all };
  },

  /**
   * Gains d'un chauffeur sur une période, en centimes entiers : prix de chaque
   * course terminée moins la commission plateforme arrondie course par course
   * (PlatformSettingsDrive "default", 20 % par défaut).
   */
  async getGainsChauffeur(
    chauffeurId: string,
    depuis: Date
  ): Promise<{ gainsCentimes: number; nombreCourses: number }> {
    const [pourcentage, courses] = await Promise.all([
      lireCommissionPourcentage(),
      db.courseDrive.findMany({
        where: { chauffeurId, statut: "TERMINEE", termineeLe: { gte: depuis } },
        select: { prixCentimes: true },
      }),
    ]);

    // Même règle d'arrondi que le paiement et les rapports (repartirPrixCourse).
    const gainsCentimes = courses.reduce(
      (somme, course) => somme + repartirPrixCourse(course.prixCentimes, pourcentage).chauffeurCentimes,
      0
    );
    return { gainsCentimes, nombreCourses: courses.length };
  },

  /**
   * Obtenir les métriques en temps réel d'un chauffeur
   */
  async getDriverMetrics(chauffeurId: string): Promise<DriverMetrics> {
    const debutJour = new Date(new Date().setHours(0, 0, 0, 0));
    const debutSemaine = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      chauffeur,
      earningsToday,
      earningsWeek,
      payouts,
      documentStatus,
      complianceReport,
      note,
    ] = await Promise.all([
      db.chauffeurDrive.findUnique({
        where: { id: chauffeurId },
        select: {
          id: true,
          statut: true,
          courses: { select: { statut: true } },
        },
      }),
      this.getGainsChauffeur(chauffeurId, debutJour),
      this.getGainsChauffeur(chauffeurId, debutSemaine),
      db.driverPayoutDrive.findFirst({
        where: {
          chauffeurId,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      }),
      this.getDocumentStatus(chauffeurId),
      this.getLatestComplianceReport(chauffeurId),
      this.getNoteMoyenne(chauffeurId),
    ]);

    if (!chauffeur) {
      throw new ApiError(404, "Driver not found");
    }

    // Calculer les taux
    const completedCourses = chauffeur.courses.filter((c) => c.statut === "TERMINEE").length;
    const totalCourses = chauffeur.courses.length;
    const cancelledCourses = chauffeur.courses.filter((c) => c.statut === "ANNULEE").length;

    const completionRate = totalCourses > 0 ? (completedCourses / totalCourses) * 100 : 0;
    const cancellationRate = totalCourses > 0 ? (cancelledCourses / totalCourses) * 100 : 0;

    // Déterminer le statut (un chauffeur sans aucune note n'est pas pénalisé)
    let status: "ACTIVE" | "WARNING" | "SUSPENDED" | "INACTIVE" = "ACTIVE";
    if (chauffeur.statut === "SUSPENDU") status = "SUSPENDED";
    else if ((note.nombre > 0 && note.moyenne < 3.0) || completionRate < 80) status = "WARNING";

    // Badges
    const badges = await this.getDriverBadges(chauffeurId);

    return {
      chauffeurId,
      reputationScore: Math.round(note.moyenne * 100) / 100,
      earningsToday: earningsToday.gainsCentimes,
      earningsWeek: earningsWeek.gainsCentimes,
      completionRate: Math.round(completionRate),
      cancellationRate: Math.round(cancellationRate),
      averageRating: note.moyenne,
      coursesCompleted: completedCourses,
      pendingPayout: payouts?.amountCentimes || 0,
      documentStatus,
      complianceScore: complianceReport?.complianceScore || 0,
      badges,
      status,
    };
  },

  /**
   * Obtenir le statut des documents
   */
  async getDocumentStatus(
    chauffeurId: string
  ): Promise<"COMPLETE" | "PENDING" | "ISSUES"> {
    const documents = await db.documentChauffeurDrive.findMany({
      where: { chauffeurId, archiveeLe: null },
      select: { statut: true },
    });

    if (documents.length === 0) return "PENDING";

    const allApproved = documents.every((d) => d.statut === "APPROVED");
    if (allApproved) return "COMPLETE";

    const hasRejected = documents.some((d) => d.statut === "REJECTED");
    if (hasRejected) return "ISSUES";

    return "PENDING";
  },

  /**
   * Obtenir le dernier rapport de conformité
   */
  async getLatestComplianceReport(chauffeurId: string) {
    return db.complianceReportDrive.findFirst({
      where: { chauffeurId },
      orderBy: { createdAt: "desc" },
      select: {
        complianceScore: true,
        riskLevel: true,
      },
    });
  },

  /**
   * Obtenir les badges du chauffeur
   */
  async getDriverBadges(chauffeurId: string): Promise<string[]> {
    const [chauffeur, note] = await Promise.all([
      db.chauffeurDrive.findUnique({
        where: { id: chauffeurId },
        select: {
          courses: { where: { statut: "TERMINEE" }, select: { id: true } },
        },
      }),
      this.getNoteMoyenne(chauffeurId),
    ]);

    if (!chauffeur) return [];

    const badges: string[] = [];
    const avgRating = note.moyenne;
    const coursesCount = chauffeur.courses.length;
    const ratingsCount = note.nombre;

    if (avgRating >= 4.8 && ratingsCount >= 50) badges.push("TOP_RATED");
    if (coursesCount >= 500) badges.push("EXPERIENCED");
    if (avgRating >= 4.5 && coursesCount >= 50) badges.push("RISING_STAR");
    if (avgRating >= 4.0 && ratingsCount >= 100) badges.push("PROFESSIONAL");

    return badges;
  },

  /**
   * Dashboard pour les admins - overview en temps réel
   */
  async getAdminDashboard() {
    const [
      activeDrivers,
      totalCourses,
      totalEarnings,
      pendingPayouts,
      complianceAlerts,
      suspendedDrivers,
    ] = await Promise.all([
      db.chauffeurDrive.count({ where: { statut: "VALIDE" } }),
      db.courseDrive.count({ where: { statut: "TERMINEE" } }),
      db.courseDrive.aggregate({
        where: { statut: "TERMINEE" },
        _sum: { prixCentimes: true },
      }),
      db.driverPayoutDrive.count({ where: { status: "PENDING" } }),
      db.complianceReportDrive.findMany({
        where: { riskLevel: { in: ["HIGH", "CRITICAL"] } },
        take: 10,
        select: {
          id: true,
          chauffeurId: true,
          riskLevel: true,
          createdAt: true,
        },
      }),
      db.chauffeurDrive.count({ where: { statut: "SUSPENDU" } }),
    ]);

    return {
      realtime: {
        activeDrivers,
        totalCourses,
        totalEarnings: totalEarnings._sum.prixCentimes || 0,
      },
      financials: {
        pendingPayouts,
      },
      compliance: {
        alertCount: complianceAlerts.length,
        alerts: complianceAlerts,
      },
      suspensions: {
        count: suspendedDrivers,
      },
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Générer une alerte si problème détecté
   */
  async checkAndAlertIssues(chauffeurId: string): Promise<void> {
    const metrics = await this.getDriverMetrics(chauffeurId);
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: { userId: true },
    });
    if (!chauffeur) {
      throw new ApiError(404, "Driver not found");
    }
    const userId = chauffeur.userId;
    const note = await this.getNoteMoyenne(chauffeurId);

    // Alerte: Faible rating (sans note reçue, rien à signaler)
    if (note.nombre > 0 && metrics.averageRating < 3.0) {
      await this.createNotification({
        type: "COMPLIANCE_WARNING",
        userId,
        chauffeurId,
        title: "⚠️ Low Rating Alert",
        message: `Your rating has dropped to ${metrics.averageRating}/5. Please improve service quality.`,
        priority: "high",
        data: { currentRating: metrics.averageRating },
      });
    }

    // Alerte: Taux d'annulation élevé
    if (metrics.cancellationRate > 15) {
      await this.createNotification({
        type: "COMPLIANCE_WARNING",
        userId,
        chauffeurId,
        title: "⚠️ High Cancellation Rate",
        message: `Your cancellation rate is ${metrics.cancellationRate}%. Improve reliability to avoid suspension.`,
        priority: "high",
        data: { cancellationRate: metrics.cancellationRate },
      });
    }

    // Alerte: Documents expirés ou non validés
    if (metrics.documentStatus !== "COMPLETE") {
      await this.createNotification({
        type: "DOCUMENT_EXPIRING",
        userId,
        chauffeurId,
        title: "📋 Document Action Required",
        message: "Some of your documents need attention. Please update them.",
        priority: "medium",
        actionUrl: "/dashboard/documents",
      });
    }
  },

  /**
   * Archive old notifications (> 30 days)
   */
  async archiveOldNotifications(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.notificationDrive.updateMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
        expiresAt: null,
      },
      data: {
        expiresAt: new Date(),
      },
    });

    return result.count;
  },

  /**
   * Get notifications stats for user
   */
  async getNotificationStats(userId: string) {
    const [total, unread, byType] = await Promise.all([
      db.notificationDrive.count({ where: { userId } }),
      db.notificationDrive.count({ where: { userId, read: false } }),
      db.notificationDrive.groupBy({
        by: ["type"],
        where: { userId, read: false },
        _count: true,
      }),
    ]);

    return {
      total,
      unread,
      byType: byType.map((t) => ({
        type: t.type,
        count: t._count,
      })),
    };
  },
};

/**
 * MONITORING FLOW EXPLIQUÉ
 *
 * Event-driven:
 * 1. Course completed
 *    ├─ Update earnings
 *    ├─ Create notification: "Course completed +€8.25"
 *    └─ Broadcast WebSocket to driver app
 *
 * 2. New rating received
 *    ├─ Calculate new reputation score
 *    ├─ Check for badge changes
 *    ├─ Create notification: "⭐ 5-star rating received"
 *    └─ Alert if reputation changed significantly
 *
 * 3. Payout status change
 *    ├─ PENDING → PROCESSING: "Payout in progress"
 *    ├─ PROCESSING → COMPLETED: "€X received in your account!"
 *    └─ PROCESSING → FAILED: "Payout failed. Update bank details."
 *
 * 4. Compliance issue detected
 *    ├─ Low rating: "Your rating is declining"
 *    ├─ High cancellations: "Improve your reliability"
 *    ├─ Expiring documents: "Update documents before deadline"
 *    └─ Critical issue: ALERT ADMIN
 *
 * NOTIFICATION PRIORITY
 * ┌─────────────┬──────────┬────────┬──────────┐
 * │ Priority    │ Push     │ Email  │ WebSocket│
 * ├─────────────┼──────────┼────────┼──────────┤
 * │ LOW         │ ❌       │ ❌     │ ✅       │
 * │ MEDIUM      │ ✅       │ ❌     │ ✅       │
 * │ HIGH        │ ✅       │ ✅     │ ✅       │
 * │ CRITICAL    │ ✅ (SMS) │ ✅     │ ✅       │
 * └─────────────┴──────────┴────────┴──────────┘
 */
