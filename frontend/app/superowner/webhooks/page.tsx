'use client';

import { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Eye, EyeOff, Copy, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: 'ACTIVE' | 'INACTIVE' | 'FAILED';
  lastTriggered: string;
  createdAt: string;
  retryCount: number;
}

interface WebhooksResponse {
  webhooks: Webhook[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showUrl, setShowUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({ url: '', events: [] as string[] });
  const limit = 20;

  const availableEvents = [
    'order.created',
    'order.updated',
    'order.completed',
    'order.cancelled',
    'payment.processed',
    'user.registered',
    'store.created',
    'store.updated',
    'product.added',
    'product.updated',
  ];

  useEffect(() => {
    fetchWebhooks();
  }, [offset]);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/webhooks?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors du chargement des webhooks');
      const data: WebhooksResponse = await res.json();
      setWebhooks(data.webhooks);
      setTotal(data.pagination.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.url.trim()) {
      setError('URL du webhook requise');
      return;
    }

    if (formData.events.length === 0) {
      setError('Sélectionnez au moins un événement');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Erreur lors de la création');
      setFormData({ url: '', events: [] });
      setShowForm(false);
      fetchWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce webhook?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors de la suppression');
      fetchWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-600 text-white';
      case 'INACTIVE':
        return 'bg-gray-600 text-white';
      case 'FAILED':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Globe className="w-8 h-8" />
            Webhooks & Intégrations
          </h1>
          <p className="text-gray-400 mt-2">Gestion des webhooks pour les intégrations externes</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus size={20} />
          Nouveau Webhook
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20 flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Nouveau Webhook</h2>
          <form onSubmit={handleCreateWebhook} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">URL du Webhook</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                placeholder="https://example.com/webhook"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Événements</label>
              <div className="bg-gray-700 border border-gray-600 rounded p-4 space-y-2 max-h-48 overflow-y-auto">
                {availableEvents.map((event) => (
                  <label key={event} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.events.includes(event)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({
                            ...formData,
                            events: [...formData.events, event],
                          });
                        } else {
                          setFormData({
                            ...formData,
                            events: formData.events.filter((evt) => evt !== event),
                          });
                        }
                      }}
                      className="w-4 h-4"
                    />
                    {event}
                  </label>
                ))}
              </div>
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
      ) : webhooks.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <Globe className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucun webhook configuré</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">URL</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Événements</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Statut</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Dernier Appel</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {webhooks.map((webhook) => (
                <tr key={webhook.id} className="hover:bg-gray-700/50 transition">
                  <td className="px-6 py-4 text-sm flex items-center gap-2">
                    <code className="bg-gray-900 px-2 py-1 rounded text-xs max-w-xs truncate">
                      {showUrl === webhook.id ? webhook.url : webhook.url.substring(0, 20) + '...'}
                    </code>
                    <button
                      onClick={() => setShowUrl(showUrl === webhook.id ? null : webhook.id)}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      {showUrl === webhook.id ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(webhook.url)}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <Copy size={16} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.slice(0, 2).map((event) => (
                        <span key={event} className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded text-xs">
                          {event}
                        </span>
                      ))}
                      {webhook.events.length > 2 && (
                        <span className="text-gray-400 text-xs">+{webhook.events.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(webhook.status)}`}>
                      {webhook.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {new Date(webhook.lastTriggered).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      className="p-2 text-red-400 hover:bg-red-900/20 rounded transition"
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
