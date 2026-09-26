'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Search, Download, Filter, Clock } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AccessLog {
  id: string;
  user: { email: string; name: string };
  resource: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILED' | 'DENIED';
  timestamp: string;
  /** Durée du traitement, en millisecondes. Absente pour les entrées d'avant. */
  duration: number | null;
}

export default function AccessLogsPage() {
  const t = useTranslations('superownerAccessLogs');
  const locale = useLocale();
  const localeFormat = locale === 'en' ? 'en-US' : 'fr-FR';
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'DENIED'>('ALL');
  const [actionFilter, setActionFilter] = useState('');

  const fetchAccessLogs = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/access-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      signalerErreur('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchAccessLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.user.email.toLowerCase().includes(search.toLowerCase()) ||
      log.resource.toLowerCase().includes(search.toLowerCase()) ||
      (log.ipAddress || '').includes(search);
    const matchesStatus = statusFilter === 'ALL' || log.status === statusFilter;
    const matchesAction = !actionFilter || log.action === actionFilter;
    return matchesSearch && matchesStatus && matchesAction;
  });

  const actions = Array.from(new Set(logs.map(l => l.action)));

  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status === 'SUCCESS').length,
    failed: logs.filter(l => l.status === 'FAILED').length,
    denied: logs.filter(l => l.status === 'DENIED').length,
  };

  const exportLogs = () => {
    const csv = [
      [t('colDateTime'), t('colUser'), 'Email', t('colResource'), t('colAction'), t('colStatus'), t('colIp'), t('colDuration')].join(','),
      ...filteredLogs.map(log =>
        [
          new Date(log.timestamp).toLocaleString(localeFormat),
          log.user.name,
          log.user.email,
          log.resource,
          log.action,
          log.status,
          log.ipAddress,
          log.duration,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) return <div className="text-center py-8">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">{t('total')}</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-xs text-gray-400 mt-1">{t('totalSubtitle')}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">{t('success')}</p>
          <p className="text-2xl font-bold text-green-400">{stats.success}</p>
          <p className="text-xs text-gray-400 mt-1">{((stats.success / stats.total) * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">{t('failed')}</p>
          <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
          <p className="text-xs text-gray-400 mt-1">{((stats.failed / stats.total) * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">{t('denied')}</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.denied}</p>
          <p className="text-xs text-gray-400 mt-1">{((stats.denied / stats.total) * 100).toFixed(1)}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">{t('allStatuses')}</option>
              <option value="SUCCESS">{t('success')}</option>
              <option value="FAILED">{t('failed')}</option>
              <option value="DENIED">{t('denied')}</option>
            </select>
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">{t('allActions')}</option>
            {actions.map(action => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </div>

        <button
          onClick={exportLogs}
          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 font-medium transition-colors w-full md:w-auto"
        >
          <Download size={20} />
          {t('exportCsv')}
        </button>
      </div>

      {/* Access Logs Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {t('empty')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-4 text-left">{t('colDateTime')}</th>
                <th className="px-6 py-4 text-left">{t('colUser')}</th>
                <th className="px-6 py-4 text-left">{t('colResource')}</th>
                <th className="px-6 py-4 text-left">{t('colAction')}</th>
                <th className="px-6 py-4 text-center">{t('colStatus')}</th>
                <th className="px-6 py-4 text-left">{t('colIp')}</th>
                <th className="px-6 py-4 text-right">{t('colDuration')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-gray-400 text-xs">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      {new Date(log.timestamp).toLocaleString(localeFormat)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium">{log.user.name}</p>
                      <p className="text-xs text-gray-400">{log.user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs bg-gray-900/50 rounded px-2 py-1">
                    {log.resource}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-600/20 text-green-400'
                          : log.status === 'FAILED'
                          ? 'bg-red-600/20 text-red-400'
                          : 'bg-yellow-600/20 text-yellow-400'
                      }`}
                    >
                      {log.status === 'SUCCESS' && '✅'}
                      {log.status === 'FAILED' && '❌'}
                      {log.status === 'DENIED' && '🚫'}
                      {' '}{log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-400">{log.ipAddress}</td>
                  <td className="px-6 py-4 text-right text-gray-400">
                    {/* Une entrée d'avant la mesure n'a pas de durée : un tiret
                        vaut mieux qu'un zéro, qui se lirait comme instantané. */}
                    {log.duration === null || log.duration === undefined
                      ? '—'
                      : `${log.duration} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-gray-400 text-sm">
        {t('shown', { shown: filteredLogs.length, total: stats.total })}
      </div>
    </div>
  );
}
