'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Copy, Trash2, Eye, EyeOff } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  status: 'ACTIVE' | 'REVOKED';
  lastUsed: string;
  createdAt: string;
}

interface ApiKeysResponse {
  keys: ApiKey[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showFullKey, setShowFullKey] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '' });
  const limit = 20;

  useEffect(() => {
    fetchApiKeys();
  }, [offset]);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/api-keys?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors du chargement des clés API');
      const data: ApiKeysResponse = await res.json();
      setKeys(data.keys);
      setTotal(data.pagination.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Nom de clé requis');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Erreur lors de la création');
      setFormData({ name: '' });
      setShowForm(false);
      fetchApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/api-keys/${keyId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors de la révocation');
      fetchApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Key className="w-8 h-8" />
            Clés API
          </h1>
          <p className="text-gray-400 mt-2">Gestion des clés API pour les intégrations</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus size={20} />
          Nouvelle Clé
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Nouvelle Clé API</h2>
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nom de la clé</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                placeholder="Ma clé API"
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded">
                Créer
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <Key className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucune clé API</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Nom</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Clé</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Statut</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Dernier Accès</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {keys.map((apiKey) => (
                <tr key={apiKey.id} className="hover:bg-gray-700/50 transition">
                  <td className="px-6 py-4 text-sm">{apiKey.name}</td>
                  <td className="px-6 py-4 text-sm flex items-center gap-2">
                    <code className="bg-gray-900 px-2 py-1 rounded text-xs">
                      {showFullKey === apiKey.id ? apiKey.key : apiKey.prefix + '...'}
                    </code>
                    <button
                      onClick={() => setShowFullKey(showFullKey === apiKey.id ? null : apiKey.id)}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      {showFullKey === apiKey.id ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(apiKey.key)}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <Copy size={16} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      apiKey.status === 'ACTIVE'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}>
                      {apiKey.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {new Date(apiKey.lastUsed).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRevokeKey(apiKey.id)}
                      className="p-2 text-red-400 hover:bg-red-900/20 rounded transition"
                      disabled={apiKey.status === 'REVOKED'}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Affichage {offset + 1} à {Math.min(offset + limit, total)} sur {total}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            Précédent
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
