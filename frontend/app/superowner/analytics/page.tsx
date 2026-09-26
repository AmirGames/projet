'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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
  const t = useTranslations('superownerAnalytics');
  const locale = useLocale();
  const euro = (v: number) => (v || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR' });
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');

  // silencieux : une relecture en direct garde la page affichée.
  const fetchAnalytics = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/analytics?period=${timeRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const analyticsData: AnalyticsResponse = await res.json();
      setData(analyticsData.data);
      setSummary(analyticsData.summary);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [t, timeRange]);

  // Les chiffres portent sur toute la plateforme : relus au plus toutes les
  // cinq secondes, quelle que soit l'activité.
  useDonneesModifiees('*', () => fetchAnalytics(true), { delaiMs: 5000 });

  useEffectChargement(() => {
    fetchAnalytics();
  }, [timeRange, fetchAnalytics]);

  const getGrowthColor = (growth: number) => {
    return growth >= 0 ? 'text-green-400' : 'text-red-400';
  };

  const ranges: { key: TimeRange; label: string }[] = [
    { key: '7days', label: t('range7days') },
    { key: '30days', label: t('range30days') },
    { key: '90days', label: t('range90days') },
    { key: '1year', label: t('range1year') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-8 h-8" />
            {t('title')}
          </h1>
          <p className="text-gray-400 mt-2">{t('subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {ranges.map((range) => (
          <button
            key={range.key}
            onClick={() => setTimeRange(range.key)}
            className={`px-4 py-2 rounded transition ${
              timeRange === range.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('totalRevenue')}</p>
              <p className="text-3xl font-bold text-white">
                {euro(summary?.totalRevenue)}
              </p>
              <p className="text-xs text-gray-500 mt-2">{t('selectedPeriod')}</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('transactions')}</p>
              <p className="text-3xl font-bold text-white">{summary?.totalTransactions || 0}</p>
              <p className="text-xs text-gray-500 mt-2">{t('totalCount')}</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('averageCart')}</p>
              <p className="text-3xl font-bold text-white">
                {euro(summary?.averageOrderValue)}
              </p>
              <p className="text-xs text-gray-500 mt-2">AOV</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('conversionRate')}</p>
              <p className="text-3xl font-bold text-white">{(summary?.conversionRate || 0).toFixed(2)}%</p>
              <p className="text-xs text-gray-500 mt-2">{t('conversionRate')}</p>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="border-b border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white">{t('dailyEvolution')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700/50 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('colPeriod')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('colRevenue')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('colFees')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('colUsers')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('colTransactions')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('colAov')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">{t('colGrowth')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {data.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-700/50 transition">
                      <td className="px-6 py-4 text-sm">{item.period}</td>
                      <td className="px-6 py-4 text-sm">{euro(item.totalRevenue)}</td>
                      <td className="px-6 py-4 text-sm">{euro(item.platformFees)}</td>
                      <td className="px-6 py-4 text-sm">{item.activeUsers}</td>
                      <td className="px-6 py-4 text-sm">{item.transactions}</td>
                      <td className="px-6 py-4 text-sm">{euro(item.averageOrderValue)}</td>
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
