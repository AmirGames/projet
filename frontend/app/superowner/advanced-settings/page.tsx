'use client';

import { useState, useEffect } from 'react';
import { Sliders, Save } from 'lucide-react';

interface AdvancedSettings {
  id: string;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  debugMode: boolean;
  enabledFeatures: string[];
  performanceOptimizations: {
    cacheEnabled: boolean;
    cacheDuration: number;
    compressionEnabled: boolean;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const AVAILABLE_FEATURES = [
  { id: 'analytics', label: 'Analytique' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'api', label: 'API Publique' },
  { id: 'exports', label: 'Exports' },
  { id: 'scheduling', label: 'Planification' },
  { id: 'automation', label: 'Automatisation' },
];

export default function AdvancedSettingsPage() {
  const [settings, setSettings] = useState<AdvancedSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/advanced-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors du chargement des paramètres');
      const data = await res.json();
      setSettings(data.settings);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/advanced-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Erreur lors de la sauvegarde');
      }

      const data = await res.json();
      setSettings(data.settings);
      setSuccess('Paramètres sauvegardés avec succès');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (featureId: string) => {
    if (!settings) return;
    setSettings((prev) => {
      if (!prev) return prev;
      const enabledFeatures = prev.enabledFeatures.includes(featureId)
        ? prev.enabledFeatures.filter((f) => f !== featureId)
        : [...prev.enabledFeatures, featureId];
      return { ...prev, enabledFeatures };
    });
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
          <Sliders className="w-8 h-8" />
          Paramètres Avancés
        </h1>
        <p className="text-gray-400 mt-2">Configuration avancée du système</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-900/20 text-green-400 rounded-lg border border-green-500/20">
          {success}
        </div>
      )}

      {settings && (
        <>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Mode Système</h2>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.maintenanceMode}
                    onChange={(e) =>
                      setSettings((prev) => prev ? { ...prev, maintenanceMode: e.target.checked } : prev)
                    }
                    className="w-5 h-5 rounded border-gray-600"
                  />
                  <span className="text-white font-medium">Mode Maintenance</span>
                </label>
                <p className="text-sm text-gray-400 ml-8 mt-1">
                  Désactive l'accès aux utilisateurs réguliers
                </p>
              </div>

              {settings.maintenanceMode && (
                <div className="ml-8 bg-gray-700/30 p-4 rounded-lg">
                  <label className="block text-sm text-gray-400 mb-2">Message de Maintenance</label>
                  <textarea
                    value={settings.maintenanceMessage || ''}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, maintenanceMessage: e.target.value } : prev
                      )
                    }
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-600 border border-gray-600 rounded-lg text-white text-sm"
                    placeholder="Message affiché aux utilisateurs..."
                  />
                </div>
              )}

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.debugMode}
                    onChange={(e) =>
                      setSettings((prev) => prev ? { ...prev, debugMode: e.target.checked } : prev)
                    }
                    className="w-5 h-5 rounded border-gray-600"
                  />
                  <span className="text-white font-medium">Mode Debug</span>
                </label>
                <p className="text-sm text-gray-400 ml-8 mt-1">
                  Active les logs détaillés et les erreurs complètes
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Fonctionnalités Activées</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {AVAILABLE_FEATURES.map((feature) => (
                <label key={feature.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings?.enabledFeatures?.includes(feature.id) ?? false}
                    onChange={() => toggleFeature(feature.id)}
                    className="w-5 h-5 rounded border-gray-600"
                  />
                  <span className="text-gray-300">{feature.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Optimisations de Performance</h2>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.performanceOptimizations.cacheEnabled}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              performanceOptimizations: {
                                ...prev.performanceOptimizations,
                                cacheEnabled: e.target.checked,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-5 h-5 rounded border-gray-600"
                  />
                  <span className="text-white font-medium">Cache Activé</span>
                </label>
              </div>

              {settings.performanceOptimizations.cacheEnabled && (
                <div className="ml-8 bg-gray-700/30 p-4 rounded-lg">
                  <label className="block text-sm text-gray-400 mb-2">Durée du Cache (secondes)</label>
                  <input
                    type="number"
                    value={settings.performanceOptimizations.cacheDuration}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              performanceOptimizations: {
                                ...prev.performanceOptimizations,
                                cacheDuration: parseInt(e.target.value) || 0,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-4 py-2 bg-gray-600 border border-gray-600 rounded-lg text-white text-sm"
                  />
                </div>
              )}

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.performanceOptimizations.compressionEnabled}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              performanceOptimizations: {
                                ...prev.performanceOptimizations,
                                compressionEnabled: e.target.checked,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-5 h-5 rounded border-gray-600"
                  />
                  <span className="text-white font-medium">Compression Activée</span>
                </label>
                <p className="text-sm text-gray-400 ml-8 mt-1">
                  Compresse les réponses API
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium flex items-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button
              onClick={fetchSettings}
              disabled={loading}
              className="px-6 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition font-medium"
            >
              Annuler
            </button>
          </div>
        </>
      )}
    </div>
  );
}
