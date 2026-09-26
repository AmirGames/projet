'use client';

import { useState } from 'react';
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
  duration: number;
}

export default function AccessLogsPage() {
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
      console.error('Erreur:', error);
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
      log.ipAddress.includes(search);
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
      ['Date', 'Utilisateur', 'Email', 'Ressource', 'Action', 'Statut', 'IP', 'Durée (ms)'].join(','),
      ...filteredLogs.map(log =>
        [
          new Date(log.timestamp).toLocaleString('fr-FR'),
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

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Journaux d'Accès</h1>
        <p className="text-gray-400 mt-1">Suivi détaillé des accès aux ressources</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">Total</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-xs text-gray-400 mt-1">accès enregistrés</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">Réussis</p>
          <p className="text-2xl font-bold text-green-400">{stats.success}</p>
          <p className="text-xs text-gray-400 mt-1">{((stats.success / stats.total) * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">Échoués</p>
          <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
          <p className="text-xs text-gray-400 mt-1">{((stats.failed / stats.total) * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">Refusés</p>
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
              placeholder="Chercher par email, ressource ou IP..."
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
              <option value="ALL">Tous les statuts</option>
              <option value="SUCCESS">Réussis</option>
              <option value="FAILED">Échoués</option>
              <option value="DENIED">Refusés</option>
            </select>
          </div>

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
          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 font-medium transition-colors w-full md:w-auto"
        >
          <Download size={20} />
          Exporter CSV
        </button>
      </div>

      {/* Access Logs Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Aucun journal d'accès trouvé.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-4 text-left">Date/Heure</th>
                <th className="px-6 py-4 text-left">Utilisateur</th>
                <th className="px-6 py-4 text-left">Ressource</th>
                <th className="px-6 py-4 text-left">Action</th>
                <th className="px-6 py-4 text-center">Statut</th>
                <th className="px-6 py-4 text-left">IP</th>
                <th className="px-6 py-4 text-right">Durée (ms)</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-gray-400 text-xs">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      {new Date(log.timestamp).toLocaleString('fr-FR')}
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
                  <td className="px-6 py-4 text-right text-gray-400">{log.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-gray-400 text-sm">
        Affichés: <strong>{filteredLogs.length}</strong> sur <strong>{stats.total}</strong> journal(s)
      </div>
    </div>
  );
}
