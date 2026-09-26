'use client';

import { Fragment, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Shield, AlertCircle } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AuditLog {
  id: string;
  action: string;
  actor: string;
  actorEmail: string;
  resource: string;
  resourceId: string;
  changes: {
    before: Record<string, any>;
    after: Record<string, any>;
  };
  status: 'SUCCESS' | 'FAILURE';
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function AuditLogsPage() {
  const t = useTranslations('superownerAuditLogs');
  const locale = useLocale();
  const localeFormat = locale === 'en' ? 'en-US' : 'fr-FR';
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const limit = 20;

  const actions = ['ALL', 'CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE'];

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (filterAction !== 'ALL') {
        query.append('action', filterAction);
      }
      if (filterStatus !== 'ALL') {
        query.append('status', filterStatus);
      }

      const res = await fetch(`${API_URL}/api/superowner/audit-logs?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const data: AuditLogsResponse = await res.json();
      setLogs(data.logs);
      setTotal(data.pagination.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterStatus, offset, t]);

  useEffectChargement(() => {
    fetchLogs();
  }, [offset, filterAction, filterStatus, fetchLogs]);

  const getStatusColor = (status: string) => {
    return status === 'SUCCESS'
      ? 'bg-green-600 text-white'
      : 'bg-red-600 text-white';
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'text-green-400';
      case 'UPDATE':
        return 'text-blue-400';
      case 'DELETE':
        return 'text-red-400';
      case 'LOGIN':
        return 'text-yellow-400';
      case 'LOGOUT':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Shield className="w-8 h-8" />
            {t('title')}
          </h1>
          <p className="text-gray-400 mt-2">{t('subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20 flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">{t('filterByAction')}</label>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">{t('filterByStatus')}</label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            <option value="ALL">{t('allStatuses')}</option>
            <option value="SUCCESS">{t('success')}</option>
            <option value="FAILURE">{t('failure')}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <Shield className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colAction')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colActor')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colResource')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colStatus')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colDate')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('colDetails')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {logs.map((log) => (
                // La clé doit porter sur l'élément rendu par la boucle : posée
                // sur le <tr> intérieur, React la perd et réutilise mal les
                // lignes d'un rafraîchissement à l'autre.
                <Fragment key={log.id}>
                  <tr className="hover:bg-gray-700/50 transition">
                    <td className={`px-6 py-4 text-sm font-semibold ${getActionColor(log.action)}`}>
                      {log.action}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="text-white">{log.actor}</div>
                      <div className="text-xs text-gray-500">{log.actorEmail}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="text-white">{log.resource}</div>
                      <div className="text-xs text-gray-500">{log.resourceId}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(log.timestamp).toLocaleDateString(localeFormat)}
                      <div className="text-xs">{new Date(log.timestamp).toLocaleTimeString(localeFormat)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition"
                      >
                        {expandedLog === log.id ? t('hide') : t('show')}
                      </button>
                    </td>
                  </tr>
                  {expandedLog === log.id && (
                    <tr className="bg-gray-900/50 border-b border-gray-700">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-bold text-white mb-2">{t('networkInfo')}</h4>
                            <div className="bg-gray-800 rounded p-3 text-xs space-y-1 text-gray-400">
                              <div>IP: <span className="text-gray-300">{log.ipAddress}</span></div>
                              <div className="break-all">User-Agent: <span className="text-gray-300">{log.userAgent}</span></div>
                            </div>
                          </div>
                          {Object.keys(log.changes.before).length > 0 && (
                            <div>
                              <h4 className="text-sm font-bold text-white mb-2">{t('changes')}</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">{t('before')}</p>
                                  <pre className="bg-gray-900 rounded p-2 text-xs overflow-auto max-h-48 text-gray-300">
                                    {JSON.stringify(log.changes.before, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">{t('after')}</p>
                                  <pre className="bg-gray-900 rounded p-2 text-xs overflow-auto max-h-48 text-gray-300">
                                    {JSON.stringify(log.changes.after, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {t('showingRange', { from: offset + 1, to: Math.min(offset + limit, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
