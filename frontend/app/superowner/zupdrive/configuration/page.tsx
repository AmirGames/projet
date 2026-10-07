'use client';

/**
 * ZupDrive Admin — Platform Configuration
 * Commissions, tarifs, paramètres régionaux, settings globaux.
 */

import { useState, useCallback } from 'react';
import { Settings, DollarSign, MapPin, AlertCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Commission {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  appliesTo: string;
  active: boolean;
}

interface RegionalConfig {
  id: string;
  region: string;
  minPrice: number;
  baseSurgeMultiplier: number;
  maxSurgeMultiplier: number;
  active: boolean;
}

export default function ConfigurationPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [regions, setRegions] = useState<RegionalConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'commissions' | 'regions' | 'pricing'>('commissions');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [commissionsRes, regionsRes] = await Promise.all([
        fetch(`${API_URL}/api/zupdrive/admin/config/commissions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch(`${API_URL}/api/zupdrive/admin/config/regions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ]);

      if (!commissionsRes.ok || !regionsRes.ok) throw new Error('Erreur lors du chargement');

      const commissionsData = await commissionsRes.json();
      const regionsData = await regionsRes.json();

      setCommissions(commissionsData);
      setRegions(regionsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configuration</h1>
        <p className="text-gray-600 mt-2">Gérez les commissions, tarifs et paramètres régionaux</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('commissions')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'commissions'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />
          Commissions
        </button>
        <button
          onClick={() => setActiveTab('regions')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'regions'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <MapPin className="w-4 h-4 inline mr-2" />
          Régions
        </button>
        <button
          onClick={() => setActiveTab('pricing')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'pricing'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          Tarification
        </button>
      </div>

      <button
        onClick={loadConfig}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
        Charger les paramètres
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">Erreur</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
        </div>
      ) : (
        <>
          {activeTab === 'commissions' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Nom</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Valeur</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">S'applique à</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">{c.name}</td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                          {c.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {c.type === 'PERCENTAGE' ? `${c.value}%` : `€${c.value / 100}`}
                      </td>
                      <td className="px-6 py-4">{c.appliesTo}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2 py-1 rounded text-sm ${
                          c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {c.active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'regions' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {regions.map((r) => (
                <div key={r.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="font-semibold text-lg mb-3">{r.region}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Prix minimum</span>
                      <span className="font-medium">€{(r.minPrice / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Surge base</span>
                      <span className="font-medium">{r.baseSurgeMultiplier}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Surge max</span>
                      <span className="font-medium">{r.maxSurgeMultiplier}x</span>
                    </div>
                    <div className="pt-2 border-t">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {r.active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'pricing' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <p className="text-gray-600">Les paramètres de tarification sont disponibles via l'API.</p>
              <p className="text-sm text-gray-500 mt-2">Endpoint: POST /api/zupdrive/admin/config/pricing-rules</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
