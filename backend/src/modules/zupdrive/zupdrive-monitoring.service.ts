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

import { db } from "../../services/db";
import { ApiError } from "../../middleware/api-error";

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
  data?: Record<string, any>;
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
          titre: payload.title,
          message: payload.message,
          donnees: payload.data || {},
          priorite: payload.priority,
          urlAction: payload.actionUrl,
          lue: false,
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
  private async sendNotificationChannels(
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
  private async sendPushNotification(
    notificationId: string,
    payload: NotificationPayload
  ): Promise<void> {
    // TODO: Integration with Firebase Cloud Messaging or OneSignal
    // Placeholder for real implementation
    console.log(`[PUSH] ${payload.title}: ${payload.message}`);
  },

  /**
   * Envoyer email
   */
  private async sendEmailNotification(
    notificationId: string,
    payload: NotificationPayload
  ): Promise<void> {
    // TODO: Integration with email service (SendGrid, Mailgun)
    // Placeholder for real implementation
    console.log(`[EMAIL] To ${payload.userId}: ${payload.title}`);
  },

  /**
   * Broadcast WebSocket
   */
  private async broadcastWebSocketNotification(
    notificationId: string,
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
        lue: false,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        titre: true,
        message: true,
        donnees: true,
        priorite: true,
        urlAction: true,
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
      data: { lue: true },
    });
  },

  /**
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await db.notificationDrive.updateMany({
      where: {
        userId,
        lue: false,
      },
      data: { lue: true },
    });

    return result.count;
  },

  /**
   * Obtenir les métriques en temps réel d'un chauffeur
   */
  async getDriverMetrics(chauffeurId: string): Promise<DriverMetrics> {
    const [
      chauffeur,
      earningsToday,
      earningsWeek,
      payouts,
      documentStatus,
      complianceReport,
    ] = await Promise.all([
      db.chauffeurDrive.findUnique({
        where: { id: chauffeurId },
        select: {
          id: true,
          rating: true,
          statut: true,
          courses: true,
        },
      }),
      db.courseDrive.aggregate({
        where: {
          chauffeurId,
          statut: "COMPLETED",
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        _sum: { prixTotal: true },
      }),
      db.courseDrive.aggregate({
        where: {
          chauffeurId,
          statut: "COMPLETED",
          createdAt: {
            gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        _sum: { prixTotal: true },
      }),
      db.driverPayoutDrive.findFirst({
        where: {
          chauffeurId,
          statut: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      }),
      this.getDocumentStatus(chauffeurId),
      this.getLatestComplianceReport(chauffeurId),
    ]);

    if (!chauffeur) {
      throw new ApiError(404, "Driver not found");
    }

    // Calculer les taux
    const completedCourses = chauffeur.courses.filter((c) => c.statut === "COMPLETED").length;
    const totalCourses = chauffeur.courses.length;
    const cancelledCourses = chauffeur.courses.filter((c) => c.statut === "CANCELLED").length;

    const completionRate = totalCourses > 0 ? (completedCourses / totalCourses) * 100 : 0;
    const cancellationRate = totalCourses > 0 ? (cancelledCourses / totalCourses) * 100 : 0;

    // Déterminer le statut
    let status: "ACTIVE" | "WARNING" | "SUSPENDED" | "INACTIVE" = "ACTIVE";
    if (chauffeur.statut === "SUSPENDED") status = "SUSPENDED";
    else if (chauffeur.rating < 3.0 || completionRate < 80) status = "WARNING";

    // Badges
    const badges = await this.getDriverBadges(chauffeurId);

    return {
      chauffeurId,
      reputationScore: Math.round(chauffeur.rating * 100) / 100,
      earningsToday: earningsToday._sum.prixTotal || 0,
      earningsWeek: earningsWeek._sum.prixTotal || 0,
      completionRate: Math.round(completionRate),
      cancellationRate: Math.round(cancellationRate),
      averageRating: chauffeur.rating,
      coursesCompleted: completedCourses,
      pendingPayout: payouts?.montant || 0,
      documentStatus,
      complianceScore: complianceReport?.overallScore || 0,
      badges,
      status,
    };
  },

  /**
   * Obtenir le statut des documents
   */
  private async getDocumentStatus(
    chauffeurId: string
  ): Promise<"COMPLETE" | "PENDING" | "ISSUES"> {
    const documents = await db.documentChauffeurDrive.findMany({
      where: { chauffeurId },
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
  private async getLatestComplianceReport(chauffeurId: string) {
    return db.complianceReportDrive.findFirst({
      where: { chauffeurId },
      orderBy: { createdAt: "desc" },
      select: {
        overallScore: true,
        riskLevel: true,
      },
    });
  },

  /**
   * Obtenir les badges du chauffeur
   */
  private async getDriverBadges(chauffeurId: string): Promise<string[]> {
    const reputation = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: {
        rating: true,
        courses: { where: { statut: "COMPLETED" }, select: { id: true } },
        ratings: { select: { id: true } },
      },
    });

    if (!reputation) return [];

    const badges: string[] = [];
    const avgRating = reputation.rating;
    const coursesCount = reputation.courses.length;
    const ratingsCount = reputation.ratings.length;

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
      db.courseDrive.count({ where: { statut: "COMPLETED" } }),
      db.courseDrive.aggregate({
        _sum: { prixTotal: true },
      }),
      db.driverPayoutDrive.count({ where: { statut: "PENDING" } }),
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
      db.chauffeurDrive.count({ where: { statut: "SUSPENDED" } }),
    ]);

    return {
      realtime: {
        activeDrivers,
        totalCourses,
        totalEarnings: totalEarnings._sum.prixTotal || 0,
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

    // Alerte: Faible rating
    if (metrics.averageRating < 3.0) {
      await this.createNotification({
        type: "COMPLIANCE_WARNING",
        userId: "", // Will be fetched from chauffeurId
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
        userId: "",
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
        userId: "",
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
      },
      data: {
        archived: true,
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
      db.notificationDrive.count({ where: { userId, lue: false } }),
      db.notificationDrive.groupBy({
        by: ["type"],
        where: { userId, lue: false },
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
