'use client';

import { useTranslations } from 'next-intl';

interface AdminPayoutPanelProps {
  pendingCount: number;
}

export function AdminPayoutPanel({ pendingCount }: AdminPayoutPanelProps) {
  const t = useTranslations('admin');

  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-gray-200">
      <h3 className="mb-6 text-lg font-semibold text-gray-900">{t('payouts')}</h3>

      <div className={`rounded-lg p-6 ${pendingCount > 0 ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-green-50 ring-1 ring-green-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{t('pendingPayouts')}</p>
            <p className="mt-2 text-4xl font-bold text-gray-900">{pendingCount}</p>
          </div>
          <span className="text-5xl">
            {pendingCount > 0 ? '⏳' : '✅'}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <button className="w-full rounded-lg bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700 transition-colors">
          {t('processPending')} ({pendingCount})
        </button>
        <a
          href="/admin/payouts"
          className="block rounded-lg bg-gray-100 px-4 py-3 text-center font-semibold text-gray-900 hover:bg-gray-200 transition-colors"
        >
          {t('viewPayoutHistory')}
        </a>
      </div>

      {pendingCount > 0 && (
        <div className="mt-6 rounded-lg bg-yellow-50 p-4 text-sm border-l-4 border-yellow-400">
          <p className="font-semibold text-yellow-900">⚠️ {t('pendingPayoutWarning')}</p>
          <p className="mt-1 text-yellow-700">
            {t('nextPayoutCycle')}: Monday 06:00 UTC
          </p>
        </div>
      )}
    </div>
  );
}
