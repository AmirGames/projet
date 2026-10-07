'use client';

import { useTranslations } from 'next-intl';

interface Alert {
  id: string;
  chauffeurId: string;
  riskLevel: string;
  createdAt: string;
}

interface AdminAlertsPanelProps {
  alerts: Alert[];
}

export function AdminAlertsPanel({ alerts }: AdminAlertsPanelProps) {
  const t = useTranslations('admin');

  const riskConfig = {
    CRITICAL: { color: 'bg-red-100 text-red-800 border-red-300', emoji: '🔴' },
    HIGH: { color: 'bg-orange-100 text-orange-800 border-orange-300', emoji: '🟠' },
    MEDIUM: { color: 'bg-yellow-100 text-yellow-800 border-yellow-300', emoji: '🟡' },
    LOW: { color: 'bg-blue-100 text-blue-800 border-blue-300', emoji: '🔵' },
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-gray-200">
      <h3 className="mb-6 text-lg font-semibold text-gray-900">{t('complianceAlerts')}</h3>

      {alerts.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500">✅ {t('noAlerts')}</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {alerts.map((alert) => {
            const config = riskConfig[alert.riskLevel as keyof typeof riskConfig] || riskConfig.LOW;

            return (
              <div key={alert.id} className={`rounded-lg border-l-4 p-4 ${config.color}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold">
                      {config.emoji} {alert.riskLevel}
                    </p>
                    <p className="mt-1 text-sm opacity-80">{t('driver')}: {alert.chauffeurId}</p>
                    <p className="mt-1 text-xs opacity-60">{formatDate(alert.createdAt)}</p>
                  </div>
                  <a
                    href={`/admin/drivers/${alert.chauffeurId}`}
                    className="flex-shrink-0 ml-4 font-semibold hover:underline"
                  >
                    {t('review')} →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 border-t border-gray-200 pt-4">
        <a href="/admin/alerts" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          {t('viewAll')} →
        </a>
      </div>
    </div>
  );
}
