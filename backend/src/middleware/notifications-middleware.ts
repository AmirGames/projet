/**
 * Notifications Middleware
 *
 * Intégrer le service de notifications avec le système d'événements
 */

import { notificationsService } from '../services/notifications';
import { EventBroadcaster } from '../services/event-broadcaster';

/**
 * Intégrer les notifications avec les événements WebSocket
 */
export function setupNotificationsIntegration() {
  console.log('[Notifications] Integration setup complete');
}

/**
 * Helper pour envoyer des notifications à partir des services
 */
export async function notifyUserEvent(data: {
  userId: string;
  chauffeurId?: string;
  eventType: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  data?: Record<string, unknown>;
  actionUrl?: string;
}): Promise<void> {
  try {
    // Envoyer la notification
    await notificationsService.send({
      userId: data.userId,
      chauffeurId: data.chauffeurId,
      type: data.eventType,
      title: data.title,
      message: data.message,
      priority: data.priority,
      data: data.data,
      actionUrl: data.actionUrl,
    });

    // Émettre un événement WebSocket aussi
    EventBroadcaster.notificationCreated({
      userId: data.userId,
      notificationId: `notif-${Date.now()}`,
      type: data.eventType,
      title: data.title,
      message: data.message,
      priority: data.priority,
    });
  } catch (error) {
    console.error('[Notifications] Error sending notification:', error);
  }
}

/**
 * Notifier un utilisateur sur la complétion d'une course
 */
export async function notifyCourseCompleted(data: {
  userId: string;
  courseId: string;
  amount: number;
  passengerName: string;
}): Promise<void> {
  await notifyUserEvent({
    userId: data.userId,
    eventType: 'COURSE_COMPLETED',
    title: '🎉 Course completed',
    message: `You earned €${(data.amount / 100).toFixed(2)}`,
    priority: 'medium',
    data: {
      courseId: data.courseId,
      amount: data.amount,
      passengerName: data.passengerName,
    },
    actionUrl: '/driver/dashboard',
  });
}

/**
 * Notifier sur un changement de statut de payout
 */
export async function notifyPayoutStatus(data: {
  userId: string;
  payoutId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  amount: number;
  reason?: string;
}): Promise<void> {
  const titleMap = {
    PROCESSING: '⚙️ Payout processing',
    COMPLETED: '💰 Payout received',
    FAILED: '❌ Payout failed',
  };

  const messageMap = {
    PROCESSING: `€${(data.amount / 100).toFixed(2)} is being transferred`,
    COMPLETED: `€${(data.amount / 100).toFixed(2)} has been credited to your account`,
    FAILED: `Payout failed: ${data.reason || 'Unknown error'}`,
  };

  const priorityMap = {
    PROCESSING: 'medium' as const,
    COMPLETED: 'high' as const,
    FAILED: 'critical' as const,
  };

  await notifyUserEvent({
    userId: data.userId,
    eventType: `PAYOUT_${data.status}`,
    title: titleMap[data.status],
    message: messageMap[data.status],
    priority: priorityMap[data.status],
    data: {
      payoutId: data.payoutId,
      status: data.status,
      amount: data.amount,
    },
    actionUrl: '/driver/payouts',
  });
}

/**
 * Notifier sur un nouveau rating
 */
export async function notifyRatingReceived(data: {
  userId: string;
  rating: number;
  comment?: string;
  passengerName: string;
  courseId: string;
}): Promise<void> {
  await notifyUserEvent({
    userId: data.userId,
    eventType: 'RATING_RECEIVED',
    title: `⭐ ${data.rating}-star rating`,
    message: `${data.passengerName} rated your service`,
    priority: 'medium',
    data: {
      rating: data.rating,
      comment: data.comment,
      passengerName: data.passengerName,
      courseId: data.courseId,
    },
    actionUrl: '/driver/reputation/reviews',
  });
}

/**
 * Notifier sur une expiration de document
 */
export async function notifyDocumentExpiring(data: {
  userId: string;
  chauffeurId: string;
  documentType: string;
  daysUntilExpiry: number;
}): Promise<void> {
  const priority = data.daysUntilExpiry <= 5 ? 'high' : 'medium';

  await notifyUserEvent({
    userId: data.userId,
    chauffeurId: data.chauffeurId,
    eventType: 'DOCUMENT_EXPIRING',
    title: `📋 ${data.documentType} expires in ${data.daysUntilExpiry} days`,
    message: `Renew your ${data.documentType} before it expires`,
    priority,
    data: {
      documentType: data.documentType,
      daysUntilExpiry: data.daysUntilExpiry,
    },
    actionUrl: '/driver/documents',
  });
}

/**
 * Notifier un problème de conformité (admin)
 */
export async function notifyComplianceAlert(data: {
  userId: string;
  chauffeurId: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  score: number;
}): Promise<void> {
  const priorityMap = {
    LOW: 'low' as const,
    MEDIUM: 'medium' as const,
    HIGH: 'high' as const,
    CRITICAL: 'critical' as const,
  };

  await notifyUserEvent({
    userId: data.userId,
    chauffeurId: data.chauffeurId,
    eventType: 'COMPLIANCE_ALERT',
    title: `⚠️ ${data.riskLevel} compliance issue`,
    message: data.reason,
    priority: priorityMap[data.riskLevel],
    data: {
      chauffeurId: data.chauffeurId,
      riskLevel: data.riskLevel,
      score: data.score,
    },
    actionUrl: `/admin/drivers/${data.chauffeurId}`,
  });
}

/**
 * Notifier une suspension de compte
 */
export async function notifyAccountSuspended(data: {
  userId: string;
  chauffeurId: string;
  reason: string;
}): Promise<void> {
  await notifyUserEvent({
    userId: data.userId,
    chauffeurId: data.chauffeurId,
    eventType: 'ACCOUNT_SUSPENDED',
    title: '🚫 Account suspended',
    message: data.reason || 'Your account has been suspended. Please contact support.',
    priority: 'critical',
    data: {
      chauffeurId: data.chauffeurId,
    },
    actionUrl: '/support',
  });
}

export default {
  setupNotificationsIntegration,
  notifyUserEvent,
  notifyCourseCompleted,
  notifyPayoutStatus,
  notifyRatingReceived,
  notifyDocumentExpiring,
  notifyComplianceAlert,
  notifyAccountSuspended,
};
