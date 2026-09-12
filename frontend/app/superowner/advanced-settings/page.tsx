'use client';

import { useEffect, useState } from 'react';
import { Settings, AlertCircle, Save } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AdvancedSettings {
  maintenanceMode: boolean;
  debugMode: boolean;
  apiRateLimit: number;
  maxUploadSize: number;
  sessionTimeout: number;
  enableGdpr: boolean;
  enableTwoFactor: boolean;
  enableApiKeys: boolean;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export default function AdvancedSettingsPage() {
  const [settings, setSettings] = useState<AdvancedSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/advanced-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setSettings(data.settings);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof AdvancedSettings) => {
    if (settings) {
      setSettings({
        ...settings,
        [key]: !settings[key],
      });
      setChanged(true);
    }
  };

  const handleNumberChange = (key: keyof AdvancedSettings, value: number) => {
    if (settings) {
      setSettings({
        ...settings,
        [key]: value,
      });
      setChanged(true);
    }
  };

  const handleSelectChange = (key: keyof AdvancedSettings, value: string) => {
    if (settings) {
      setSettings({
        ...settings,
        [key]: value,
      });
      setChanged(true);
    }
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/advanced-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error('Failed to save');

      setMessage('✅ Paramètres sauvegardés avec succès!');
      setChanged(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Erreur:', error);
      setMessage('❌ Erreur lors de la sauvegarde');
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
            <Settings size={32} />
            Paramètres Avancés
          </h1>
          <p className="text-gray-400 mt-1">Configuration système et mode maintenance</p>
        </div>
        {changed && (
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 font-medium transition-colors"
          >
            <Save size={20} />
            Enregistrer
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          {message}
        </div>
      )}

      {/* Maintenance Mode */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Mode Maintenance</h2>
            <p className="text-sm text-gray-400">Mise la plateforme hors ligne pour maintenance</p>
          </div>
          <button
            onClick={() => handleToggle('maintenanceMode')}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
              settings?.maintenanceMode ? 'bg-red-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                settings?.maintenanceMode ? 'translate-x-9' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {settings?.maintenanceMode && (
          <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">⚠️ Mode maintenance actif - Les utilisateurs voient une page de maintenance</p>
          </div>
        )}
      </div>

      {/* Debug Mode */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Mode Debug</h2>
            <p className="text-sm text-gray-400">Logs détaillés et erreurs visibles</p>
          </div>
          <button
            onClick={() => handleToggle('debugMode')}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
              settings?.debugMode ? 'bg-yellow-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                settings?.debugMode ? 'translate-x-9' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* API Configuration */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Configuration API</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Limite de Requêtes (req/min)</label>
          <input
            type="number"
            value={settings?.apiRateLimit || 100}
            onChange={(e) => handleNumberChange('apiRateLimit', parseInt(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Taille Max Upload (MB)</label>
          <input
            type="number"
            value={settings?.maxUploadSize || 100}
            onChange={(e) => handleNumberChange('maxUploadSize', parseInt(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Timeout Session (minutes)</label>
          <input
            type="number"
            value={settings?.sessionTimeout || 30}
            onChange={(e) => handleNumberChange('sessionTimeout', parseInt(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Niveau de Log</label>
          <select
            value={settings?.logLevel || 'INFO'}
            onChange={(e) => handleSelectChange('logLevel', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="DEBUG">Debug</option>
            <option value="INFO">Info</option>
            <option value="WARN">Avertissement</option>
            <option value="ERROR">Erreur</option>
          </select>
        </div>
      </div>

      {/* Security Features */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Fonctionnalités de Sécurité</h2>

        <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded">
          <div>
            <p className="font-medium">RGPD</p>
            <p className="text-sm text-gray-400">Conformité données personnelles</p>
          </div>
          <button
            onClick={() => handleToggle('enableGdpr')}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
              settings?.enableGdpr ? 'bg-green-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                settings?.enableGdpr ? 'translate-x-9' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded">
          <div>
            <p className="font-medium">Authentification 2FA</p>
            <p className="text-sm text-gray-400">Double facteur obligatoire</p>
          </div>
          <button
            onClick={() => handleToggle('enableTwoFactor')}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
              settings?.enableTwoFactor ? 'bg-green-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                settings?.enableTwoFactor ? 'translate-x-9' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded">
          <div>
            <p className="font-medium">Clés API</p>
            <p className="text-sm text-gray-400">Permettre l'utilisation des clés API</p>
          </div>
          <button
            onClick={() => handleToggle('enableApiKeys')}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
              settings?.enableApiKeys ? 'bg-green-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                settings?.enableApiKeys ? 'translate-x-9' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex gap-3">
        <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-1" />
        <div>
          <p className="font-bold text-red-400 mb-1">⚠️ Attention</p>
          <p className="text-sm text-red-400/80">Ces paramètres affectent toute la plateforme. Les modifications sont appliquées immédiatement.</p>
        </div>
      </div>
    </div>
  );
}
