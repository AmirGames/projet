'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Store, ShoppingCart, Users, TrendingUp, AlertCircle, Package } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StatsData {
  merchants: { total: number; active: number; suspended: number };
  stores: { total: number; active: number };
  orders: { total: number; pending: number; completed: number };
  revenue: { total: number; completed: number };
  users: { total: number };
  customers: { total: number };
  payments: { pending: number; successful: number };
  products: { total: number; draft: number };
  tickets: { open: number; critical: number };
  config: { platformFeePercent: number; maintenanceMode: boolean };
}

export default function SuperOwnerDashboard() {
  const t = useTranslations('adminSuperOwner');
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 403) {
          router.push('/dashboard');
          return;
        }
        throw new Error('Failed to load stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-white">{t('loading')}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-white">{t('accessDenied')}</p>
      </div>
    );
  }

  const platformFeePercent = stats.config.platformFeePercent;
  const platformCommission = stats.revenue.total * (platformFeePercent / 100);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-blue-400 hover:text-blue-300">
            <ArrowLeft size={20} /> {t('back')}
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-gray-400 text-sm">{t('subtitle')}</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Alert if maintenance mode */}
        {stats.config.maintenanceMode && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle size={20} className="text-yellow-300" />
            <span className="text-yellow-300">{t('maintenanceAlert')}</span>
          </div>
        )}

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Merchants */}
          <div className="bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-300 text-sm">{t('merchantsLabel')}</p>
                <p className="text-4xl font-bold mt-2">{stats.merchants.total}</p>
                <p className="text-blue-300 text-xs mt-2">🟢 {stats.merchants.active} {t('merchantsActive')}</p>
              </div>
              <Store size={40} className="text-blue-400 opacity-50" />
            </div>
          </div>

          {/* Stores */}
          <div className="bg-gradient-to-br from-green-900 to-green-800 border border-green-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-300 text-sm">{t('storesLabel')}</p>
                <p className="text-4xl font-bold mt-2">{stats.stores.total}</p>
                <p className="text-green-300 text-xs mt-2">🟢 {stats.stores.active} {t('storesOpen')}</p>
              </div>
              <ShoppingCart size={40} className="text-green-400 opacity-50" />
            </div>
          </div>

          {/* Total Customers */}
          <div className="bg-gradient-to-br from-purple-900 to-purple-800 border border-purple-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-300 text-sm">{t('customersLabel')}</p>
                <p className="text-4xl font-bold mt-2">{stats.customers.total}</p>
                <p className="text-purple-300 text-xs mt-2">{t('customersDesc')}</p>
              </div>
              <Users size={40} className="text-purple-400 opacity-50" />
            </div>
          </div>

          {/* Total Revenue */}
          <div className="bg-gradient-to-br from-yellow-900 to-yellow-800 border border-yellow-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-300 text-sm">{t('revenueLabel')}</p>
                <p className="text-4xl font-bold mt-2">{euro(stats.revenue.total)}</p>
                <p className="text-yellow-300 text-xs mt-2">{t('revenueDesc')}</p>
              </div>
              <TrendingUp size={40} className="text-yellow-400 opacity-50" />
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Orders */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <BarChart3 size={20} /> {t('ordersTitle')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('ordersTotal')}</span>
                <span className="font-bold">{stats.orders.total}</span>
              </div>
              <div className="flex justify-between text-yellow-400">
                <span className="text-gray-400">{t('ordersPending')}</span>
                <span className="font-bold">{stats.orders.pending}</span>
              </div>
              <div className="flex justify-between text-green-400">
                <span className="text-gray-400">{t('ordersCompleted')}</span>
                <span className="font-bold">{stats.orders.completed}</span>
              </div>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <TrendingUp size={20} /> {t('revenueTitle')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('revenueBrut')}</span>
                <span className="font-bold">{euro(stats.revenue.total)}</span>
              </div>
              <div className="flex justify-between text-green-400">
                <span className="text-gray-400">{t('revenueCompleted')}</span>
                <span className="font-bold">{euro(stats.revenue.completed)}</span>
              </div>
              <div className="flex justify-between text-orange-400">
                <span className="text-gray-400">{t('commission', { platformFeePercent })}</span>
                <span className="font-bold">{euro(platformCommission)}</span>
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Package size={20} /> {t('productsTitle')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('ordersTotal')}</span>
                <span className="font-bold">{stats.products.total}</span>
              </div>
              <div className="flex justify-between text-yellow-400">
                <span className="text-gray-400">{t('productsDraft')}</span>
                <span className="font-bold">{stats.products.draft}</span>
              </div>
              <div className="flex justify-between text-green-400">
                <span className="text-gray-400">{t('productsActive')}</span>
                <span className="font-bold">{stats.products.total - stats.products.draft}</span>
              </div>
            </div>
          </div>

          {/* Payments */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4">{t('paymentsTitle')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-green-400">
                <span className="text-gray-400">{t('paymentsSuccess')}</span>
                <span className="font-bold">{stats.payments.successful}</span>
              </div>
              <div className="flex justify-between text-yellow-400">
                <span className="text-gray-400">{t('paymentsPending')}</span>
                <span className="font-bold">{stats.payments.pending}</span>
              </div>
            </div>
          </div>

          {/* Users */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4">{t('usersTitle')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('usersTotal')}</span>
                <span className="font-bold">{stats.users.total}</span>
              </div>
              <div className="flex justify-between text-gray-500 text-sm">
                <span>{t('usersDesc')}</span>
              </div>
            </div>
          </div>

          {/* Support Tickets */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <AlertCircle size={20} /> {t('ticketsTitle')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-yellow-400">
                <span className="text-gray-400">{t('ticketsOpen')}</span>
                <span className="font-bold">{stats.tickets.open}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span className="text-gray-400">{t('ticketsCritical')}</span>
                <span className="font-bold">{stats.tickets.critical}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="font-bold text-lg mb-4">{t('quickActionsTitle')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/admin/merchants" className="bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-lg text-center font-medium transition">
              {t('manageMerchants')}
            </Link>
            <Link href="/admin/stores" className="bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg text-center font-medium transition">
              {t('manageStores')}
            </Link>
            <Link href="/admin/orders" className="bg-purple-600 hover:bg-purple-700 px-4 py-3 rounded-lg text-center font-medium transition">
              {t('viewOrders')}
            </Link>
            <Link href="/admin/tickets" className="bg-yellow-600 hover:bg-yellow-700 px-4 py-3 rounded-lg text-center font-medium transition">
              {t('supportTickets')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
