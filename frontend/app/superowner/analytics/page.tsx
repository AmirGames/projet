'use client';

import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AnalyticsData {
  period: string;
  totalRevenue: number;
  platformFees: number;
  activeUsers: number;
  transactions: number;
  averageOrderValue: number;
  conversionRate: number;
  growthRate: number;
}

interface AnalyticsResponse {
  data: AnalyticsData[];
  summary: {
    totalRevenue: number;
    totalTransactions: number;
    averageOrderValue: number;
    conversionRate: number;
  };
}

type TimeRange = '7days' | '30days' | '90days' | '1year';

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/analytics?period=${timeRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors du chargement des analytics');
      const analyticsData: AnalyticsResponse = await res.json();
      setData(analyticsData.data);
      setSummary(analyticsData.summary);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setLoading(false);
    }
  };

  const getGrowthColor = (growth: number) => {
    return growth >= 0 ? 'text-green-400' : 'text-red-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-8 h-8" />
            Analytics Avancées
          </h1>
          <p className="text-gray-400 mt-2">Analyse détaillée des performances de la plateforme</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setTimeRange('7days')}
          className={`px-4 py-2 rounded transition ${
            timeRange === '7days'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          7 jours
        </button>
        <button
          onClick={() => setTimeRange('30days')}
          className={`px-4 py-2 rounded transition ${
            timeRange === '30days'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          30 jours
        </button>
        <button
          onClick={() => setTimeRange('90days')}
          className={`px-4 py-2 rounded transition ${
            timeRange === '90days'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          90 jours
        </button>
        <button
          onClick={() => setTimeRange('1year')}
          className={`px-4 py-2 rounded transition ${
            timeRange === '1year'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          1 an
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">Revenu Total</p>
              <p className="text-3xl font-bold text-white">
                {(summary?.totalRevenue || 0).toFixed(2)} €
              </p>
              <p className="text-xs text-gray-500 mt-2">Période sélectionnée</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">Transactions</p>
              <p className="text-3xl font-bold text-white">{summary?.totalTransactions || 0}</p>
              <p className="text-xs text-gray-500 mt-2">Nombre total</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">Panier Moyen</p>
              <p className="text-3xl font-bold text-white">
                {(summary?.averageOrderValue || 0).toFixed(2)} €
              </p>
              <p className="text-xs text-gray-500 mt-2">AOV</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">Taux de Conversion</p>
              <p className="text-3xl font-bold text-white">{(summary?.conversionRate || 0).toFixed(2)}%</p>
              <p className="text-xs text-gray-500 mt-2">Conversion rate</p>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="border-b border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white">Évolution Journalière</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700/50 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Période</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Revenu</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Frais</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Utilisateurs</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Transactions</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">AOV</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Croissance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {data.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-700/50 transition">
                      <td className="px-6 py-4 text-sm">{item.period}</td>
                      <td className="px-6 py-4 text-sm">{item.totalRevenue.toFixed(2)} €</td>
                      <td className="px-6 py-4 text-sm">{item.platformFees.toFixed(2)} €</td>
                      <td className="px-6 py-4 text-sm">{item.activeUsers}</td>
                      <td className="px-6 py-4 text-sm">{item.transactions}</td>
                      <td className="px-6 py-4 text-sm">{item.averageOrderValue.toFixed(2)} €</td>
                      <td className={`px-6 py-4 text-sm font-semibold ${getGrowthColor(item.growthRate)}`}>
                        {item.growthRate >= 0 ? '+' : ''}{item.growthRate.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
