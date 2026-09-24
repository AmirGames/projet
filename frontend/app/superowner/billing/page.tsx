'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';

interface BillingData {
  id: string;
  organization: string;
  tier: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'OVERDUE';
  period: string;
  nextBillingDate: string;
  createdAt: string;
  revenue?: number;
  ordersCount?: number;
  commissionPercent?: number;
  /** Frais de livraison encaissés par le commerçant pour la plateforme. */
  deliveryFeesDue?: number;
  /** Frais de service payés par ses clients, à reverser à la plateforme. */
  serviceFeesDue?: number;
  /** Commission et frais de livraison : tout ce que le commerçant doit. */
  totalDue?: number;
}

interface LigneDetail {
  id: string;
  numero: string;
  date: string;
  boutique: string;
  client: string;
  status: string;
  paymentStatus: string;
  total: number;
  remise: number;
  livraison: number;
  /** La part des frais de livraison qui revient à la plateforme. */
  livraisonDue?: number;
  /** Les frais de service de la commande, dus à la plateforme. */
  serviceDu?: number;
  commission: number;
}

interface DetailFacturation {
  organization: {
    id: string;
    name: string;
    tier: string;
    legalName: string | null;
    vatNumber: string | null;
    registrationNumber: string | null;
    billingAddress: string | null;
    billingPostalCode: string | null;
    billingCity: string | null;
    billingCountry: string | null;
    manquePourFacturer: string[];
  };
  period: string;
  commissionPercent: number;
  tierLabel: string;
  orders: LigneDetail[];
  summary: {
    ordersCount: number;
    revenue: number;
    commission: number;
    deliveryFees?: number;
    serviceFees?: number;
    totalDue?: number;
  };
}

interface BillingResponse {
  billings: BillingData[];
  summary: {
    totalRevenue: number;
    pendingAmount: number;
    activeSubscriptions: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function BillingPage() {
  const t = useTranslations('superownerBilling');
  const [billings, setBillings] = useState<BillingData[]>([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, pendingAmount: 0, activeSubscriptions: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<DetailFacturation | null>(null);
  const [detailEnCours, setDetailEnCours] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    fetchBillings();
  }, [offset]);

  const fetchBillings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/billing?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const data: BillingResponse = await res.json();
      setBillings(data.billings || []);
      setSummary(
        data.summary ?? { totalRevenue: 0, pendingAmount: 0, activeSubscriptions: 0 }
      );
      setTotal(data.pagination?.total ?? data.billings?.length ?? 0);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  };

  const euro = (valeur: number) =>
    Number(valeur || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      PAID: 'bg-green-500/10 text-green-400 border-green-500/20',
      PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      OVERDUE: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  const ouvrirLeDetail = async (billing: BillingData) => {
    if (detail?.organization.id === billing.id) {
      setDetail(null);
      return;
    }

    setDetailEnCours(billing.id);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${API_URL}/api/superowner/billing/${billing.id}?period=${billing.period}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error(t('loadError'));
      setDetail(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setDetailEnCours(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <CreditCard className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-2">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
          <p className="text-sm text-green-400 mb-2">{t('totalRevenue')}</p>
          <p className="text-3xl font-bold text-green-400">{euro(summary.totalRevenue)}</p>
          <p className="text-xs text-green-400/60 mt-2">{t('allSubscriptions')}</p>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6">
          <p className="text-sm text-yellow-400 mb-2">{t('pendingAmount')}</p>
          <p className="text-3xl font-bold text-yellow-400">{euro(summary.pendingAmount)}</p>
          <p className="text-xs text-yellow-400/60 mt-2">{t('pendingAmount')}</p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
          <p className="text-sm text-blue-400 mb-2">{t('activeSubscriptions')}</p>
          <p className="text-3xl font-bold text-blue-400">{summary.activeSubscriptions}</p>
          <p className="text-xs text-blue-400/60 mt-2">{t('colOrganization')}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : billings.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  {t('colOrganization')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  {t('colTier')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  {t('colPeriod')}
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                  {t('colRevenue')}
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                  {t('colCommission')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  {t('colStatus')}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                  {t('colNextBilling')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {billings.map((billing) => (
                <tr
                  key={billing.id}
                  onClick={() => ouvrirLeDetail(billing)}
                  className={`cursor-pointer transition ${
                    detail?.organization.id === billing.id
                      ? 'bg-blue-900/20'
                      : 'hover:bg-gray-700/20'
                  }`}
                >
                  <td className="px-6 py-4 text-sm text-white font-medium">
                    {billing.organization}
                    <span className="block text-xs text-gray-500">
                      {detailEnCours === billing.id
                        ? t('loading')
                        : detail?.organization.id === billing.id
                          ? t('collapseDetail')
                          : t('seeOrders')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{billing.tier}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{billing.period}</td>
                  <td className="px-6 py-4 text-right text-sm text-gray-300">
                    {euro(billing.revenue ?? 0)}
                    {billing.ordersCount !== undefined && (
                      <span className="block text-xs text-gray-500">
                        {billing.ordersCount} {billing.ordersCount > 1 ? t('orders_plural') : t('orders')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="font-bold text-green-400">{euro(billing.amount)}</p>
                    {billing.commissionPercent !== undefined && (
                      <span className="block text-xs text-gray-500">
                        {billing.commissionPercent} % {t('colRevenue')}
                      </span>
                    )}
                    {/* Les frais des courses faites par les livreurs de la
                        plateforme : le client les a payés au commerçant. */}
                    {(billing.deliveryFeesDue ?? 0) > 0 && (
                      <span className="block text-xs text-amber-300">
                        + {euro(billing.deliveryFeesDue ?? 0)} de livraison
                      </span>
                    )}
                    {(billing.serviceFeesDue ?? 0) > 0 && (
                      <span className="block text-xs text-amber-300">
                        + {euro(billing.serviceFeesDue ?? 0)} de frais de service
                      </span>
                    )}
                    {(billing.totalDue ?? 0) > billing.amount && (
                      <span className="block text-xs font-semibold text-white">
                        {euro(billing.totalDue ?? 0)} dus
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(billing.status)}`}>
                      {billing.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(billing.nextBillingDate).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-gray-700/50 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                {detail.organization.legalName || detail.organization.name}
              </h2>
              <p className="text-sm text-gray-400">
                {[
                  detail.organization.billingAddress,
                  [detail.organization.billingPostalCode, detail.organization.billingCity]
                    .filter(Boolean)
                    .join(' '),
                  detail.organization.billingCountry,
                  detail.organization.vatNumber && `TVA ${detail.organization.vatNumber}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || t('incompleteInvoice')}
              </p>
              <p className="text-sm text-gray-400">
                {detail.period} — {detail.tierLabel}, {detail.commissionPercent} % de commission
              </p>
              {detail.organization.manquePourFacturer.length > 0 && (
                <p role="status" className="text-sm text-amber-300 mt-1">
                  {t('incompleteInvoice')} {detail.organization.manquePourFacturer.join(', ')}.{' '}
                  <Link
                    href={`/superowner/organizations/${detail.organization.id}`}
                    className="underline hover:text-amber-200"
                  >
                    {t('seeFiled')}
                  </Link>
                </p>
              )}
            </div>
            <div className="text-right text-sm">
              <p className="text-gray-300">
                {detail.summary.ordersCount} {detail.summary.ordersCount > 1 ? t('orders_plural') : t('orders')} — {euro(detail.summary.revenue)}
              </p>
              <p className="font-bold text-green-400">
                {t('commission')}: {euro(detail.summary.commission)}
              </p>
              {(detail.summary.deliveryFees ?? 0) > 0 && (
                <p className="text-amber-300">
                  Livraisons de la plateforme : {euro(detail.summary.deliveryFees ?? 0)}
                </p>
              )}
              {(detail.summary.serviceFees ?? 0) > 0 && (
                <p className="text-amber-300">
                  Frais de service : {euro(detail.summary.serviceFees ?? 0)}
                </p>
              )}
              {(detail.summary.totalDue ?? 0) > detail.summary.commission && (
                <p className="font-bold text-white">
                  Total dû : {euro(detail.summary.totalDue ?? 0)}
                </p>
              )}
            </div>
          </div>

          {detail.orders.length === 0 ? (
            <p className="px-6 py-8 text-center text-gray-400">
              {t('noOrders')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50 border-b border-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                      {t('colOrganization')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                      Boutique
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                      {t('total')}
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                      {t('commission')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {detail.orders.map((ligne) => (
                    <tr key={ligne.id} className="hover:bg-gray-700/20 transition">
                      <td className="px-6 py-4 text-sm text-white">
                        #{ligne.numero}
                        <span className="block text-xs text-gray-500">{ligne.client}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(ligne.date).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">{ligne.boutique}</td>
                      <td className="px-6 py-4 text-right text-sm text-gray-300">
                        {euro(ligne.total)}
                        {ligne.remise > 0 && (
                          <span className="block text-xs text-green-400">
                            − {euro(ligne.remise)} de {t('discount')}
                          </span>
                        )}
                        {(ligne.livraisonDue ?? 0) > 0 && (
                          <span className="block text-xs text-amber-300">
                            dont {euro(ligne.livraisonDue ?? 0)} de livraison dus à la plateforme
                          </span>
                        )}
                        {(ligne.serviceDu ?? 0) > 0 && (
                          <span className="block text-xs text-amber-300">
                            dont {euro(ligne.serviceDu ?? 0)} de frais de service
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-green-400">
                        {euro(ligne.commission)}
                        <span className="block text-xs text-gray-500">
                          {detail.commissionPercent} %
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {t('showingRange', { offset: offset + 1, limit: Math.min(offset + limit, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
