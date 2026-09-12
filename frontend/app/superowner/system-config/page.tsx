'use client';

import { useState, useEffect } from 'react';
import { Settings, Key, Copy } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
}

interface SystemConfig {
  id: string;
  apiUrl: string;
  webhookUrl: string;
  maxRequests: number;
  rateLimitWindow: number;
  apiKeys: ApiKey[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SystemConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/system-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors du chargement de la configuration');
      const data = await res.json();
      setConfig(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setLoading(false);
    }
  };

  const generateApiKey = async () => {
    if (!newKeyName.trim()) {
      setError('Le nom de la clé est requis');
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newKeyName }),
      });

      if (!res.ok) throw new Error('Erreur lors de la création de la clé');
      setNewKeyName('');
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
          <Settings className="w-8 h-8" />
          Configuration Système
        </h1>
        <p className="text-gray-400 mt-2">Paramètres API et configuration du système</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {config && (
        <>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">Configuration API</h2>

            <div>
              <label className="block text-sm text-gray-400 mb-2">URL API</label>
              <input
                type="text"
                value={config.apiUrl}
                readOnly
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">URL Webhooks</label>
              <input
                type="text"
                value={config.webhookUrl}
                readOnly
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Requêtes Max (par fenêtre)</label>
                <input
                  type="number"
                  value={config.maxRequests}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Fenêtre de Limite (secondes)</label>
                <input
                  type="number"
                  value={config.rateLimitWindow}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">Clés API</h2>
                <Key size={20} className="text-blue-400" />
              </div>
              <span className="text-sm text-gray-400">{config.apiKeys?.length || 0} clés</span>
            </div>

            <div className="bg-gray-700/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
              <label className="block text-sm text-gray-400">Nouvelle Clé</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nom de la clé (ex: Production)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-600 border border-gray-600 rounded-lg text-white placeholder-gray-400 text-sm"
                />
                <button
                  onClick={generateApiKey}
                  disabled={creating}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium text-sm"
                >
                  {creating ? 'Génération...' : 'Générer'}
                </button>
              </div>
            </div>

            {config.apiKeys && config.apiKeys.length > 0 && (
              <div className="space-y-2">
                {config.apiKeys.map((key) => (
                  <div key={key.id} className="bg-gray-700/20 border border-gray-700/50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-white">{key.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Créée le {new Date(key.createdAt).toLocaleDateString('fr-FR')}
                        {key.lastUsed && ` • Dernière utilisation: ${new Date(key.lastUsed).toLocaleDateString('fr-FR')}`}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(key.key)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition"
                      title="Copier la clé"
                    >
                      <Copy size={16} className="text-blue-400" />
                    </button>
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
