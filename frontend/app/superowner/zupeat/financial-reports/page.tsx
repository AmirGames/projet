'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { BarChart3, Calendar } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

interface FinancialReport {
  id: string;
  period: string;
  totalRevenue: number;
  platformFees: number;
  refunds: number;
  netRevenue: number;
  transactionCount: number;
  averageOrderValue: number;
  createdAt: string;
}

interface ReportsResponse {
  reports: FinancialReport[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function FinancialReportsPage() {
  const t = useTranslations('superownerFinancialReports');
  const locale = useLocale();
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const token = jetonAcces();
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/financial-reports?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const data: ReportsResponse = await res.json();
      setReports(data.reports || []);
      setTotal(data.pagination?.total ?? data.reports?.length ?? 0);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [offset, t]);

  useEffectChargement(() => {
    fetchReports();
  }, [offset, fetchReports]);

  const localeFormat = locale === 'en' ? 'en-US' : 'fr-FR';

  // Les montants arrivent en euros (Decimal Prisma), pas en centimes.
  const euro = (valeur: number) =>
    Number(valeur || 0).toLocaleString(localeFormat, {
      style: 'currency',
      currency: 'EUR',
    });

  const getPeriodLabel = (period: string) => {
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString(localeFormat, { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-500 mt-2">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200/50">
          <Calendar className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border border-gray-200/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('colPeriod')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('colTotalRevenue')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('colPlatformFees')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('colRefunds')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('colNetRevenue')}</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">{t('colTransactions')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('colAverageValue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{getPeriodLabel(report.period)}</p>
                        <p className="text-xs text-gray-500 mt-1">{report.period}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-green-600">{euro(report.totalRevenue)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-blue-600">{euro(report.platformFees)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-red-600">-{euro(report.refunds)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-purple-600">{euro(report.netRevenue)}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <p className="text-gray-500">{report.transactionCount}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-gray-500">{euro(report.averageOrderValue)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {t('showingRange', { from: offset + 1, to: Math.min(offset + limit, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
