'use client';

/**
 * Driver Dashboard Component
 * Real-time earnings, notifications, metrics, payouts
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EarningsCard } from './EarningsCard';
import { MetricsCard } from './MetricsCard';
import { NotificationsPanel } from './NotificationsPanel';
import { PayoutCard } from './PayoutCard';
import { ReputationCard } from './ReputationCard';

interface DriverMetrics {
  reputationScore: number;
  earningsToday: number;
  earningsWeek: number;
  completionRate: number;
  cancellationRate: number;
  averageRating: number;
  coursesCompleted: number;
  pendingPayout: number;
  documentStatus: 'COMPLETE' | 'PENDING' | 'ISSUES';
  complianceScore: number;
  badges: string[];
  status: 'ACTIVE' | 'WARNING' | 'SUSPENDED' | 'INACTIVE';
}

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

export function DriverDashboardClient() {
  const t = useTranslations('driver');
  const [metrics, setMetrics] = useState<DriverMetrics | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [earnings, setEarnings] = useState({ today: 0, week: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setError(t('notAuthenticated'));
          return;
        }

        // Fetch metrics
        const metricsRes = await fetch('/api/zupdrive/metrics', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (metricsRes.ok) {
          const { metrics } = await metricsRes.json();
          setMetrics(metrics);
        }

        // Fetch notifications
        const notifRes = await fetch('/api/zupdrive/notifications?limit=10', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (notifRes.ok) {
          const { notifications } = await notifRes.json();
          setNotifications(notifications);
        }

        // Fetch real-time earnings
        const earningsRes = await fetch('/api/zupdrive/earnings-realtime', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (earningsRes.ok) {
          const { earnings } = await earningsRes.json();
          setEarnings({
            today: earnings.today.amount,
            week: earnings.week.amount,
          });
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorFetching'));
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [t]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin">
          <div className="h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-red-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-900">{t('error')}</h1>
          <p className="mt-2 text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">{t('noData')}</p>
      </div>
    );
  }

  // Status indicator
  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    WARNING: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
  };

  const statusEmoji = {
    ACTIVE: '✅',
    WARNING: '⚠️',
    SUSPENDED: '🚨',
    INACTIVE: '⏸️',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t('dashboard')}</h1>
              <p className="mt-1 text-sm text-gray-500">{t('welcomeDriver')}</p>
            </div>
            <div className={`rounded-full px-4 py-2 text-sm font-semibold ${statusColors[metrics.status]}`}>
              {statusEmoji[metrics.status as keyof typeof statusEmoji]} {t(`status.${metrics.status.toLowerCase()}`)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Row: Earnings & Payout */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <EarningsCard
            today={earnings.today}
            week={earnings.week}
            courses={{
              today: metrics.coursesCompleted > 0 ? Math.floor(metrics.coursesCompleted / 7) : 0,
              week: metrics.coursesCompleted,
            }}
          />
          <PayoutCard
            amount={metrics.pendingPayout}
            status="pending"
            nextPayoutDate={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)}
          />
          <ReputationCard
            score={metrics.reputationScore}
            rating={metrics.averageRating}
            badges={metrics.badges}
            level={
              metrics.reputationScore >= 90
                ? 'EXCELLENT'
                : metrics.reputationScore >= 80
                  ? 'VERY_GOOD'
                  : metrics.reputationScore >= 70
                    ? 'GOOD'
                    : metrics.reputationScore >= 50
                      ? 'FAIR'
                      : 'POOR'
            }
          />
        </div>

        {/* Middle Row: Metrics Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <MetricsCard
            label={t('completionRate')}
            value={`${metrics.completionRate}%`}
            icon="✓"
            color="green"
            status={metrics.completionRate >= 95 ? 'excellent' : metrics.completionRate >= 80 ? 'good' : 'warning'}
          />
          <MetricsCard
            label={t('cancellationRate')}
            value={`${metrics.cancellationRate}%`}
            icon="✕"
            color="red"
            status={metrics.cancellationRate <= 2 ? 'excellent' : metrics.cancellationRate <= 10 ? 'good' : 'warning'}
          />
          <MetricsCard
            label={t('compliance')}
            value={`${metrics.complianceScore}/100`}
            icon="⚖️"
            color="blue"
            status={metrics.complianceScore >= 90 ? 'excellent' : metrics.complianceScore >= 70 ? 'good' : 'warning'}
          />
          <MetricsCard
            label={t('documents')}
            value={t(`docStatus.${metrics.documentStatus.toLowerCase()}`)}
            icon="📄"
            color="purple"
            status={metrics.documentStatus === 'COMPLETE' ? 'excellent' : metrics.documentStatus === 'PENDING' ? 'warning' : 'danger'}
          />
        </div>

        {/* Bottom Row: Notifications */}
        <div>
          <NotificationsPanel
            notifications={notifications}
            unreadCount={notifications.filter((n) => !n.lue).length}
          />
        </div>
      </div>
    </div>
  );
}
