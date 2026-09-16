'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  /**
   * D'où vient le montant.
   *
   * L'écran n'affichait qu'un total : « 1,50 € » sans dire qu'il s'agissait
   * d'un pourcentage des ventes du mois, ni lequel.
   */
  revenue?: number;
  ordersCount?: number;
  commissionPercent?: number;
}

/** Le détail d'un commerçant : ses commandes du mois, et la part prélevée. */
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
  summary: { ordersCount: number; revenue: number; commission: number };
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
  const [billings, setBillings] = useState<BillingData[]>([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, pendingAmount: 0, activeSubscriptions: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  /**
   * Le commerçant dont on regarde le détail.
   *
   * La page n'affichait qu'un montant par ligne, sans dire de quelles commandes
   * il venait ni ce qui avait été prélevé sur chacune.
   */
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

      if (!res.ok) throw new Error('Erreur lors du chargement de la facturation');
      const data: BillingResponse = await res.json();
      setBillings(data.billings || []);
      setSummary(
        data.summary ?? { totalRevenue: 0, pendingAmount: 0, activeSubscriptions: 0 }
      );
      setTotal(data.pagination?.total ?? data.billings?.length ?? 0);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setLoading(false);
    }
  };

  // Les montants arrivent en euros (Decimal Prisma).
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
    // Un deuxième clic replie.
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

      if (!res.ok) throw new Error('Erreur lors du chargement du détail');

      setDetail(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDetailEnCours(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <CreditCard className="w-8 h-8" />
          Facturation & Abonnements
        </h1>
        <p className="text-gray-400 mt-2">Gestion des abonnements et des revenus</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
          <p className="text-sm text-green-400 mb-2">Revenu Total</p>
          <p className="text-3xl font-bold text-green-400">{euro(summary.totalRevenue)}</p>
          <p className="text-xs text-green-400/60 mt-2">Tous les abonnements</p>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6">
          <p className="text-sm text-yellow-400 mb-2">Montant En Attente</p>
          <p className="text-3xl font-bold text-yellow-400">{euro(summary.pendingAmount)}</p>
          <p className="text-xs text-yellow-400/60 mt-2">À collecter</p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
          <p className="text-sm text-blue-400 mb-2">Abonnements Actifs</p>
          <p className="text-3xl font-bold text-blue-400">{summary.activeSubscriptions}</p>
          <p className="text-xs text-blue-400/60 mt-2">Organisations</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : billings.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <CreditCard className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucune facturation trouvée</p>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50 border-b border-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Organisation</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Plan</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Période</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                    Ventes du mois
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                    Commission
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Prochain Paiement</th>
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
                          ? 'Chargement…'
                          : detail?.organization.id === billing.id
                            ? 'Replier le détail'
                            : 'Voir les commandes'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">{billing.tier}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{billing.period}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-300">
                      {euro(billing.revenue ?? 0)}
                      {billing.ordersCount !== undefined && (
                        <span className="block text-xs text-gray-500">
                          {billing.ordersCount} commande{billing.ordersCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-green-400">{euro(billing.amount)}</p>
                      {billing.commissionPercent !== undefined && (
                        <span className="block text-xs text-gray-500">
                          {billing.commissionPercent} % des ventes
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
        </div>
      )}

      {/* Le détail d'un commerçant : ses commandes du mois, et la part prélevée
          sur chacune. La page n'affichait qu'un total sans son origine. */}
      {detail && (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-gray-700/50 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                {detail.organization.legalName || detail.organization.name}
              </h2>
              {/* Les mentions de la facture : sans elles, le document n'en est
                  pas une, et personne ne le voyait avant de l'éditer. */}
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
                  .join(' · ') || 'Identité de facturation non renseignée'}
              </p>
              <p className="text-sm text-gray-400">
                {detail.period} — formule {detail.tierLabel}, {detail.commissionPercent} % de
                commission sur les ventes
              </p>
              {detail.organization.manquePourFacturer.length > 0 && (
                <p role="status" className="text-sm text-amber-300 mt-1">
                  Facture incomplète : il manque{' '}
                  {detail.organization.manquePourFacturer.join(', ')}.{' '}
                  <Link
                    href={`/superowner/organizations/${detail.organization.id}`}
                    className="underline hover:text-amber-200"
                  >
                    Voir son dossier
                  </Link>
                </p>
              )}
            </div>
            <div className="text-right text-sm">
              <p className="text-gray-300">
                {detail.summary.ordersCount} commande{detail.summary.ordersCount > 1 ? 's' : ''} —{' '}
                {euro(detail.summary.revenue)}
              </p>
              <p className="font-bold text-green-400">
                Commission : {euro(detail.summary.commission)}
              </p>
            </div>
          </div>

          {detail.orders.length === 0 ? (
            <p className="px-6 py-8 text-center text-gray-400">
              Aucune commande sur cette période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50 border-b border-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                      Commande
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                      Boutique
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                      Total
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                      Commission
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
                            − {euro(ligne.remise)} de remise
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
          Affichage {offset + 1} à {Math.min(offset + limit, total)} sur {total}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Précédent
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
