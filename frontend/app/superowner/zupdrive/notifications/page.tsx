'use client';

import { useState, useCallback } from 'react';
import { Bell, Share2, AlertCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface NotificationTemplate {
  id: string;
  key: string;
  name: string;
  type: 'EMAIL' | 'SMS' | 'PUSH';
  active: boolean;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

export default function NotificationsPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'webhooks'>('templates');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, webhooksRes] = await Promise.all([
        fetch(`${API_URL}/api/zupdrive/admin/notifications/templates`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch(`${API_URL}/api/zupdrive/admin/webhooks/endpoints`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ]);

      if (!templatesRes.ok || !webhooksRes.ok) throw new Error('Erreur de chargement');

      const templatesData = await templatesRes.json();
      const webhooksData = await webhooksRes.json();

      setTemplates(templatesData);
      setWebhooks(webhooksData);
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
        <h1 className="text-3xl font-bold text-gray-900">Notifications & Webhooks</h1>
        <p className="text-gray-600 mt-2">Gérez les templates et les intégrations externes</p>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => {
            setActiveTab('templates');
            loadData();
          }}
          className={`px-4 py-2 font-medium ${activeTab === 'templates' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          <Bell className="w-4 h-4 inline mr-2" />
          Templates
        </button>
        <button
          onClick={() => {
            setActiveTab('webhooks');
            loadData();
          }}
          className={`px-4 py-2 font-medium ${activeTab === 'webhooks' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          <Share2 className="w-4 h-4 inline mr-2" />
          Webhooks
        </button>
      </div>

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
          {activeTab === 'templates' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((t) => (
                <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    <span className={`text-xs px-2 py-1 rounded ${
                      t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {t.active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Clé: {t.key}</p>
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                    {t.type}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'webhooks' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">URL</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Événements</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((w) => (
                    <tr key={w.id} className="border-b border-gray-200">
                      <td className="px-4 py-3 text-sm font-mono">{w.url}</td>
                      <td className="px-4 py-3 text-sm">{w.events.length} événement(s)</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          w.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {w.active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
