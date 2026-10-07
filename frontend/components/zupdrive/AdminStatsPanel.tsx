'use client';

import { useTranslations } from 'next-intl';

interface AdminStatsPanelProps {
  dashboard: {
    realtime: {
      activeDrivers: number;
      totalCourses: number;
      totalEarnings: number;
    };
    compliance: {
      alertCount: number;
    };
    suspensions: {
      count: number;
    };
  };
}

export function AdminStatsPanel({ dashboard }: AdminStatsPanelProps) {
  const t = useTranslations('admin');

  const formatCurrency = (cents: number) => `€${(cents / 100).toFixed(0)}K`;

  const stats = [
    {
      label: t('activeDrivers'),
      value: dashboard.realtime.activeDrivers,
      emoji: '👨‍💼',
      color: 'blue',
    },
    {
      label: t('totalCourses'),
      value: dashboard.realtime.totalCourses.toLocaleString(),
      emoji: '🚗',
      color: 'green',
    },
    {
      label: t('platformRevenue'),
      value: formatCurrency(dashboard.realtime.totalEarnings),
      emoji: '💰',
      color: 'purple',
    },
    {
      label: t('complianceAlerts'),
      value: dashboard.compliance.alertCount,
      emoji: '⚠️',
      color: dashboard.compliance.alertCount > 0 ? 'red' : 'gray',
    },
  ];

  const colorMap = {
    blue: 'bg-blue-50 ring-blue-200',
    green: 'bg-green-50 ring-green-200',
    purple: 'bg-purple-50 ring-purple-200',
    red: 'bg-red-50 ring-red-200',
    gray: 'bg-gray-50 ring-gray-200',
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-xl p-6 ring-1 bg-white ${colorMap[stat.color as keyof typeof colorMap]}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold text-gray-900">{stat.value}</p>
            </div>
            <span className="text-3xl">{stat.emoji}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
