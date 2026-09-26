'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { Search, Download, Filter } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface AuditLog {
  id: string;
  admin: { email: string; name: string };
  action: string;
  target: string;
  changes: any;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/admin/audit-logs`, {
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
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.admin.email.includes(search) || log.target.includes(search);
    const matchesAction = !actionFilter || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const exportLogs = () => {
    const csv = [
      ['Date', 'Admin', 'Action', 'Cible', 'Changements'].join(','),
      ...filteredLogs.map(log =>
        [
          new Date(log.createdAt).toLocaleString('fr-FR'),
          log.admin.email,
          log.action,
          log.target,
          JSON.stringify(log.changes),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const actions = Array.from(new Set(logs.map(l => l.action)));

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Journaux d'audit</h1>
        <p className="text-gray-400 mt-1">Historique de toutes les actions admin</p>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder="Chercher par admin ou cible..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Toutes les actions</option>
              {actions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <button
            onClick={exportLogs}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 font-medium transition-colors"
          >
            <Download size={20} />
            Exporter CSV
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 border-b border-gray-600">
            <tr>
              <th className="px-6 py-4 text-left">Date</th>
              <th className="px-6 py-4 text-left">Admin</th>
              <th className="px-6 py-4 text-left">Action</th>
              <th className="px-6 py-4 text-left">Cible</th>
              <th className="px-6 py-4 text-left">Changements</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                <td className="px-6 py-4 text-gray-400">
                  {new Date(log.createdAt).toLocaleString('fr-FR')}
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium">{log.admin.name}</p>
                    <p className="text-xs text-gray-400">{log.admin.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-400">{log.target.slice(0, 20)}</td>
                <td className="px-6 py-4">
                  <details className="cursor-pointer">
                    <summary className="text-blue-400 hover:text-blue-300">Voir détails</summary>
                    <pre className="mt-2 text-xs bg-gray-900 p-2 rounded max-h-40 overflow-auto">
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-gray-400 text-sm">
        Total: <strong>{filteredLogs.length}</strong> log(s)
      </div>
    </div>
  );
}
