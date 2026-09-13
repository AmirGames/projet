'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Store, ShoppingCart, TrendingUp, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

export default function MerchantDashboard() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStores: 0,
    totalOrders: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const orgId = localStorage.getItem('currentOrgId');

      if (!token || !orgId) {
        router.push('/login');
        return;
      }

      // Fetch stores
      const storesRes = await fetch(`${API_URL}/api/stores?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (storesRes.ok) {
        const storesData = await storesRes.json();
        setStores(storesData.stores || []);
        setStats((prev) => ({ ...prev, totalStores: storesData.total || 0 }));
      }

      // Fetch recent orders
      const ordersRes = await fetch(
        `${API_URL}/api/orders?orgId=${orgId}&limit=5`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setRecentOrders(ordersData.orders || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <TrendingUp size={32} className="text-orange-600" />
          Tableau de Bord
        </h1>
        <p className="text-gray-400 mt-2">Bienvenue sur votre tableau de bord merchant</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total de Boutiques</p>
              <p className="text-3xl font-bold text-white mt-2">{stats.totalStores}</p>
            </div>
            <Store size={32} className="text-orange-600" />
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Commandes</p>
              <p className="text-3xl font-bold text-white mt-2">{stats.totalOrders}</p>
            </div>
            <ShoppingCart size={32} className="text-orange-600" />
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Revenu Total</p>
              <p className="text-3xl font-bold text-white mt-2">€{stats.totalRevenue.toFixed(2)}</p>
            </div>
            <TrendingUp size={32} className="text-orange-600" />
          </div>
        </div>
      </div>

      {/* Stores Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Mes Boutiques</h2>
          <Link
            href="/merchant/register"
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition"
          >
            + Créer une boutique
          </Link>
        </div>

        {stores.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
            <Store size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">Aucune boutique pour le moment</p>
            <Link
              href="/merchant/register"
              className="inline-block mt-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition"
            >
              Créer votre première boutique
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {stores.map((store) => (
              <Link key={store.id} href={`/merchant/${store.id}`}>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-orange-600 transition cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{store.name}</h3>
                      {store.description && (
                        <p className="text-gray-400 text-sm mt-1">{store.description}</p>
                      )}
                      {store.address && (
                        <p className="text-gray-500 text-xs mt-2">{store.address}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-orange-600 hover:text-orange-500 transition">Gérer →</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Orders Section */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Commandes Récentes</h2>

        {recentOrders.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
            <ShoppingCart size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">Aucune commande pour le moment</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">Commande #{order.id.slice(0, 8)}</p>
                    <p className="text-gray-400 text-sm mt-1">
                      {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">€{order.totalAmount.toFixed(2)}</p>
                    <div
                      className={`text-xs px-2 py-1 rounded mt-2 ${
                        order.status === 'DELIVERED'
                          ? 'bg-green-900/20 text-green-400'
                          : order.status === 'PENDING'
                          ? 'bg-yellow-900/20 text-yellow-400'
                          : 'bg-blue-900/20 text-blue-400'
                      }`}
                    >
                      {order.status}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
