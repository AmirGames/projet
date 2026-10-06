'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Store, ShoppingCart, TrendingUp, Copy } from 'lucide-react';

import DupliquerBoutique from '@/components/DupliquerBoutique';

import { memoriserBoutique } from '@/lib/current-store';
import { euro, montantCommercant } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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
  feesAmount?: number | string;
  serviceFeeAmount?: number | string;
  createdAt: string;
}

/** Les couleurs des statuts, les mêmes que sur l'écran des commandes. */
const PASTILLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  ACCEPTED: 'bg-sky-100 text-sky-900',
  PREPARING: 'bg-orange-100 text-orange-900',
  READY: 'bg-green-100 text-green-900',
  COMPLETED: 'bg-gray-100 text-gray-700',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function MerchantDashboard() {
  const locale = useLocale();
  const t = useTranslations('merchantMainDashboard');
  const tStatut = useTranslations('merchantOrders.statusLabel');
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [orgId, setOrgId] = useState('');
  const [quota, setQuota] = useState<{
    tierLabel: string;
    used: number;
    max: number;
    canCreate: boolean;
    upgradeAvailable: boolean;
  } | null>(null);
  const [aDupliquer, setADupliquer] = useState<Store | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStores: 0,
    totalOrders: 0,
    totalRevenue: 0,
  });

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const org = localStorage.getItem('currentOrgId');

      if (!token || !org) {
        router.push('/login');
        return;
      }

      setOrgId(org);

      // Le nombre de boutiques autorisées dépend de la formule souscrite.
      const quotaRes = await fetch(`${API_URL}/api/stores/org/${org}/quota`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (quotaRes.ok) {
        setQuota(await quotaRes.json());
      }

      const storesRes = await fetch(`${API_URL}/api/stores/org/${org}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (storesRes.ok) {
        const storesData = await storesRes.json();
        const liste = Array.isArray(storesData) ? storesData : storesData.stores || [];
        setStores(liste);
        setStats((prev) => ({ ...prev, totalStores: liste.length }));
      }

      // Fetch recent orders
      const ordersRes = await fetch(
        `${API_URL}/api/orders?orgId=${org}&limit=5`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setRecentOrders(ordersData.orders || []);

        // Les deux compteurs restaient à zéro : rien ne les renseignait. Ils
        // viennent maintenant du serveur, qui compte toutes les commandes de
        // l'organisation et non les cinq dernières affichées.
        setStats((prev) => ({
          ...prev,
          totalOrders: Number(ordersData.summary?.totalOrders ?? prev.totalOrders),
          totalRevenue: Number(ordersData.summary?.totalRevenue ?? prev.totalRevenue),
        }));
      }
    } catch (error) {
      signalerErreur(t('loadError'), error);
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffectChargement(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const ouvrirBoutique = (storeId: string) => {
    memoriserBoutique(orgId, storeId);
    router.push(`/merchant/${orgId}/dashboard`);
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
      <title>{`${t("titreOnglet")} — ZupEat`}</title>
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp size={32} className="text-orange-600" />
          {t('title')}
        </h1>
        <p className="text-gray-500 mt-2">{t('subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">{t('totalStores')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalStores}</p>
            </div>
            <Store size={32} className="text-orange-600" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">{t('orders')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalOrders}</p>
            </div>
            <ShoppingCart size={32} className="text-orange-600" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">{t('totalRevenue')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{euro(stats.totalRevenue)}</p>
            </div>
            <TrendingUp size={32} className="text-orange-600" />
          </div>
        </div>
      </div>

      {/* Stores Section */}
      <div>
        <div className="flex justify-between items-center mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('myStores')}</h2>
            {quota && (
              <p className="text-sm text-gray-500 mt-1">
                {t('plan')} {quota.tierLabel} — {t('storeCount', { used: quota.used, max: quota.max })}
              </p>
            )}
          </div>

          {quota && !quota.canCreate ? (
            <div className="text-right">
              <p className="text-sm text-orange-600">
                {t('limitReached')}
              </p>
              {/* La page des formules dit ce que chacune contient ; le support
                  ne sert que lorsqu'il n'y a plus de palier au-dessus. */}
              <Link
                href={
                  quota.upgradeAvailable
                    ? '/merchant/formule'
                    : orgId
                      ? `/merchant/${orgId}/support`
                      : '/merchant'
                }
                className="text-sm text-orange-500 hover:text-orange-600 underline"
              >
                {quota.upgradeAvailable
                  ? t('seePlans')
                  : t('requestStore')}
              </Link>
            </div>
          ) : (
            <Link
              href="/store/new"
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition"
            >
              {t('createStore')}
            </Link>
          )}
        </div>

        {stores.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <Store size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">{t('noStores')}</p>
            <Link
              href="/store/new"
              className="inline-block mt-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition"
            >
              {t('createFirstStore')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {stores.map((store) => (
              // Un bouton et non un lien : choisir une boutique, c'est la
              // retenir avant d'ouvrir le tableau de bord. Sans cela, toutes
              // les cartes menaient au même endroit et le choix n'avait aucun
              // effet.
              <div
                key={store.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-orange-600 transition flex items-start justify-between gap-4"
              >
                <button
                  type="button"
                  onClick={() => ouvrirBoutique(store.id)}
                  className="flex-1 text-left cursor-pointer"
                >
                  <h3 className="text-gray-900 font-semibold">{store.name}</h3>
                  {store.description && (
                    <p className="text-gray-500 text-sm mt-1">{store.description}</p>
                  )}
                  {store.address && (
                    <p className="text-gray-500 text-xs mt-2">{store.address}</p>
                  )}
                </button>
                <div className="text-right flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => ouvrirBoutique(store.id)}
                    className="text-orange-600 hover:text-orange-500 transition"
                  >
                    {t('manage')}
                  </button>
                  {/* Même catalogue, mêmes réglages : seuls le nom, l'adresse
                      et le téléphone changent. */}
                  {quota?.canCreate !== false && (
                    <button
                      type="button"
                      onClick={() => setADupliquer(store)}
                      className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition"
                    >
                      <Copy size={14} />
                      {t('duplicate')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {aDupliquer && (
        <DupliquerBoutique
          source={aDupliquer}
          onClose={() => setADupliquer(null)}
          onDone={() => {
            setADupliquer(null);
            fetchDashboardData();
          }}
        />
      )}

      {/* Recent Orders Section */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">{t('recentOrders')}</h2>

        {recentOrders.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <ShoppingCart size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">{t('noOrders')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-900 font-semibold">{t('orderNumber', { id: order.id.slice(-8).toUpperCase() })}</p>
                    <p className="text-gray-500 text-sm mt-1">
                      {new Date(order.createdAt).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-900 font-bold">{euro(montantCommercant(order))}</p>
                    {/* Le statut en clair, aux couleurs de l'écran des commandes ;
                        « DELIVERED », testé ici, n'existe pas pour une commande. */}
                    <span
                      className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        PASTILLES[order.status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {tStatut.has(order.status as any) ? tStatut(order.status as any) : order.status}
                    </span>
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
