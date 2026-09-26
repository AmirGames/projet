'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Commission {
  id: string;
  org: { name: string };
  amount: number;
  percentage: number;
  period: string;
  ordersCount: number;
  totalRevenue: number;
}

interface CommissionData {
  commissions: Commission[];
  summary: {
    totalAmount: number;
    count: number;
  };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCommissions = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const url = new URL(`${API_URL}/api/admin/commissions`);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const fetchedData = await response.json();
      setData(fetchedData);
    } catch (error) {
      signalerErreur('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchCommissions();
  }, []);

  if (loading) return <div className="text-center py-8">Chargement...</div>;
  if (!data) return <div className="text-center py-8 text-red-400">Erreur de chargement</div>;

  // Calculate monthly trend
  const sortedCommissions = [...data.commissions].sort((a, b) =>
    new Date(b.period).getTime() - new Date(a.period).getTime()
  );

  const months = sortedCommissions.slice(0, 12);
  const currentMonth = months[0];
  const previousMonth = months[1];

  const monthlyChange = previousMonth
    ? ((Number(currentMonth?.amount || 0) - Number(previousMonth?.amount || 0)) / Number(previousMonth?.amount || 1)) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Analytics & Commissions</h1>
        <p className="text-gray-400 mt-1">Analyse des commissions et revenus</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Commissions */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Commission totale</p>
          <p className="text-3xl font-bold">{data.summary.totalAmount.toFixed(2)} €</p>
          <p className="text-sm text-gray-400 mt-2">{data.summary.count} périodes</p>
        </div>

        {/* Average Commission */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Commission moyenne</p>
          <p className="text-3xl font-bold">
            {(data.summary.totalAmount / (data.summary.count || 1)).toFixed(2)} €
          </p>
          <p className="text-sm text-gray-400 mt-2">par période</p>
        </div>

        {/* Monthly Trend */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-2">Tendance mensuelle</p>
              <p className="text-3xl font-bold">
                {monthlyChange >= 0 ? '+' : ''}{monthlyChange.toFixed(1)}%
              </p>
            </div>
            {monthlyChange >= 0 ? (
              <TrendingUp size={32} className="text-green-500" />
            ) : (
              <TrendingDown size={32} className="text-red-500" />
            )}
          </div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Détails par mois</h2>
        <div className="space-y-3">
          {months.map((month, idx) => {
            const prevMonth = months[idx + 1];
            const trend = prevMonth ? ((Number(month.amount) - Number(prevMonth.amount)) / Number(prevMonth.amount)) * 100 : 0;

            return (
              <div key={month.id} className="p-4 bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{month.period}</p>
                    <p className="text-sm text-gray-400">
                      {month.ordersCount} commandes • {month.totalRevenue.toFixed(2)} € de revenu
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-400">{month.amount.toFixed(2)} €</p>
                    {idx > 0 && (
                      <p className={`text-sm ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Merchants by Commission */}
      {data.commissions.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">Top commerçants (par revenu)</h2>
          <div className="space-y-3">
            {[...data.commissions]
              .sort((a, b) => Number(b.totalRevenue) - Number(a.totalRevenue))
              .slice(0, 10)
              .map((comm, idx) => (
                <div key={comm.id} className="p-3 bg-gray-700/50 rounded flex items-center justify-between">
                  <div className="flex-1">
                    <span className="text-sm text-gray-400 mr-3">#{idx + 1}</span>
                    <span className="font-medium">{comm.org.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{comm.totalRevenue.toFixed(2)} €</p>
                    <p className="text-sm text-gray-400">{comm.ordersCount} commandes</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
