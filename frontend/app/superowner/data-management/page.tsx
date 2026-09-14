'use client';

import { useState, useEffect } from 'react';
import { Database, Clock } from 'lucide-react';

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
        throw new Error(data?.error || 'Erreur lors du chargement des données');
      }
      const response = await res.json();
      setData(response);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
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
        throw new Error(data?.error || 'Erreur lors de la création de la sauvegarde');
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setCreating(false);
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
          Gestion des Données
        </h1>
        <p className="text-gray-400 mt-2">Gestion des sauvegardes et des statistiques de base de données</p>
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
              <p className="text-gray-400 text-sm mb-2">Enregistrements Totaux</p>
              <p className="text-3xl font-bold text-white">{data.stats.totalRecords.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-2">Tous les types</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">Taille BD</p>
              <p className="text-3xl font-bold text-blue-400">{data.stats.databaseSize}</p>
              <p className="text-xs text-gray-500 mt-2">Stockage utilisé</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">Dernière Sauvegarde</p>
              <p className="text-sm text-white font-medium">{new Date(data.stats.lastBackup).toLocaleDateString('fr-FR')}</p>
              <p className="text-xs text-gray-500 mt-2">{new Date(data.stats.lastBackup).toLocaleTimeString('fr-FR')}</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">Sauvegardes</p>
              <p className="text-3xl font-bold text-green-400">{data.stats.backupCount}</p>
              <p className="text-xs text-gray-500 mt-2">Disponibles</p>
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Sauvegardes Récentes</h2>
              <button
                onClick={createBackup}
                disabled={creating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium"
              >
                {creating ? 'Création...' : 'Nouvelle Sauvegarde'}
              </button>
            </div>

            {data.backups.length === 0 ? (
              <p className="text-gray-400">Aucune sauvegarde trouvée</p>
            ) : (
              <div className="space-y-3">
                {data.backups.map((backup) => (
                  <div key={backup.id} className="bg-gray-700/20 border border-gray-700/50 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{backup.name}</p>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                        <Clock size={14} />
                        <span>{new Date(backup.createdAt).toLocaleDateString('fr-FR')}</span>
                        <span>•</span>
                        <span>{backup.size}</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(backup.status)}`}>
                      {backup.status}
                    </span>
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
