'use client';

/**
 * ZupDrive Admin — Analytics & Reports
 * Métriques de performance, tendances, analyses régionales.
 */

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, TrendingUp, Users, DollarSign, AlertCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AnalyticsPeriod {
  startDate: string;
  endDate: string;
  totalCourses: number;
  totalRevenue: number;
  avgPrice: number;
  totalPassengers: number;
  totalDrivers: number;
  avgRating: number;
  successRate: number;
}

interface RegionalMetrics {
  region: string;
  totalCourses: number;
  totalRevenue: number;
  avgSurgeMultiplier: number;
  activeDrivers: number;
  avgWaitTime: number;
  demandTrend: 'INCREASING' | 'STABLE' | 'DECREASING';
}

export default function AnalyticsPage() {
  const t = useTranslations('superownerZupdriveAnalytics');
  const locale = useLocale() === 'en' ? 'en-US' : 'fr-FR';
  const [metrics, setMetrics] = useState<AnalyticsPeriod | null>(null);
  const [regional, setRegional] = useState<RegionalMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paramètres de période
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Charger les analytics
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });

      const [metricsRes, regionalRes] = await Promise.all([
        fetch(`${API_URL}/api/zupdrive/analytics/period?${params}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch(`${API_URL}/api/zupdrive/analytics/regions?${params}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ]);

      if (!metricsRes.ok || !regionalRes.ok) throw new Error(t('loadError'));

      const metricsData = await metricsRes.json();
      const regionalData = await regionalRes.json();

      setMetrics(metricsData);
      setRegional(regionalData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, t]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </div>

      {/* Sélection de période */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('startDate')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('endDate')}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={loadAnalytics}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              {t('load')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div>
            <h3 className="font-medium text-red-900">{t('errorTitle')}</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
        </div>
      ) : metrics ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('courses')}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.totalCourses}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('revenue')}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    €{(metrics.totalRevenue / 100).toFixed(0)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('avgRating')}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.avgRating.toFixed(2)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-yellow-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('successRate')}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.successRate.toFixed(1)}%</p>
                </div>
                <Users className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-4">{t('periodSummary')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('activeDrivers')}</span>
                  <span className="font-medium">{metrics.totalDrivers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('passengers')}</span>
                  <span className="font-medium">{metrics.totalPassengers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('avgPrice')}</span>
                  <span className="font-medium">€{(metrics.avgPrice / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-4">{t('period')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('from')}</span>
                  <span className="font-medium">{new Date(metrics.startDate).toLocaleDateString(locale)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('to')}</span>
                  <span className="font-medium">{new Date(metrics.endDate).toLocaleDateString(locale)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Analytics régionales */}
          {regional.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-4">{t('byRegion')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-2 text-left text-gray-600">{t('colRegion')}</th>
                      <th className="px-4 py-2 text-left text-gray-600">{t('courses')}</th>
                      <th className="px-4 py-2 text-left text-gray-600">{t('revenue')}</th>
                      <th className="px-4 py-2 text-left text-gray-600">{t('colDrivers')}</th>
                      <th className="px-4 py-2 text-left text-gray-600">{t('colTrend')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regional.map((r) => (
                      <tr key={r.region} className="border-b border-gray-200">
                        <td className="px-4 py-2 font-medium">{r.region}</td>
                        <td className="px-4 py-2">{r.totalCourses}</td>
                        <td className="px-4 py-2">€{(r.totalRevenue / 100).toFixed(0)}</td>
                        <td className="px-4 py-2">{r.activeDrivers}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            r.demandTrend === 'INCREASING' ? 'bg-green-100 text-green-700' :
                            r.demandTrend === 'DECREASING' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {r.demandTrend === 'INCREASING' ? t('trendIncreasing') :
                             r.demandTrend === 'DECREASING' ? t('trendDecreasing') :
                             t('trendStable')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
