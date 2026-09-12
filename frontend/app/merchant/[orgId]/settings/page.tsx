'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Save, Power, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  description?: string;
  settings?: any;
}

export default function SettingsPage() {
  const params = useParams();
  const orgId = params?.orgId as string;

  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    phone: '',
    email: '',
    description: '',
  });
  const [storeStatus, setStoreStatus] = useState<'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED'>('OPEN');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (orgId) {
      fetchStore();
    }
  }, [orgId]);

  const fetchStore = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/stores/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const storeData = data.store || data;
        setStore(storeData);

        const settings = typeof storeData.settings === 'string'
          ? JSON.parse(storeData.settings)
          : storeData.settings || {};

        setFormData({
          name: storeData.name || '',
          address: storeData.address || '',
          city: storeData.city || '',
          postalCode: storeData.postalCode || '',
          phone: storeData.phone || '',
          email: storeData.email || '',
          description: storeData.description || '',
        });

        setStoreStatus(settings.status || 'OPEN');
      }
    } catch (error) {
      console.error('Error fetching store:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!store) return;

    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/stores/${store.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setMessage('✅ Paramètres sauvegardés avec succès');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving store:', error);
      setMessage('❌ Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const toggleStoreStatus = async () => {
    if (!store) return;

    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const newStatus = storeStatus === 'OPEN' ? 'CLOSED' : 'OPEN';

      const response = await fetch(`${API_URL}/api/stores/${store.id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setStoreStatus(newStatus);
        setMessage(`✅ Boutique ${newStatus === 'OPEN' ? 'ouverte' : 'fermée'} avec succès`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Erreur lors du changement de statut');
      }
    } catch (error) {
      console.error('Error toggling store status:', error);
      setMessage('❌ Erreur lors du changement de statut');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des paramètres...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="text-center py-12">
          <p className="text-gray-400">Impossible de charger les paramètres</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">⚙️ Paramètres de Boutique</h1>
          <p className="text-gray-400 mt-1">Gérez les informations de votre boutique</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅')
              ? 'bg-green-600/20 border border-green-600/50 text-green-400'
              : 'bg-red-600/20 border border-red-600/50 text-red-400'
          }`}>
            {message}
          </div>
        )}

        {/* Store Status Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold mb-2">Statut de la Boutique</h2>
              <p className="text-gray-400 text-sm">
                Votre boutique est actuellement <span className={`font-semibold ${
                  storeStatus === 'OPEN' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {storeStatus === 'OPEN' ? 'OUVERTE' : 'FERMÉE'}
                </span>
              </p>
            </div>
            <button
              onClick={toggleStoreStatus}
              disabled={saving}
              className={`p-3 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                storeStatus === 'OPEN'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              } disabled:opacity-50`}
            >
              <Power size={20} />
              {storeStatus === 'OPEN' ? 'Fermer' : 'Ouvrir'}
            </button>
          </div>
        </div>

        {/* Store Information Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">Informations de la Boutique</h2>

          <div>
            <label className="text-sm text-gray-400 block mb-2">Nom de la Boutique</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500 h-24"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-2">Adresse</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-2">Ville</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-2">Code Postal</label>
              <input
                type="text"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-2">Téléphone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="pt-4 border-t border-gray-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>

        {/* Store URL Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">URL de votre Boutique</h2>
          <div className="bg-gray-700 border border-gray-600 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">URL publique:</p>
            <a
              href={`http://localhost:3000/store/${store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 break-all font-mono text-sm"
            >
              http://localhost:3000/store/{store.slug}
            </a>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-600/10 border border-red-600/50 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-1" />
            <div>
              <h2 className="text-lg font-bold text-red-400 mb-2">Zone Dangereuse</h2>
              <p className="text-gray-400 text-sm mb-4">
                Attention: Ces actions sont irréversibles et entraîneront la perte de données.
              </p>
              <button className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors">
                Supprimer cette Boutique
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
