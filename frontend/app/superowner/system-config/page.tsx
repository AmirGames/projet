'use client';

import { useEffect, useState } from 'react';
import { Settings, Copy, RefreshCw, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SystemConfig {
  apiVersion: string;
  environment: string;
  database: { status: string; version: string };
  cache: { status: string; provider: string };
  webhooks: { enabled: boolean; count: number };
  apiKeys: Array<{ id: string; name: string; lastUsed: string; active: boolean }>;
}

export default function SystemConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showApiForm, setShowApiForm] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');

  useEffect(() => {
    fetchSystemConfig();
  }, []);

  const fetchSystemConfig = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/system-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setConfig(data.config);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateApiKey = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newApiKey }),
      });

      if (!response.ok) throw new Error('Failed to generate');

      setMessage('✅ Clé API générée avec succès!');
      setNewApiKey('');
      setShowApiForm(false);
      setTimeout(() => setMessage(''), 3000);
      fetchSystemConfig();
    } catch (error) {
      console.error('Erreur:', error);
      setMessage('❌ Erreur lors de la génération');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage('✅ Copié!');
    setTimeout(() => setMessage(''), 2000);
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings size={32} />
          Configuration Système
        </h1>
        <p className="text-gray-400 mt-1">Paramètres critiques et clés API</p>
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          {message}
        </div>
      )}

      {/* System Status */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">État du Système</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">API Version</p>
            <p className="font-mono font-bold">{config?.apiVersion || 'N/A'}</p>
          </div>
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Environnement</p>
            <p className="font-bold">{config?.environment || 'N/A'}</p>
          </div>

          <div className="p-4 bg-gray-700/50 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Base de Données</p>
            <div>
              <p className="font-bold">{config?.database.status || 'UNKNOWN'}</p>
              <p className="text-xs text-gray-400">{config?.database.version}</p>
            </div>
          </div>

          <div className="p-4 bg-gray-700/50 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Cache</p>
            <div>
              <p className="font-bold">{config?.cache.status || 'UNKNOWN'}</p>
              <p className="text-xs text-gray-400">{config?.cache.provider}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Webhooks</h2>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${config?.webhooks.enabled ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
            {config?.webhooks.enabled ? '✅ Actif' : '❌ Inactif'}
          </span>
        </div>
        <p className="text-gray-400">Webhooks configurés: <strong>{config?.webhooks.count || 0}</strong></p>
        <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors">
          <RefreshCw size={18} />
          Configurer Webhooks
        </button>
      </div>

      {/* API Keys Management */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Clés API</h2>
          <button
            onClick={() => setShowApiForm(!showApiForm)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors text-sm"
          >
            + Générer Clé
          </button>
        </div>

        {showApiForm && (
          <div className="mb-4 p-4 bg-gray-700/50 rounded-lg space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">Nom de la clé</label>
              <input
                type="text"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="ex: Mobile App, Integration..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowApiForm(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleGenerateApiKey}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors font-medium"
              >
                Générer
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {config?.apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
              <div>
                <p className="font-medium">{key.name}</p>
                <p className="text-xs text-gray-400">Dernière utilisation: {key.lastUsed}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(key.id)}
                  className="p-2 hover:bg-gray-600 rounded transition-colors"
                  title="Copier"
                >
                  <Copy size={18} className="text-blue-400" />
                </button>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    key.active ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                  }`}
                >
                  {key.active ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex gap-3">
        <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-1" />
        <div>
          <p className="font-bold text-red-400 mb-1">⚠️ Attention</p>
          <p className="text-sm text-red-400/80">Les modifications ici affectent la plateforme entière. Procédez avec prudence.</p>
        </div>
      </div>
    </div>
  );
}
