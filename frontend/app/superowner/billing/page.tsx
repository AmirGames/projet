'use client';

import { useState, useEffect } from 'react';
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
                  <tr key={billing.id} className="hover:bg-gray-700/20 transition">
                    <td className="px-6 py-4 text-sm text-white font-medium">{billing.organization}</td>
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
