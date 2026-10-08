'use client';

import { useTranslations } from 'next-intl';

interface Notification {
  id: string;
  type: string;
  titre: string;
  message: string;
  priorite: 'low' | 'medium' | 'high' | 'critical';
  lue: boolean;
  createdAt: string;
  urlAction?: string;
}

interface NotificationsPanelProps {
  notifications: Notification[];
  unreadCount: number;
}

export function NotificationsPanel({ notifications, unreadCount }: NotificationsPanelProps) {
  const t = useTranslations('driver');

  const priorityConfig = {
    low: { bg: 'bg-gray-100', border: 'border-gray-300', icon: '💬' },
    medium: { bg: 'bg-blue-50', border: 'border-blue-300', icon: '📬' },
    high: { bg: 'bg-yellow-50', border: 'border-yellow-300', icon: '📢' },
    critical: { bg: 'bg-red-50', border: 'border-red-300', icon: '🚨' },
  };

  const typeEmoji: { [key: string]: string } = {
    COURSE_COMPLETED: '🎉',
    EARNINGS_UPDATED: '💰',
    PAYOUT_COMPLETED: '✅',
    PAYOUT_PROCESSING: '⚙️',
    PAYOUT_FAILED: '❌',
    RATING_RECEIVED: '⭐',
    REPUTATION_CHANGED: '📈',
    BADGE_EARNED: '🏆',
    DOCUMENT_APPROVED: '✅',
    DOCUMENT_REJECTED: '❌',
    DOCUMENT_EXPIRING: '📋',
    COMPLIANCE_WARNING: '⚠️',
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return t('justNow');
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">{t('notifications')}</h3>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-600 text-white text-xs font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <span className="text-2xl">🔔</span>
      </div>

      {notifications.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500">{t('noNotifications')}</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notifications.map((notif) => {
            const config = priorityConfig[notif.priorite];
            const emoji = typeEmoji[notif.type] || '📬';

            return (
              <div
                key={notif.id}
                className={`rounded-lg p-4 border-l-4 ${config.bg} ${config.border} ${!notif.lue ? 'ring-1 ring-blue-300' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-3 flex-1">
                    <span className="text-xl">{emoji}</span>
                    <div className="flex-1">
                      <p className={`font-semibold text-gray-900 ${!notif.lue ? 'font-bold' : ''}`}>
                        {notif.titre}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">{notif.message}</p>
                      <p className="mt-2 text-xs text-gray-500">{formatDate(notif.createdAt)}</p>
                    </div>
                  </div>
                  {notif.urlAction && (
                    <a
                      href={notif.urlAction}
                      className="ml-4 shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {t('view')} →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 border-t border-gray-200 pt-4">
        <a href="/driver/notifications" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          {t('viewAll')} →
        </a>
      </div>
    </div>
  );
}
