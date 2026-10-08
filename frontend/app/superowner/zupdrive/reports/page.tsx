'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, AlertCircle, Loader2, Download } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ReportsPage() {
  const t = useTranslations('superownerZupdriveReports');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/zupdrive/reporting/admin/scheduled`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error(t('error'));
      const data = await response.json();
      setReports(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </div>

      <button onClick={loadReports} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
        {t('load')}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((r) => (
            <div key={r.id} className="bg-white rounded-lg border p-4">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold">{r.name}</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-sm">{r.frequency}</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{r.reportType}</p>
              <button className="text-blue-600 text-sm font-medium flex items-center gap-1">
                <Download className="w-4 h-4" />
                {t('download')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
