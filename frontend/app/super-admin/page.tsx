'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Users, ShoppingCart, TrendingUp, AlertCircle } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Stats {
  merchants: { total: number; active: number; suspended: number };
  stores: { total: number; active: number };
  orders: { total: number; pending: number; completed: number };
  revenue: { total: number; completed: number };
  tickets: { open: number; critical: number };
  config: { platformFeePercent: number; maintenanceMode: boolean };
}

export default function SuperAdminDashboard() {
  const t = useTranslations('superadminDashboard');
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        router.push('/login');
        return;
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    console.log("Super-admin page loaded, token exists:", !!token);

    if (!token) {
      console.log("No token, redirecting to login");
      router.push('/login');
      return;
    }

    fetchStats();
  }, [router, fetchStats]);

  if (loading)
    return <div className="text-center py-8">{t('loading')}</div>;

  if (!stats)
    return <div className="text-center py-8 text-red-400">{t('accessDenied')}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      {/* Maintenance Mode Alert */}
      {stats.config.maintenanceMode && (
        <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle size={20} className="text-yellow-400" />
          <span className="text-yellow-400">{t('maintenanceEnabled')}</span>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Merchants */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('activeMerchants')}</p>
            <Users size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold">{stats.merchants.active}</p>
          <p className="text-sm text-gray-400 mt-2">{t('outOf')} {stats.merchants.total} {t('total')}</p>
        </div>

        {/* Stores */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('stores')}</p>
            <ShoppingCart size={20} className="text-green-500" />
          </div>
          <p className="text-3xl font-bold">{stats.stores.total}</p>
          <p className="text-sm text-gray-400 mt-2">{t('of')} {stats.stores.active} {t('open')}</p>
        </div>

        {/* Orders */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('orders')}</p>
            <TrendingUp size={20} className="text-purple-500" />
          </div>
          <p className="text-3xl font-bold">{stats.orders.total}</p>
          <p className="text-sm text-gray-400 mt-2">{t('total')}</p>
        </div>

        {/* Revenue */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('revenue')}</p>
            <TrendingUp size={20} className="text-yellow-500" />
          </div>
          <p className="text-3xl font-bold">{euro(stats.revenue.total)}</p>
          <p className="text-sm text-gray-400 mt-2">{t('commission')} {stats.config.platformFeePercent}%</p>
        </div>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Suspended Merchants */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500" />
            {t('suspendedMerchants')}
          </h2>
          <p className="text-3xl font-bold text-red-400">{stats.merchants.suspended}</p>
          <p className="text-sm text-gray-400 mt-2">{t('investigate')}</p>
        </div>

        {/* Open Tickets */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-orange-500" />
            {t('supportPending')}
          </h2>
          <p className="text-3xl font-bold text-orange-400">{stats.tickets.open}</p>
          <p className="text-sm text-gray-400 mt-2">{t('openTickets')}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">{t('quickActions')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/super-admin/merchants"
            className="block p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-center font-medium"
          >
            {t('manageMerchants')}
          </Link>
          <Link
            href="/super-admin/tickets"
            className="block p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-center font-medium"
          >
            {t('viewSupport')}
          </Link>
          <Link
            href="/super-admin/settings"
            className="block p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-center font-medium"
          >
            {t('systemSettings')}
          </Link>
        </div>
      </div>
    </div>
  );
}
