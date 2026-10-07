'use client';

/**
 * Earnings Card - Real-time earnings display
 */

import { useTranslations } from 'next-intl';

interface EarningsCardProps {
  today: number; // cents
  week: number; // cents
  courses: {
    today: number;
    week: number;
  };
}

export function EarningsCard({ today, week, courses }: EarningsCardProps) {
  const t = useTranslations('driver');

  const formatCurrency = (cents: number) => {
    return `€${(cents / 100).toFixed(2)}`;
  };

  const avgPerCourse = courses.week > 0 ? Math.round(week / courses.week) : 0;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200 hover:shadow-lg transition-shadow">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{t('earnings')}</h3>
        <span className="text-2xl">💰</span>
      </div>

      {/* Today */}
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-600">{t('today')}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-gray-900">{formatCurrency(today)}</span>
          <span className="text-sm text-gray-500">
            {courses.today} {t('courses')}
          </span>
        </div>
      </div>

      {/* Week */}
      <div className="mb-6 border-t border-gray-200 pt-6">
        <p className="text-sm font-medium text-gray-600">{t('thisWeek')}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-blue-600">{formatCurrency(week)}</span>
          <span className="text-sm text-gray-500">
            {courses.week} {t('courses')}
          </span>
        </div>
      </div>

      {/* Average */}
      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-xs font-medium text-gray-600 uppercase">{t('averagePerCourse')}</p>
        <p className="mt-1 text-xl font-bold text-blue-600">{formatCurrency(avgPerCourse)}</p>
      </div>
    </div>
  );
}
