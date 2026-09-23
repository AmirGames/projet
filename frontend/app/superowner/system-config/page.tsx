'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings, Key, Copy, Save, Database, Webhook, Wrench } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt?: string | null;
  status?: string;
}

interface Configuration {
  apiVersion: string;
  environment: string;
  apiUrl: string;
  webhookUrl: string;
  database: { status: string; version: string };
  webhooks: { enabled: boolean; count: number; active: number };
  apiKeys: ApiKey[];
  platformFeePercent: number;
  minOrderAmount: number;
  maxOrderAmount: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  driverMaxRadiusKm: number;
  driverOfferSeconds: number;
  driverBaseFee: number;
  driverPerKmFee: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SystemConfigPage() {
  const t = useTranslations('superownerSystemConfig');
  const [config, setConfig] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nouvelleCle, setNouvelleCle] = useState('');

  const [formulaire, setFormulaire] = useState({
    platformFeePercent: '',
    minOrderAmount: '',
    maxOrderAmount: '',
    maintenanceMode: false,
    maintenanceMessage: '',
    driverMaxRadiusKm: '',
    driverOfferSeconds: '',
    driverBaseFee: '',
    driverPerKmFee: '',
  });

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/system-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('loadError'));
        return;
      }

      // La réponse encapsule la configuration : la lire à la racine laissait
      // tous les champs vides.
      const c: Configuration = data.config;
      setConfig(c);
      setFormulaire({
        platformFeePercent: String(c.platformFeePercent ?? ''),
        minOrderAmount: String(c.minOrderAmount ?? ''),
        maxOrderAmount: String(c.maxOrderAmount ?? ''),
        maintenanceMode: !!c.maintenanceMode,
        maintenanceMessage: c.maintenanceMessage || '',
        driverMaxRadiusKm: String(c.driverMaxRadiusKm ?? ''),
        driverOfferSeconds: String(c.driverOfferSeconds ?? ''),
        driverBaseFee: String(c.driverBaseFee ?? ''),
        driverPerKmFee: String(c.driverPerKmFee ?? ''),
      });
      setError('');
    } catch {
      setError(t('connectionError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/system-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          minOrderAmount: Number(formulaire.minOrderAmount),
          maxOrderAmount: Number(formulaire.maxOrderAmount),
          maintenanceMode: formulaire.maintenanceMode,
          maintenanceMessage: formulaire.maintenanceMessage,
          driverMaxRadiusKm: Number(formulaire.driverMaxRadiusKm),
          driverOfferSeconds: Math.round(Number(formulaire.driverOfferSeconds)),
          driverBaseFee: Number(formulaire.driverBaseFee),
          driverPerKmFee: Number(formulaire.driverPerKmFee),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || t('saveFailed'));
        return;
      }

      setMessage(t('saveSuccess'));
      await fetchConfig();
    } catch {
      setMessage(t('connectionError'));
    } finally {
      setSaving(false);
    }
  };

  const generateApiKey = async () => {
    if (!newKeyName.trim()) {
      setMessage(t('keyNameRequired'));
      return;
    }

    setCreating(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newKeyName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || t('createKeyFailed'));
        return;
      }

      // La valeur complète n'est renvoyée qu'à la création.
      setNouvelleCle(data.key?.key || '');
      setNewKeyName('');
      setMessage(t('keyCreated'));
      await fetchConfig();
    } catch {
      setMessage(t('connectionError'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Settings className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-2">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {message && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white">
          {message}
        </div>
      )}

      {config && (
        <>
          {/* ---- Réglages modifiables ---- */}
          <form
            onSubmit={enregistrer}
            className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4"
          >
            <h2 className="text-xl font-bold text-white">{t('order_bounds')}</h2>

            {/* La commission se réglait ici, pour tout le monde à la fois. Elle
                appartient maintenant à chaque formule : deux réglages du même
                taux ne pouvaient que se contredire. */}
            <p className="text-sm text-gray-400">
              {t('order_bounds_note')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('min_order')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formulaire.minOrderAmount}
                  onChange={(e) => setFormulaire({ ...formulaire, minOrderAmount: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t('max_order')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formulaire.maxOrderAmount}
                  onChange={(e) => setFormulaire({ ...formulaire, maxOrderAmount: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Attribution des courses : ces réglages existaient en base sans
                aucun écran pour les changer, le rayon restait bloqué à 8 km. */}
            <div className="border-t border-gray-700 pt-4 space-y-3">
              <h3 className="text-lg font-semibold text-white">Livraison et livreurs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Rayon de recherche des livreurs (km)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1" max="50"
                  value={formulaire.driverMaxRadiusKm}
                  onChange={(e) => setFormulaire({ ...formulaire, driverMaxRadiusKm: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Distance maximale boutique ↔ livreur pour proposer une course</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Délai d'acceptation (secondes)</label>
                <input
                  type="number"
                  step="1"
                  min="10" max="600"
                  value={formulaire.driverOfferSeconds}
                  onChange={(e) => setFormulaire({ ...formulaire, driverOfferSeconds: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Temps laissé au livreur avant de passer au suivant</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Rémunération de base (€)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formulaire.driverBaseFee}
                  onChange={(e) => setFormulaire({ ...formulaire, driverBaseFee: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Montant fixe par course</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Rémunération par km (€)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={formulaire.driverPerKmFee}
                  onChange={(e) => setFormulaire({ ...formulaire, driverPerKmFee: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Ajouté pour chaque km</p>
              </div>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formulaire.maintenanceMode}
                  onChange={(e) =>
                    setFormulaire({ ...formulaire, maintenanceMode: e.target.checked })
                  }
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-white flex items-center gap-2">
                  <Wrench size={16} className="text-orange-400" />
                  {t('maintenance_mode')}
                </span>
              </label>
              <p className="text-xs text-gray-500 ml-7">
                {t('maintenance_on')}
              </p>

              <input
                type="text"
                value={formulaire.maintenanceMessage}
                onChange={(e) =>
                  setFormulaire({ ...formulaire, maintenanceMessage: e.target.value })
                }
                placeholder={t('maintenance_message')}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium text-white transition"
            >
              <Save size={16} /> {saving ? t('saving') : t('save')}
            </button>
          </form>

          {/* ---- État technique ---- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-sm">{t('database')}</p>
                <Database size={18} className="text-green-400" />
              </div>
              <p className="text-xl font-bold text-white">{config.database.status}</p>
              <p className="text-xs text-gray-500 mt-1">PostgreSQL {config.database.version}</p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-sm">{t('webhooks')}</p>
                <Webhook size={18} className="text-blue-400" />
              </div>
              <p className="text-xl font-bold text-white">{config.webhooks.count}</p>
              <p className="text-xs text-gray-500 mt-1">{config.webhooks.active} {t('active')}</p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-sm">{t('environment')}</p>
                <Settings size={18} className="text-purple-400" />
              </div>
              <p className="text-xl font-bold text-white">{config.environment}</p>
              <p className="text-xs text-gray-500 mt-1">API v{config.apiVersion}</p>
            </div>
          </div>

          {/* ---- Clés API ---- */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{t('api_keys')}</h2>
                <Key size={20} className="text-blue-400" />
              </div>
              <span className="text-sm text-gray-400">{config.apiKeys?.length || 0} clés</span>
            </div>

            {nouvelleCle && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-sm text-green-400 mb-2">
                  Copiez cette clé maintenant : elle ne sera plus jamais affichée.
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-900 rounded text-green-300 text-sm break-all">
                    {nouvelleCle}
                  </code>
                  <button
                    onClick={() => navigator.clipboard?.writeText(nouvelleCle)}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
                    title="Copier"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            )}

            <div className="bg-gray-700/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
              <label className="block text-sm text-gray-400">Nouvelle clé</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nom de la clé (ex : Production)"
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

            {config.apiKeys?.length > 0 && (
              <div className="divide-y divide-gray-700">
                {config.apiKeys.map((cle) => (
                  <div key={cle.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{cle.name}</p>
                      <code className="text-xs text-gray-500 break-all">{cle.key}</code>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {cle.lastUsedAt
                        ? `Utilisée le ${new Date(cle.lastUsedAt).toLocaleDateString('fr-FR')}`
                        : 'Jamais utilisée'}
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
