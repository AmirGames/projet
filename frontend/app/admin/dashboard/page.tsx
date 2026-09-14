'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  totalStores: number;
  activeDrivers: number;
  totalDeliveries: number;
  averageOrderValue: number;
  platformCommission: number;
}

export default function AdminDashboard() {
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
      const response = await fetch(`${API_URL}/api/superowner/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError('Erreur lors du chargement');
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
          <p className="text-white">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white">Tableau de bord administrateur</h1>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg"
            >
              <LogOut size={18} />
              Déconnexion
            </button>
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

        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Plateforme opérationnelle</h2>
          <p className="text-gray-400">Tableau de bord complet avec gestion des utilisateurs, commandes et statistiques</p>
        </div>
      </div>
    </div>
  );
}
