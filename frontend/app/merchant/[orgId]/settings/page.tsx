'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useCurrentStore } from '@/lib/current-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StoreSettings {
  id: string;
  name: string;
  slug: string;
  description?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  settings?: {
    website?: string;
    timezone?: string;
    currency?: string;
    language?: string;
    logo?: string;
    banner?: string;
    notifications?: {
      orderNotifications?: boolean;
      lowStockAlerts?: boolean;
      reviewNotifications?: boolean;
      emailNotifications?: boolean;
    };
    businessHours?: {
      defaultOpen?: string;
      defaultClose?: string;
    };
  };
}

type TabType = 'general' | 'contact' | 'notifications' | 'business';

export default function StoreSettings() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const { storeId } = useCurrentStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('general');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    website: '',
    timezone: '',
    currency: '',
    language: '',
    address: '',
    city: '',
    postalCode: '',
    phone: '',
    email: '',
    notifications: {
      orderNotifications: false,
      lowStockAlerts: false,
      reviewNotifications: false,
      emailNotifications: false,
    },
    businessHours: {
      defaultOpen: '',
      defaultClose: '',
    },
  });

  useEffect(() => {
    if (storeId) {
      fetchSettings();
    }
  }, [storeId]);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/store-settings/${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      const data = await response.json();
      const settings_obj = data.settings || {};
      setFormData({
        name: data.name || '',
        description: data.description || '',
        website: settings_obj.website || '',
        timezone: settings_obj.timezone || '',
        currency: settings_obj.currency || '',
        language: settings_obj.language || '',
        address: data.address || '',
        city: data.city || '',
        postalCode: data.postalCode || '',
        phone: data.phone || '',
        email: data.email || '',
        notifications: settings_obj.notifications || {
          orderNotifications: false,
          lowStockAlerts: false,
          reviewNotifications: false,
          emailNotifications: false,
        },
        businessHours: settings_obj.businessHours || {
          defaultOpen: '',
          defaultClose: '',
        },
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Erreur lors du chargement des paramètres' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNestedChange = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section as keyof typeof formData] as any),
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/store-settings/${storeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setMessage({ type: 'success', text: 'Paramètres sauvegardés avec succès!' });
      setTimeout(() => setMessage(null), 3000);
      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde des paramètres' });
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

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/merchant/${orgId}/dashboard`} className="text-red-400 hover:text-red-300 text-sm mb-4 inline-block">
            ← Retour au tableau de bord
          </Link>
          <h1 className="text-3xl font-bold mb-2">Paramètres de la Boutique</h1>
          <p className="text-gray-400">Gérez les informations et les préférences de votre boutique</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-600/20 border border-green-600/50 text-green-400' : 'bg-red-600/20 border border-red-600/50 text-red-400'}`}>
            {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg mb-6">
          <div className="flex border-b border-gray-700">
            {(['general', 'contact', 'notifications', 'business'] as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-4 font-medium transition-colors text-center ${
                  activeTab === tab
                    ? 'border-b-2 border-red-600 text-red-400'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {tab === 'general' && '🏪 Général'}
                {tab === 'contact' && '📍 Contact'}
                {tab === 'notifications' && '🔔 Notifications'}
                {tab === 'business' && '⏰ Entreprise'}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Nom de la boutique</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder="Nom de votre boutique"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600 resize-none"
                    placeholder="Description de votre boutique"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.description.length}/500</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Site web</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder="https://votre-site.com"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Fuseau horaire</label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => handleInputChange('timezone', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    >
                      <option value="">Sélectionner</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/Paris">Europe/Paris</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="America/Los_Angeles">America/Los_Angeles</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Devise</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => handleInputChange('currency', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    >
                      <option value="">Sélectionner</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Langue</label>
                    <select
                      value={formData.language}
                      onChange={(e) => handleInputChange('language', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    >
                      <option value="">Sélectionner</option>
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="de">Deutsch</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Tab */}
            {activeTab === 'contact' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Adresse</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder="Votre adresse"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Ville</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                      placeholder="Ville"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Code postal</label>
                    <input
                      type="text"
                      value={formData.postalCode}
                      onChange={(e) => handleInputChange('postalCode', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                      placeholder="Code postal"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Téléphone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder="+33 1 23 45 67 89"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder="contact@votre-boutique.com"
                  />
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <div>
                    <p className="font-medium">Notifications de commandes</p>
                    <p className="text-sm text-gray-400">Recevoir une alerte pour chaque nouvelle commande</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notifications.orderNotifications}
                    onChange={(e) => handleNestedChange('notifications', 'orderNotifications', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <div>
                    <p className="font-medium">Alertes de faible stock</p>
                    <p className="text-sm text-gray-400">Recevoir une alerte quand un produit est en rupture</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notifications.lowStockAlerts}
                    onChange={(e) => handleNestedChange('notifications', 'lowStockAlerts', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <div>
                    <p className="font-medium">Notifications d'avis</p>
                    <p className="text-sm text-gray-400">Recevoir une notification pour chaque nouvel avis client</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notifications.reviewNotifications}
                    onChange={(e) => handleNestedChange('notifications', 'reviewNotifications', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <div>
                    <p className="font-medium">Notifications par email</p>
                    <p className="text-sm text-gray-400">Recevoir des notifications par email en plus du tableau de bord</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notifications.emailNotifications}
                    onChange={(e) => handleNestedChange('notifications', 'emailNotifications', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </div>
              </div>
            )}

            {/* Business Tab */}
            {activeTab === 'business' && (
              <div className="space-y-6">
                <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
                  <p className="text-blue-400 text-sm">ℹ️ Configurez les heures d'ouverture par défaut pour votre boutique</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Heure d'ouverture</label>
                    <input
                      type="time"
                      value={formData.businessHours.defaultOpen}
                      onChange={(e) => handleNestedChange('businessHours', 'defaultOpen', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Heure de fermeture</label>
                    <input
                      type="time"
                      value={formData.businessHours.defaultClose}
                      onChange={(e) => handleNestedChange('businessHours', 'defaultClose', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>

                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">
                    💡 Les paramètres supplémentaires comme les méthodes de paiement, les configurations fiscales et les paramètres de livraison seront ajoutés bientôt.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-4 justify-end">
          <Link
            href={`/merchant/${orgId}/dashboard`}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            Annuler
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 rounded-lg font-medium transition-colors"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </div>
    </div>
  );
}
