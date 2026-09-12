'use client';

import { useEffect, useState } from 'react';
import { CreditCard, DollarSign, TrendingUp, Download } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface BillingData {
  totalRevenue: number;
  monthlyRecurring: number;
  pendingInvoices: number;
  paidInvoices: number;
  subscriptionPlans: Array<{ name: string; count: number; price: number }>;
  topSubscribers: Array<{ name: string; plan: string; revenue: number }>;
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/billing`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Facturation & Abonnements</h1>
          <p className="text-gray-400 mt-1">Gestion des revenus et paiements</p>
        </div>
        <button className="flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 font-medium transition-colors">
          <Download size={20} />
          Exporter Rapports
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg bg-green-600/20 text-green-400">
              <DollarSign size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Revenu Total</p>
          <p className="text-3xl font-bold text-green-400">${((data?.totalRevenue || 0) / 100).toFixed(0)}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg bg-blue-600/20 text-blue-400">
              <TrendingUp size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">MRR</p>
          <p className="text-3xl font-bold text-blue-400">${((data?.monthlyRecurring || 0) / 100).toFixed(0)}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg bg-yellow-600/20 text-yellow-400">
              <CreditCard size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Factures En Attente</p>
          <p className="text-3xl font-bold text-yellow-400">{data?.pendingInvoices || 0}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg bg-purple-600/20 text-purple-400">
              <CreditCard size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Factures Payées</p>
          <p className="text-3xl font-bold text-purple-400">{data?.paidInvoices || 0}</p>
        </div>
      </div>

      {/* Subscription Plans */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Plans d'Abonnement</h2>
        <div className="space-y-3">
          {data?.subscriptionPlans.map((plan, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm text-gray-400">${(plan.price / 100).toFixed(2)}/mois</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-2xl">{plan.count}</p>
                <p className="text-xs text-gray-400">abonnés</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Subscribers */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Top Abonnés</h2>
        <div className="space-y-2">
          {data?.topSubscribers.map((sub, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-700/50 rounded">
              <div>
                <p className="font-medium">{sub.name}</p>
                <p className="text-xs text-gray-400">{sub.plan}</p>
              </div>
              <p className="font-bold text-green-400">${(sub.revenue / 100).toFixed(2)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          💡 Tous les revenus incluent les frais de plateforme. Les données se mettent à jour toutes les 24 heures.
        </p>
      </div>
    </div>
  );
}
