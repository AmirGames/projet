'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Key, Plus, Copy, Trash2 } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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
  const t = useTranslations('superownerApiKeys');
  const locale = useLocale();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [nouvelleCle, setNouvelleCle] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '' });
  const limit = 20;

  const fetchApiKeys = useCallback(async () => {
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

      if (!res.ok) throw new Error(t('loadError'));
      const data: ApiKeysResponse = await res.json();
      setKeys(data.keys);
      setTotal(data.pagination.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [offset, t]);

  useEffectChargement(() => {
    fetchApiKeys();
  }, [offset, fetchApiKeys]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError(t('nameRequired'));
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

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t('createError'));
      }

      const data = await res.json();
      // La clé n'est lisible qu'ici : elle n'est pas stockée en clair.
      setNouvelleCle(data.key?.key || null);
      setFormData({ name: '' });
      setShowForm(false);
      fetchApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm(t('revokeConfirm'))) return;

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/api-keys/${keyId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t('revokeError'));
      }
      fetchApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Key className="w-8 h-8" />
            {t('title')}
          </h1>
          <p className="text-gray-500 mt-2">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg transition"
        >
          <Plus size={20} />
          {t('newKey')}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {nouvelleCle && (
        <div className="p-4 bg-green-50 border border-green-500/30 rounded-lg space-y-3">
          <p className="text-green-600 font-semibold">
            {t('keyCreated')}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="bg-white ring-1 ring-gray-200 px-3 py-2 rounded-sm text-sm break-all">{nouvelleCle}</code>
            <button
              onClick={() => copyToClipboard(nouvelleCle)}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-sm"
              title={t('copy')}
            >
              <Copy size={16} />
            </button>
            <button
              onClick={() => setNouvelleCle(null)}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-sm text-sm"
            >
              {t('copied')}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t('newKeyTitle')}</h2>
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('keyName')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900"
                placeholder={t('keyNamePlaceholder')}
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-sm">
                {t('create')}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-sm"
              >
                {t('cancel')}
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
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Key className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colName')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colKey')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colStatus')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colLastUsed')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((apiKey) => (
                <tr key={apiKey.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm">{apiKey.name}</td>
                  <td className="px-6 py-4 text-sm flex items-center gap-2">
                    <code className="bg-white ring-1 ring-gray-200 px-2 py-1 rounded-sm text-xs">
                      {apiKey.key}
                    </code>
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
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {apiKey.lastUsed ? new Date(apiKey.lastUsed).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR') : t('never')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRevokeKey(apiKey.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-sm transition"
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
        <p className="text-sm text-gray-500">
          {t('showingRange', { from: offset + 1, to: Math.min(offset + limit, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-sm hover:bg-gray-200 disabled:opacity-50"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-sm hover:bg-gray-200 disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
