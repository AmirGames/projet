'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { TrendingUp, Calendar, DollarSign, ShoppingCart, Users, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCurrentStore } from '@/lib/current-store';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { montantCommercant } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Order {
  id: string;
  totalAmount: number | string;
  feesAmount?: number | string;
  serviceFeeAmount?: number | string;
  status: string;
  createdAt: string;
}

interface AnalyticsData {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
  pendingOrders: number;
  completedOrders: number;
  rejectedOrders: number;
  dailyRevenue: { date: string; revenue: number }[];
  statusBreakdown: { status: string; count: number }[];
}

export default function AnalyticsPage() {
  const t = useTranslations('merchantAnalytics');
  const { storeId } = useCurrentStore();

  // Les montants sont déjà en euros : aucune division par 100.
  const euro = (valeur: number, decimales = 2) =>
    Number(valeur || 0).toLocaleString('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    });

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30');

  const fetchAnalytics = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/orders?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const orders: Order[] = data.orders || [];

        const now = new Date();
        const daysAgo = parseInt(timeRange);
        const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const ordersInRange = orders.filter(o => new Date(o.createdAt) >= startDate);
        const ordersThisMonth = orders.filter(o => new Date(o.createdAt) >= thisMonthStart);

        const totalRevenue = orders.reduce((sum, o) => sum + montantCommercant(o), 0);
        const revenueThisMonth = ordersThisMonth.reduce((sum, o) => sum + montantCommercant(o), 0);

        const statusBreakdown = [
          { status: 'PENDING', count: orders.filter(o => o.status === 'PENDING').length },
          { status: 'ACCEPTED', count: orders.filter(o => o.status === 'ACCEPTED').length },
          { status: 'READY', count: orders.filter(o => o.status === 'READY').length },
          { status: 'COMPLETED', count: orders.filter(o => o.status === 'COMPLETED').length },
          { status: 'REJECTED', count: orders.filter(o => o.status === 'REJECTED').length },
        ];

        const dailyData: { [key: string]: number } = {};
        ordersInRange.forEach(order => {
          const date = new Date(order.createdAt).toLocaleDateString('fr-FR');
          dailyData[date] = (dailyData[date] || 0) + montantCommercant(order);
        });

        const dailyRevenue = Object.entries(dailyData).map(([date, revenue]) => ({
          date,
          revenue,
        }));

        setAnalytics({
          totalOrders: orders.length,
          totalRevenue,
          averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
          ordersThisMonth: ordersThisMonth.length,
          revenueThisMonth,
          pendingOrders: orders.filter(o => o.status === 'PENDING').length,
          completedOrders: orders.filter(o => o.status === 'COMPLETED').length,
          rejectedOrders: orders.filter(o => o.status === 'REJECTED').length,
          dailyRevenue,
          statusBreakdown,
        });
      }
    } catch (error) {
      signalerErreur('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [storeId, timeRange]);

  useEffectChargement(() => {
    if (storeId) {
      fetchAnalytics();
    }
  }, [storeId, timeRange, fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-gray-900">
        <div className="text-center py-12">
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-gray-500 mt-1">{t('description')}</p>
          </div>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded text-gray-900 focus:outline-none focus:border-red-500"
          >
            <option value="7">{t('timeRange7')}</option>
            <option value="30">{t('timeRange30')}</option>
            <option value="90">{t('timeRange90')}</option>
            <option value="365">{t('timeRangeYear')}</option>
          </select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
                <ShoppingCart size={24} />
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-1">{t('kpiTotalOrders')}</p>
            <p className="text-3xl font-bold">{analytics.totalOrders}</p>
            <p className="text-xs text-gray-500 mt-2">{t('since')}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-green-50 text-green-600">
                <DollarSign size={24} />
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-1">{t('kpiTotalRevenue')}</p>
            <p className="text-3xl font-bold">{euro(analytics.totalRevenue, 0)}</p>
            <p className="text-xs text-gray-500 mt-2">{t('since')}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-purple-50 text-purple-600">
                <TrendingUp size={24} />
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-1">{t('kpiAverageOrder')}</p>
            <p className="text-3xl font-bold">{euro(analytics.averageOrderValue)}</p>
            <p className="text-xs text-gray-500 mt-2">{t('perOrder')}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-orange-50 text-orange-600">
                <Calendar size={24} />
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-1">{t('kpiOrdersThisMonth')}</p>
            <p className="text-3xl font-bold">{analytics.ordersThisMonth}</p>
            <p className="text-xs text-gray-500 mt-2">{t('currentMonth')}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-red-50 text-red-600">
                <Clock size={24} />
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-1">{t('kpiPending')}</p>
            <p className="text-3xl font-bold text-yellow-600">{analytics.pendingOrders}</p>
            <p className="text-xs text-gray-500 mt-2">{t('toProcess')}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-green-50 text-green-600">
                <Users size={24} />
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-1">{t('kpiCompleted')}</p>
            <p className="text-3xl font-bold text-green-600">{analytics.completedOrders}</p>
            <p className="text-xs text-gray-500 mt-2">{t('delivered')}</p>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">{t('statusBreakdown')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {analytics.statusBreakdown.map(item => (
              <div key={item.status} className="text-center p-4 bg-gray-100 rounded-lg">
                <p className="text-gray-500 text-sm mb-1">{item.status}</p>
                <p className="text-2xl font-bold">{item.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Revenue Chart */}
        {analytics.dailyRevenue.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">{t('dailyRevenue')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2">{t('tableDate')}</th>
                    <th className="text-right py-2">{t('tableRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...analytics.dailyRevenue].reverse().map((item, index) => (
                    <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="py-2">{item.date}</td>
                      <td className="text-right font-semibold text-green-600">
                        {euro(item.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
