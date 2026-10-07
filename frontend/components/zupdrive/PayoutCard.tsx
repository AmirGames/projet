'use client';

import { useTranslations } from 'next-intl';

interface PayoutCardProps {
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  nextPayoutDate: Date;
}

export function PayoutCard({ amount, status, nextPayoutDate }: PayoutCardProps) {
  const t = useTranslations('driver');

  const formatCurrency = (cents: number) => `€${(cents / 100).toFixed(2)}`;

  const statusConfig = {
    pending: { icon: '⏳', color: 'yellow', label: 'pending' },
    processing: { icon: '⚙️', color: 'blue', label: 'processing' },
    completed: { icon: '✅', color: 'green', label: 'completed' },
    failed: { icon: '❌', color: 'red', label: 'failed' },
  };

  const config = statusConfig[status];
  const colorMap = {
    yellow: 'bg-yellow-50 text-yellow-800',
    blue: 'bg-blue-50 text-blue-800',
    green: 'bg-green-50 text-green-800',
    red: 'bg-red-50 text-red-800',
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{t('nextPayout')}</h3>
        <span className="text-2xl">💳</span>
      </div>

      <div className={`rounded-lg p-4 mb-6 ${colorMap[config.color as keyof typeof colorMap]}`}>
        <p className="text-sm font-medium">{config.icon} {t(`payoutStatus.${config.label}`)}</p>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600">{t('amount')}</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">{formatCurrency(amount)}</p>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-xs text-gray-500">{t('nextPayoutOn')}</p>
        <p className="mt-1 font-semibold text-gray-900">
          {nextPayoutDate.toLocaleDateString('fr-FR', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
    </div>
  );
}
