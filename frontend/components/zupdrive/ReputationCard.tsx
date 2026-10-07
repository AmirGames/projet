'use client';

import { useTranslations } from 'next-intl';

interface ReputationCardProps {
  score: number; // 0-100
  rating: number; // 1-5
  badges: string[];
  level: 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'FAIR' | 'POOR';
}

export function ReputationCard({ score, rating, badges, level }: ReputationCardProps) {
  const t = useTranslations('driver');

  const levelConfig = {
    EXCELLENT: { emoji: '⭐⭐⭐⭐⭐', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    VERY_GOOD: { emoji: '⭐⭐⭐⭐', color: 'text-blue-600', bg: 'bg-blue-50' },
    GOOD: { emoji: '⭐⭐⭐', color: 'text-green-600', bg: 'bg-green-50' },
    FAIR: { emoji: '⭐⭐', color: 'text-orange-600', bg: 'bg-orange-50' },
    POOR: { emoji: '⭐', color: 'text-red-600', bg: 'bg-red-50' },
  };

  const config = levelConfig[level];
  const badgeMap: { [key: string]: string } = {
    TOP_RATED: '⭐ Top Rated',
    CONSISTENT: '✓ Consistent',
    RELIABLE: '⏱️ Reliable',
    EXPERIENCED: '🚗 Experienced',
    RISING_STAR: '📈 Rising Star',
    PROFESSIONAL: '💼 Professional',
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{t('reputation')}</h3>
        <span className="text-2xl">⭐</span>
      </div>

      {/* Score Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-600">{t('score')}</p>
          <span className={`text-2xl font-bold ${config.color}`}>{score}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full ${config.color.replace('text', 'bg')}`}
            style={{ width: `${score}%` }}
          ></div>
        </div>
      </div>

      {/* Rating */}
      <div className={`rounded-lg p-4 mb-6 ${config.bg}`}>
        <p className="text-sm text-gray-600">{t('rating')}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${config.color}`}>{rating.toFixed(1)}/5</span>
          <span className="text-lg">{config.emoji}</span>
        </div>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase mb-3">{t('badges')}</p>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge}
                className="inline-block bg-gray-100 px-3 py-1 rounded-full text-xs font-semibold text-gray-700"
              >
                {badgeMap[badge] || badge}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
