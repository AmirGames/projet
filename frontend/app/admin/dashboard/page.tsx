'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  totalStores: number;
  totalCustomers: number;
  totalProducts: number;
  openTickets: number;
  platformCommission: number;
}

export default function AdminDashboard() {
  const t = useTranslations('adminDashboard');
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const donnees = await response.json().catch(() => ({}));
        setError(donnees.error || t('loadError'));
        setLoading(false);
        return;
      }

      const data = await response.json();
      setStats({
        totalUsers: data.users?.total ?? 0,
        totalOrders: data.orders?.total ?? 0,
        totalRevenue: data.revenue?.total ?? 0,
        totalStores: data.stores?.total ?? 0,
        totalCustomers: data.customers?.total ?? 0,
        totalProducts: data.products?.total ?? 0,
        openTickets: data.tickets?.open ?? 0,
        platformCommission:
          (data.revenue?.total ?? 0) * ((data.config?.platformFeePercent ?? 5) / 100),
      });
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError(t('loadError'));
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg"
            >
              <LogOut size={18} />
              {t('logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && <div className="text-red-400 mb-8">{error}</div>}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('users')}</p>
              <p className="text-white text-3xl font-bold">{stats.totalUsers}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('restaurants')}</p>
              <p className="text-white text-3xl font-bold">{stats.totalStores}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('orders')}</p>
              <p className="text-white text-3xl font-bold">{stats.totalOrders}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('revenue')}</p>
              <p className="text-white text-3xl font-bold">{euro(stats.totalRevenue, 0)}</p>
            </div>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('customers')}</p>
              <p className="text-white text-3xl font-bold">{stats.totalCustomers}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('products')}</p>
              <p className="text-white text-3xl font-bold">{stats.totalProducts}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('openTickets')}</p>
              <p className="text-white text-3xl font-bold">{stats.openTickets}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">{t('platformCommission')}</p>
              <p className="text-white text-3xl font-bold">{euro(stats.platformCommission)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
