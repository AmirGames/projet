'use client';

/**
 * Admin Dashboard Component
 * Platform monitoring, health, compliance, payouts, alerts
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AdminStatsPanel } from './AdminStatsPanel';
import { AdminAlertsPanel } from './AdminAlertsPanel';
import { AdminPayoutPanel } from './AdminPayoutPanel';

interface AdminDashboard {
  realtime: {
    activeDrivers: number;
    totalCourses: number;
    totalEarnings: number;
  };
  financials: {
    pendingPayouts: number;
  };
  compliance: {
    alertCount: number;
    alerts: Array<{
      id: string;
      chauffeurId: string;
      riskLevel: string;
      createdAt: string;
    }>;
  };
  suspensions: {
    count: number;
  };
  timestamp: string;
}

export function AdminDashboardClient() {
  const t = useTranslations('admin');
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
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

        const res = await fetch('/api/zupdrive/admin/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const { dashboard: data } = await res.json();
          setDashboard(data);
        } else {
          setError(t('unauthorized'));
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorFetching'));
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [t]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin">
          <div className="h-12 w-12 rounded-full border-4 border-gray-300 border-t-gray-900"></div>
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

  if (!dashboard) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">{t('noData')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white shadow-xs">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t('dashboard')}</h1>
              <p className="mt-1 text-sm text-gray-500">{t('platformOverview')}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{t('lastUpdate')}</p>
              <p className="font-semibold text-gray-900">
                {new Date(dashboard.timestamp).toLocaleTimeString('fr-FR')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Panel */}
        <AdminStatsPanel dashboard={dashboard} />

        {/* Alerts & Payouts Grid */}
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* Compliance Alerts */}
          <div className="lg:col-span-2">
            <AdminAlertsPanel alerts={dashboard.compliance.alerts} />
          </div>

          {/* Payouts */}
          <div>
            <AdminPayoutPanel pendingCount={dashboard.financials.pendingPayouts} />
          </div>
        </div>

        {/* Suspensions Warning */}
        {dashboard.suspensions.count > 0 && (
          <div className="mt-8 rounded-lg bg-red-50 p-6 ring-1 ring-red-200">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🚫</span>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">{t('suspendedDrivers')}</h3>
                <p className="mt-1 text-sm text-red-700">
                  {dashboard.suspensions.count} {t('drivers')} {t('currentlySuspended')}
                </p>
              </div>
              <a
                href="/admin/drivers?status=suspended"
                className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-white font-semibold hover:bg-red-700 transition-colors"
              >
                {t('review')} →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
