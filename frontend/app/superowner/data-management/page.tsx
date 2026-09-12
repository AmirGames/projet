'use client';

import { useEffect, useState } from 'react';
import { Database, Download, Trash2, Shield, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface BackupInfo {
  id: string;
  date: string;
  size: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  type: 'AUTOMATIC' | 'MANUAL';
}

interface DataStats {
  totalUsers: number;
  totalOrganizations: number;
  databaseSize: string;
  lastBackup: string;
  nextBackup: string;
}

export default function DataManagementPage() {
  const [data, setData] = useState<{ stats: DataStats; backups: BackupInfo[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchDataInfo();
  }, []);

  const fetchDataInfo = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/data-management`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/backups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to create backup');

      setMessage('✅ Backup créé avec succès!');
      setTimeout(() => setMessage(''), 3000);
      fetchDataInfo();
    } catch (error) {
      console.error('Erreur:', error);
      setMessage('❌ Erreur lors de la création du backup');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database size={32} />
            Gestion des Données
          </h1>
          <p className="text-gray-400 mt-1">Backups, RGPD et données sensibles</p>
        </div>
        <button
          onClick={handleCreateBackup}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 font-medium transition-colors"
        >
          <Download size={20} />
          Créer Backup
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          {message}
        </div>
      )}

      {/* Data Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Total Utilisateurs</p>
          <p className="text-3xl font-bold">{data?.stats.totalUsers.toLocaleString() || 0}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Organisations</p>
          <p className="text-3xl font-bold">{data?.stats.totalOrganizations || 0}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Taille Base de Données</p>
          <p className="text-3xl font-bold text-blue-400">{data?.stats.databaseSize || '0 GB'}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Prochain Backup</p>
          <p className="text-sm font-mono">{data?.stats.nextBackup || 'N/A'}</p>
        </div>
      </div>

      {/* Backup History */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Shield size={24} />
          Historique des Backups
        </h2>

        {data?.backups && data.backups.length > 0 ? (
          <div className="space-y-3">
            {data.backups.map((backup) => (
              <div key={backup.id} className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium">{backup.date}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs px-2 py-1 bg-gray-600 rounded">
                      {backup.type === 'AUTOMATIC' ? '🤖 Auto' : '👤 Manuel'}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      backup.status === 'SUCCESS'
                        ? 'bg-green-600/20 text-green-400'
                        : backup.status === 'PENDING'
                        ? 'bg-yellow-600/20 text-yellow-400'
                        : 'bg-red-600/20 text-red-400'
                    }`}>
                      {backup.status}
                    </span>
                    <span className="text-xs text-gray-400">{backup.size}</span>
                  </div>
                </div>
                <button className="p-2 hover:bg-gray-600 rounded transition-colors text-blue-400">
                  <Download size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400">Aucun backup trouvé</p>
        )}
      </div>

      {/* GDPR Management */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Gestion RGPD</h2>
        <p className="text-gray-400 mb-4">Suppression de données personnelles et droit à l'oubli</p>
        <div className="space-y-3">
          <button className="w-full p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left transition-colors flex justify-between items-center">
            <div>
              <p className="font-medium">Exporter les données utilisateur</p>
              <p className="text-sm text-gray-400">ZIP avec toutes les données personnelles</p>
            </div>
            <Download size={20} className="text-blue-400" />
          </button>
          <button className="w-full p-4 bg-red-600/20 hover:bg-red-600/30 rounded-lg text-left transition-colors flex justify-between items-center border border-red-600/50">
            <div>
              <p className="font-medium text-red-400">Supprimer les données utilisateur</p>
              <p className="text-sm text-red-400/70">Droit à l'oubli - irréversible</p>
            </div>
            <Trash2 size={20} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex gap-3">
        <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-1" />
        <div>
          <p className="font-bold text-red-400 mb-1">⚠️ Données Sensibles</p>
          <p className="text-sm text-red-400/80">Ces opérations affectent les données de tous les utilisateurs. Sauvegardez toujours avant les suppressions.</p>
        </div>
      </div>
    </div>
  );
}
