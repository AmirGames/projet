'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Database, Clock, Download, RotateCcw, Trash2 } from 'lucide-react';

interface DataStats {
  totalRecords: number;
  databaseSize: string;
  lastBackup: string;
  backupCount: number;
}

interface Backup {
  id: string;
  name: string;
  size: string;
  createdAt: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
}

interface DataResponse {
  stats: DataStats;
  backups: Backup[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DataManagementPage() {
  const t = useTranslations('superownerDataManagement');
  const locale = useLocale();
  const localeFormat = locale === 'en' ? 'en-US' : 'fr-FR';
  const [data, setData] = useState<DataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/data-management`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t('loadError'));
      }
      const response = await res.json();
      setData(response);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/backups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t('createError'));
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setCreating(false);
    }
  };

  const actionSauvegarde = async (id: string, action: 'restore' | 'delete') => {
    const confirmation = action === 'restore' ? t('confirmRestore') : t('confirmDelete');

    if (!confirm(confirmation)) return;

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/backups/${id}${action === 'restore' ? '/restore' : ''}`, {
        method: action === 'restore' ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const corps = await res.json().catch(() => null);
        throw new Error(corps?.error || t('operationFailed'));
      }

      setError('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('operationFailed'));
    }
  };

  const telecharger = async (id: string, nom: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/backups/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const corps = await res.json().catch(() => null);
        throw new Error(corps?.error || t('downloadFailed'));
      }

      // Le fichier arrive via une requête authentifiée : on le matérialise ici.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = nom;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('downloadFailed'));
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      COMPLETED: 'bg-green-500/10 text-green-400 border-green-500/20',
      IN_PROGRESS: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Database className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-2">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">{t('totalRecords')}</p>
              <p className="text-3xl font-bold text-white">{data.stats.totalRecords.toLocaleString(localeFormat)}</p>
              <p className="text-xs text-gray-500 mt-2">{t('allTypes')}</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">{t('dbSize')}</p>
              <p className="text-3xl font-bold text-blue-400">{data.stats.databaseSize}</p>
              <p className="text-xs text-gray-500 mt-2">{t('storageUsed')}</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">{t('lastBackup')}</p>
              <p className="text-sm text-white font-medium">{new Date(data.stats.lastBackup).toLocaleDateString(localeFormat)}</p>
              <p className="text-xs text-gray-500 mt-2">{new Date(data.stats.lastBackup).toLocaleTimeString(localeFormat)}</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">{t('backups')}</p>
              <p className="text-3xl font-bold text-green-400">{data.stats.backupCount}</p>
              <p className="text-xs text-gray-500 mt-2">{t('available')}</p>
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{t('recentBackups')}</h2>
              <button
                onClick={createBackup}
                disabled={creating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium"
              >
                {creating ? t('creating') : t('newBackup')}
              </button>
            </div>

            {data.backups.length === 0 ? (
              <p className="text-gray-400">{t('empty')}</p>
            ) : (
              <div className="space-y-3">
                {data.backups.map((backup) => (
                  <div key={backup.id} className="bg-gray-700/20 border border-gray-700/50 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{backup.name}</p>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                        <Clock size={14} />
                        <span>{new Date(backup.createdAt).toLocaleDateString(localeFormat)}</span>
                        <span>•</span>
                        <span>{backup.size}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(backup.status)}`}>
                        {backup.status}
                      </span>
                      {backup.status === 'COMPLETED' && (
                        <>
                          <button
                            onClick={() => telecharger(backup.id, backup.name)}
                            title={t('download')}
                            className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => actionSauvegarde(backup.id, 'restore')}
                            title={t('restore')}
                            className="p-2 bg-blue-600 hover:bg-blue-700 rounded"
                          >
                            <RotateCcw size={16} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => actionSauvegarde(backup.id, 'delete')}
                        title={t('delete')}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
