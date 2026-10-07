/**
 * Event Broadcaster
 *
 * Interface centralisée pour émettre des événements en temps réel
 * Intègre WebSocket, notifications, et autres canaux
 */

import { wsService } from './websocket';

export type EventType =
  | 'COURSE_COMPLETED'
  | 'EARNING_UPDATED'
  | 'RATING_RECEIVED'
  | 'REPUTATION_CHANGED'
  | 'BADGE_EARNED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_PENDING'
  | 'PAYOUT_PROCESSING'
  | 'PAYOUT_COMPLETED'
  | 'PAYOUT_FAILED'
  | 'NOTIFICATION_CREATED'
  | 'COMPLIANCE_ALERT'
  | 'DRIVER_STATUS_CHANGED'
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_REJECTED'
  | 'DOCUMENT_EXPIRING'
  | 'DASHBOARD_UPDATE';

export interface BroadcastPayload {
  type: EventType;
  userId?: string; // Pour envoyer à un utilisateur spécifique
  chauffeurId?: string;
  isAdminEvent?: boolean;
  data: Record<string, any>;
}

export class EventBroadcaster {
  /**
   * Émettre un événement
   */
  static broadcast(payload: BroadcastPayload): void {
    if (!wsService) {
      console.warn('[EventBroadcaster] WebSocket service not initialized');
      return;
    }

    const message = {
      type: payload.type,
      data: payload.data,
      timestamp: new Date().toISOString(),
    };

    // Envoyer à utilisateur spécifique
    if (payload.userId) {
      wsService.sendToUser(payload.userId, message);
      console.log(`[EventBroadcaster] Event ${payload.type} sent to ${payload.userId}`);
      return;
    }

    // Broadcast admin
    if (payload.isAdminEvent) {
      wsService.broadcastAdmins(message);
      console.log(`[EventBroadcaster] Admin event ${payload.type} broadcasted`);
      return;
    }

    // Broadcast général
    wsService.broadcastAll(message);
    console.log(`[EventBroadcaster] Event ${payload.type} broadcasted`);
  }

  /**
   * Émettre un événement de complétion de course
   */
  static courseCompleted(data: {
    userId: string;
    courseId: string;
    amount: number;
    passengerName: string;
    distance: number;
    duration: number;
  }): void {
    this.broadcast({
      type: 'COURSE_COMPLETED',
      userId: data.userId,
      data: {
        courseId: data.courseId,
        amount: data.amount,
        passengerName: data.passengerName,
        distance: data.distance,
        duration: data.duration,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de mise à jour des revenus
   */
  static earningUpdated(data: {
    userId: string;
    todayEarnings: number;
    weekEarnings: number;
    coursesToday: number;
  }): void {
    this.broadcast({
      type: 'EARNING_UPDATED',
      userId: data.userId,
      data: {
        todayEarnings: data.todayEarnings,
        weekEarnings: data.weekEarnings,
        coursesToday: data.coursesToday,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de rating reçu
   */
  static ratingReceived(data: {
    userId: string;
    rating: number;
    comment?: string;
    passengerName: string;
    courseId: string;
    tags?: string[];
  }): void {
    this.broadcast({
      type: 'RATING_RECEIVED',
      userId: data.userId,
      data: {
        rating: data.rating,
        comment: data.comment,
        passengerName: data.passengerName,
        courseId: data.courseId,
        tags: data.tags,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de changement de réputation
   */
  static reputationChanged(data: {
    userId: string;
    chauffeurId: string;
    newScore: number;
    oldScore: number;
    newRating: number;
    oldRating: number;
    level: string;
  }): void {
    this.broadcast({
      type: 'REPUTATION_CHANGED',
      userId: data.userId,
      chauffeurId: data.chauffeurId,
      data: {
        newScore: data.newScore,
        oldScore: data.oldScore,
        newRating: data.newRating,
        oldRating: data.oldRating,
        level: data.level,
        scoreChange: data.newScore - data.oldScore,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de badge gagné
   */
  static badgeEarned(data: {
    userId: string;
    chauffeurId: string;
    badgeName: string;
    badgeDescription: string;
  }): void {
    this.broadcast({
      type: 'BADGE_EARNED',
      userId: data.userId,
      chauffeurId: data.chauffeurId,
      data: {
        badgeName: data.badgeName,
        badgeDescription: data.badgeDescription,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de changement de statut de payout
   */
  static payoutStatusChanged(data: {
    userId: string;
    payoutId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    amount: number;
    reason?: string;
  }): void {
    this.broadcast({
      type: `PAYOUT_${data.status}`,
      userId: data.userId,
      data: {
        payoutId: data.payoutId,
        status: data.status,
        amount: data.amount,
        reason: data.reason,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de notification créée
   */
  static notificationCreated(data: {
    userId?: string;
    isAdminEvent?: boolean;
    notificationId: string;
    type: string;
    title: string;
    message: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }): void {
    this.broadcast({
      type: 'NOTIFICATION_CREATED',
      userId: data.userId,
      isAdminEvent: data.isAdminEvent,
      data: {
        notificationId: data.notificationId,
        notificationType: data.type,
        title: data.title,
        message: data.message,
        priority: data.priority,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre une alerte de conformité (admin)
   */
  static complianceAlert(data: {
    chauffeurId: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    reason: string;
    score: number;
  }): void {
    this.broadcast({
      type: 'COMPLIANCE_ALERT',
      isAdminEvent: true,
      data: {
        chauffeurId: data.chauffeurId,
        riskLevel: data.riskLevel,
        reason: data.reason,
        score: data.score,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un changement de statut de driver (admin)
   */
  static driverStatusChanged(data: {
    chauffeurId: string;
    status: 'VALIDE' | 'SUSPENDED' | 'BROUILLON';
    reason?: string;
  }): void {
    this.broadcast({
      type: 'DRIVER_STATUS_CHANGED',
      isAdminEvent: true,
      data: {
        chauffeurId: data.chauffeurId,
        status: data.status,
        reason: data.reason,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre une mise à jour du dashboard (admin)
   */
  static dashboardUpdate(data: {
    activeDrivers: number;
    totalCourses: number;
    totalEarnings: number;
    alertCount: number;
    suspendedCount: number;
  }): void {
    this.broadcast({
      type: 'DASHBOARD_UPDATE',
      isAdminEvent: true,
      data: {
        activeDrivers: data.activeDrivers,
        totalCourses: data.totalCourses,
        totalEarnings: data.totalEarnings,
        alertCount: data.alertCount,
        suspendedCount: data.suspendedCount,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de document approuvé
   */
  static documentApproved(data: {
    userId: string;
    chauffeurId: string;
    documentType: string;
    documentId: string;
  }): void {
    this.broadcast({
      type: 'DOCUMENT_APPROVED',
      userId: data.userId,
      chauffeurId: data.chauffeurId,
      data: {
        documentType: data.documentType,
        documentId: data.documentId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Émettre un événement de document expirant bientôt
   */
  static documentExpiring(data: {
    userId: string;
    chauffeurId: string;
    documentType: string;
    expirationDate: Date;
    daysUntilExpiry: number;
  }): void {
    this.broadcast({
      type: 'DOCUMENT_EXPIRING',
      userId: data.userId,
      chauffeurId: data.chauffeurId,
      data: {
        documentType: data.documentType,
        expirationDate: data.expirationDate.toISOString(),
        daysUntilExpiry: data.daysUntilExpiry,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

export default EventBroadcaster;
