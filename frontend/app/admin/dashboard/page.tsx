'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboardData = useCallback(async () => {
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
        setError(donnees.error || 'Erreur lors du chargement');
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
      setError('Erreur lors du chargement');
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="pt-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white">Tableau de bord administrateur</h1>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && <div className="text-red-400 mb-8">{error}</div>}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Utilisateurs</p>
              <p className="text-white text-3xl font-bold">{stats.totalUsers}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Restaurants</p>
              <p className="text-white text-3xl font-bold">{stats.totalStores}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Commandes</p>
              <p className="text-white text-3xl font-bold">{stats.totalOrders}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Revenus</p>
              <p className="text-white text-3xl font-bold">{euro(stats.totalRevenue, 0)}</p>
            </div>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Clients</p>
              <p className="text-white text-3xl font-bold">{stats.totalCustomers}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Produits</p>
              <p className="text-white text-3xl font-bold">{stats.totalProducts}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Tickets ouverts</p>
              <p className="text-white text-3xl font-bold">{stats.openTickets}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-gray-400">Commission plateforme</p>
              <p className="text-white text-3xl font-bold">{euro(stats.platformCommission)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
