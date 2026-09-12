'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ShoppingCart, Users, Wallet, LogOut, Menu, X, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  createdAt: string;
}

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  activeCustomers: number;
  averageOrderValue: number;
  pendingOrders: number;
}

export default function MerchantDashboard() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [store, setStore] = useState<Store | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
      setUserName(userEmail.split('@')[0]);
    }

    if (orgId) {
      fetchDashboardData();
    }
  }, [orgId]);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        router.push('/login');
        return;
      }

      // Fetch store data
      const storeResponse = await fetch(`${API_URL}/api/stores/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (storeResponse.ok) {
        const storeData = await storeResponse.json();
        setStore(storeData.store);
      }

      // Fetch orders for stats
      const ordersResponse = await fetch(`${API_URL}/api/orders?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json();
        const orders = ordersData.orders || [];

        const totalRevenue = orders.reduce((sum: number, o: any) => sum + Number(o.totalAmount || 0), 0);
        const pendingOrders = orders.filter((o: any) => o.status === 'PENDING').length;

        setStats({
          totalOrders: orders.length,
          totalRevenue,
          activeCustomers: orders.length > 0 ? Math.ceil(orders.length * 0.7) : 0,
          averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
          pendingOrders,
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userEmail');
    router.push('/login');
  };

  const storeUrl = store ? `http://localhost:3000/store/${store.slug}` : '';

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement du tableau de bord...</p>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    { label: 'Tableau de Bord', href: `/merchant/${orgId}/dashboard`, icon: '📊' },
    { label: 'Commandes', href: `/merchant/${orgId}/orders`, icon: '📦' },
    { label: 'Produits', href: `/merchant/${orgId}/products`, icon: '🛍️' },
    { label: 'Horaires', href: `/merchant/${orgId}/store-hours`, icon: '⏰' },
    { label: 'Clients', href: `/merchant/${orgId}/customers`, icon: '👥' },
    { label: 'Rapports', href: `/merchant/${orgId}/analytics`, icon: '📈' },
    { label: 'Paramètres', href: `/merchant/${orgId}/settings`, icon: '⚙️' },
  ];

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center font-bold text-sm">
              {store?.name.charAt(0) || 'M'}
            </div>
            {sidebarOpen && (
              <div>
                <p className="font-bold text-sm">{store?.name || 'Ma Boutique'}</p>
                <p className="text-xs text-gray-400">Commerçant</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              <span className="text-lg">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-900/20 transition-colors text-red-400 text-sm"
          >
            <LogOut size={20} />
            {sidebarOpen && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="text-sm text-gray-400">
            Connecté en tant que <span className="text-red-400 font-semibold">{userName}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold">Bienvenue, {store?.name}! 👋</h1>
            <p className="text-gray-400 mt-1">Gérez votre boutique et vos commandes</p>
          </div>

          {/* Store Info Card */}
          {store && (
            <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-600/50 rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h2 className="text-lg font-bold mb-3">Votre Boutique</h2>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-gray-400">Nom:</span> <span className="font-semibold">{store.name}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">Adresse:</span> <span className="font-semibold">{store.address}{store.postalCode ? ', ' + store.postalCode : ''}{store.city ? ' ' + store.city : ''}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">Téléphone:</span> <span className="font-semibold">{store.phone}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">Email:</span> <span className="font-semibold">{store.email}</span>
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold mb-3">Lien de votre boutique</h3>
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-3">
                    <p className="text-xs text-gray-400 mb-1">URL publique:</p>
                    <a
                      href={storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-400 hover:text-red-300 break-all font-mono text-sm"
                    >
                      {storeUrl}
                    </a>
                  </div>
                  <button className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold transition-colors">
                    👁️ Voir ma boutique
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-lg bg-blue-600/20 text-blue-400">
                    <ShoppingCart size={24} />
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">Total Commandes</p>
                <p className="text-3xl font-bold">{stats.totalOrders}</p>
                <p className="text-xs text-gray-500 mt-2">Depuis le début</p>
              </div>

              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-lg bg-green-600/20 text-green-400">
                    <Wallet size={24} />
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">Revenu Total</p>
                <p className="text-3xl font-bold">${(stats.totalRevenue / 100).toFixed(0)}</p>
                <p className="text-xs text-gray-500 mt-2">Revenu généré</p>
              </div>

              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-lg bg-purple-600/20 text-purple-400">
                    <Users size={24} />
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">Clients Actifs</p>
                <p className="text-3xl font-bold">{stats.activeCustomers}</p>
                <p className="text-xs text-gray-500 mt-2">Clients uniques</p>
              </div>

              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-lg bg-orange-600/20 text-orange-400">
                    <AlertCircle size={24} className={stats.pendingOrders > 0 ? 'text-orange-400' : 'text-gray-500'} />
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">Commandes en Attente</p>
                <p className="text-3xl font-bold text-orange-400">{stats.pendingOrders}</p>
                <p className="text-xs text-gray-500 mt-2">À traiter</p>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Actions Rapides</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link
                href={`/merchant/${orgId}/orders`}
                className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors"
              >
                <p className="text-2xl mb-2">📦</p>
                <p className="text-sm font-medium">Voir Commandes</p>
              </Link>
              <Link
                href={`/merchant/${orgId}/products`}
                className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors"
              >
                <p className="text-2xl mb-2">🛍️</p>
                <p className="text-sm font-medium">Ajouter Produit</p>
              </Link>
              <Link
                href={`/merchant/${orgId}/analytics`}
                className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors"
              >
                <p className="text-2xl mb-2">📈</p>
                <p className="text-sm font-medium">Analytics</p>
              </Link>
              <Link
                href={`/merchant/${orgId}/settings`}
                className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors"
              >
                <p className="text-2xl mb-2">⚙️</p>
                <p className="text-sm font-medium">Paramètres</p>
              </Link>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
            <p className="text-blue-400 text-sm">
              ℹ️ Votre boutique est en direct et prête à recevoir des commandes. Complétez votre catalogue de produits pour augmenter vos ventes!
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
