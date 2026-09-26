'use client';

import { useCallback, useState } from 'react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCurrentStore } from '@/lib/current-store';
import { lienVersEspace } from '@/lib/domaines';
import {
  ShoppingCart,
  Users,
  Wallet,
  Package,
  AlertCircle,
  TrendingUp,
  Store as StoreIcon,
  ExternalLink,
} from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Store {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  isOpen: boolean;
}

interface Organization {
  id: string;
  name: string;
  status: string;
  stores: Store[];
}

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  uniqueCustomers: number;
  averageOrderValue: number;
  pendingOrders: number;
  totalProducts: number;
}

export default function MerchantDashboard() {
  const t = useTranslations('merchantDashboard');
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const { storeId, currentStore, stores, loading: storesLoading } = useCurrentStore();

  const [org, setOrg] = useState<Organization | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // silencieux : une relecture en direct ne remplace pas la page par
  // « Chargement… » à chaque commande qui arrive.
  const fetchDashboardData = useCallback(async (silencieux = false) => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const auth = { Authorization: `Bearer ${token}` };

    // Les chiffres suivent la boutique choisie dans le sélecteur ; sans
    // boutique on retombe sur l'ensemble de l'organisation.
    const portee = storeId ? `storeId=${storeId}` : `orgId=${orgId}`;

    if (!silencieux) setLoading(true);
    setError('');

    try {
      const [orgRes, ordersRes, productsRes] = await Promise.all([
        fetch(`${API_URL}/organizations/${orgId}`, { headers: auth }),
        fetch(`${API_URL}/orders?${portee}`, { headers: auth }),
        fetch(`${API_URL}/products?${portee}`, { headers: auth }),
      ]);

      if (orgRes.ok) setOrg(await orgRes.json());

      const ordersData = ordersRes.ok ? await ordersRes.json() : { orders: [] };
      const productsData = productsRes.ok ? await productsRes.json() : { pagination: { total: 0 } };
      const orders = ordersData.orders || [];

      // totalAmount est un Decimal en euros : aucune conversion de centimes.
      const totalRevenue = orders.reduce(
        (sum: number, o: any) => sum + Number(o.totalAmount || 0),
        0
      );
      const customerKeys = new Set(
        orders.map((o: any) => o.customerId || o.customerEmail).filter(Boolean)
      );

      setStats({
        totalOrders: ordersData.pagination?.total ?? orders.length,
        totalRevenue,
        uniqueCustomers: customerKeys.size,
        averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
        pendingOrders: orders.filter((o: any) => o.status === 'PENDING').length,
        totalProducts: productsData.pagination?.total ?? 0,
      });
    } catch (err) {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [orgId, storeId, router, t]);

  useEffectChargement(() => {
    // On attend la liste des boutiques pour ne pas charger deux fois :
    // une première fois sans portée, puis avec la boutique retenue.
    if (orgId && !storesLoading) fetchDashboardData();
  }, [orgId, storesLoading, fetchDashboardData]);

  // Les chiffres suivent les commandes et le catalogue en direct.
  useDonneesModifiees(['orders', 'products', 'organizations'], () => fetchDashboardData(true), {
    orgId,
    storeId,
    actif: Boolean(orgId && !storesLoading),
  });

  if (loading) return <div className="text-center py-8">{t('loading')}</div>;

  const euro = (value: number) =>
    value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-400 mt-1">
          {currentStore
            ? t('storeOverviewCurrentStore', { name: currentStore.name })
            : org?.name
              ? t('storeOverviewCurrentStore', { name: org.name })
              : t('storeOverviewDefault')}
          {stores.length > 1 && (
            <span className="text-gray-500">
              {' '}
              {t('changeSwitcher')}
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('metricsOrders')}</p>
            <ShoppingCart size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold">{stats?.totalOrders ?? 0}</p>
          <p className="text-sm text-gray-400 mt-2">{t('metricsSince')}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('metricsRevenue')}</p>
            <Wallet size={20} className="text-green-500" />
          </div>
          <p className="text-3xl font-bold">{euro(stats?.totalRevenue ?? 0)} €</p>
          <p className="text-sm text-gray-400 mt-2">
            {t('metricsAverageOrder', { value: euro(stats?.averageOrderValue ?? 0) })}
          </p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('metricsCustomers')}</p>
            <Users size={20} className="text-purple-500" />
          </div>
          <p className="text-3xl font-bold">{stats?.uniqueCustomers ?? 0}</p>
          <p className="text-sm text-gray-400 mt-2">{t('metricsCustomersUnique')}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{t('metricsProducts')}</p>
            <Package size={20} className="text-yellow-500" />
          </div>
          <p className="text-3xl font-bold">{stats?.totalProducts ?? 0}</p>
          <p className="text-sm text-gray-400 mt-2">{t('metricsCatalog')}</p>
        </div>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-orange-500" />
            {t('alertsPending')}
          </h2>
          <p className="text-3xl font-bold text-orange-400">{stats?.pendingOrders ?? 0}</p>
          <p className="text-sm text-gray-400 mt-2">{t('alertsToProcess')}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-green-500" />
            {t('alertsAverage')}
          </h2>
          <p className="text-3xl font-bold text-green-400">{euro(stats?.averageOrderValue ?? 0)} €</p>
          <p className="text-sm text-gray-400 mt-2">{t('alertsPerOrder')}</p>
        </div>
      </div>

      {/* Stores */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <StoreIcon size={20} className="text-blue-500" />
          {t('storesMyStores', { count: org?.stores?.length ?? 0 })}
        </h2>
        {org?.stores && org.stores.length > 0 ? (
          <div className="space-y-2">
            {org.stores.map((store) => (
              <div
                key={store.id}
                className={`p-3 rounded-lg flex items-center justify-between gap-4 ${
                  store.id === storeId
                    ? 'bg-gray-700 ring-1 ring-blue-500/60'
                    : 'bg-gray-700'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {store.name}
                    {store.id === storeId && (
                      <span className="ml-2 text-xs font-normal text-blue-400">
                        {t('storeCurrent')}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-400 truncate">
                    {store.city || t('storeNoCity')}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      store.isOpen
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {store.isOpen ? t('storeOpen') : t('storeClosed')}
                  </span>
                  <a
                    href={lienVersEspace('public', `/store/${store.slug}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm"
                  >
                    {t('storeLink')} <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">{t('storeEmpty')}</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">{t('quickActions')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            href={`/merchant/${orgId}/orders`}
            className="block p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-center font-medium"
          >
            {t('quickOrders')}
          </Link>
          <Link
            href={`/merchant/${orgId}/products`}
            className="block p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-center font-medium"
          >
            {t('quickProducts')}
          </Link>
          <Link
            href={`/merchant/${orgId}/analytics`}
            className="block p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-center font-medium"
          >
            {t('quickAnalytics')}
          </Link>
          <Link
            href={`/merchant/${orgId}/settings`}
            className="block p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-center font-medium"
          >
            {t('quickSettings')}
          </Link>
        </div>
      </div>
    </div>
  );
}
