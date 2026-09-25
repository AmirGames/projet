'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, ImagePlus, Trash2 } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import Link from 'next/link';
import { useCurrentStore } from '@/lib/current-store';

import { useTranslations } from 'next-intl';
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
    delivery?: {
      useOwnDelivery?: boolean;
      maxDeliveryRadius?: number;
    };
  };
  businessType?: string | null;
  cuisineType?: string | null;
  facturation?: {
    societe: {
      legalName: string | null;
      vatNumber: string | null;
      registrationNumber: string | null;
      pays: string;
    };
    effective: {
      legalName: string | null;
      vatNumber: string | null;
      registrationNumber: string | null;
    };
    propre: boolean;
  };
}

interface Genre {
  code: string;
  libelle: string;
}

type TabType = 'general' | 'contact' | 'notifications' | 'facturation' | 'livraison';

export default function StoreSettings() {
  const t = useTranslations('merchantSettings');
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const { storeId } = useCurrentStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('general');
  // Le logo s'enregistre à l'envoi du fichier, sans attendre le bouton du bas.
  const [logo, setLogo] = useState<string | null>(null);
  const [logoEnCours, setLogoEnCours] = useState(false);

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
    delivery: {
      useOwnDelivery: false,
    },
    businessType: '',
    cuisineType: '',
    legalName: '',
    vatNumber: '',
    registrationNumber: '',
  });

  // Les genres viennent du serveur : recopiés ici, ils auraient dérivé dès la
  // première addition.
  const [etablissements, setEtablissements] = useState<Genre[]>([]);
  const [cuisines, setCuisines] = useState<Genre[]>([]);
  const [facturation, setFacturation] = useState<StoreSettings['facturation'] | null>(null);
  // Les deux taux de la formule : livrer soi-même, ou avec nos livreurs.
  const [commissions, setCommissions] = useState<{ propre: number; plateforme: number } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!orgId || !token) return;

    fetch(`${API_URL}/api/plans/${orgId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((lu) => {
        const quota = lu?.data?.quota;
        if (quota && typeof quota.tierCommission === 'number') {
          setCommissions({
            propre: quota.tierCommission,
            plateforme: quota.tierPlatformDeliveryCommission ?? quota.tierCommission,
          });
        }
      })
      .catch(() => undefined);
  }, [orgId]);

  useEffect(() => {
    fetch(`${API_URL}/api/stores/types`)
      .then((r) => r.json())
      .then((lu) => {
        setEtablissements(lu?.data?.etablissements || []);
        setCuisines(lu?.data?.cuisines || []);
      })
      .catch(() => undefined);
  }, []);

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
      setLogo(settings_obj.logo || null);
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
        delivery: settings_obj.delivery || {
          useOwnDelivery: false,
        },
        businessType: data.businessType || '',
        cuisineType: data.cuisineType || '',
        legalName: data.legalName || '',
        vatNumber: data.vatNumber || '',
        registrationNumber: data.registrationNumber || '',
      });
      setFacturation(data.facturation || null);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: t('loadError') });
    } finally {
      setLoading(false);
    }
  };

  const envoyerLogo = async (fichier: File) => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!token || !storeId) return;

    if (fichier.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Le logo ne doit pas dépasser 2 Mo' });
      return;
    }

    try {
      setLogoEnCours(true);
      const corps = new FormData();
      corps.append('file', fichier);

      const response = await fetch(`${API_URL}/api/store-settings/${storeId}/logo/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: corps,
      });
      const lu = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage({ type: 'error', text: lu?.error || "Le logo n'a pas pu être envoyé" });
        return;
      }

      setLogo(lu?.logo || null);
      setMessage({ type: 'success', text: 'Logo enregistré' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error uploading logo:', error);
      setMessage({ type: 'error', text: "Le logo n'a pas pu être envoyé" });
    } finally {
      setLogoEnCours(false);
    }
  };

  const retirerLogo = async () => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!token || !storeId) return;

    try {
      setLogoEnCours(true);
      const response = await fetch(`${API_URL}/api/store-settings/${storeId}/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setMessage({ type: 'error', text: "Le logo n'a pas pu être retiré" });
        return;
      }

      setLogo(null);
      setMessage({ type: 'success', text: 'Logo retiré' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setLogoEnCours(false);
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

      const lu = await response.json().catch(() => null);

      // Un refus muet — une TVA au mauvais format, par exemple — laissait
      // croire que tout était enregistré.
      if (!response.ok) {
        setMessage({ type: 'error', text: lu?.error || 'Réglages refusés' });
        return;
      }

      setMessage({ type: 'success', text: 'Réglages enregistrés' });
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
          <div className="flex border-b border-gray-700 overflow-x-auto">
            {(['general', 'contact', 'notifications', 'facturation', 'livraison'] as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-4 font-medium transition-colors text-center whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-b-2 border-red-600 text-red-400'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {tab === 'general' && '🏪 Général'}
                {tab === 'contact' && '📍 Contact'}
                {tab === 'notifications' && '🔔 Notifications'}
                {tab === 'facturation' && '🧾 Facturation'}
                {tab === 'livraison' && '🚚 Livraison'}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Logo de la boutique</label>
                  <div className="flex items-center gap-4">
                    {/* Le même fond que la carte vue par les clients : blanc avec
                        un logo, dégradé avec l'initiale. */}
                    <div
                      className={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-600 flex items-center justify-center ${
                        logo ? 'bg-white p-1.5' : 'bg-gradient-to-r from-orange-500 to-red-500'
                      }`}
                    >
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="Logo de la boutique" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-2xl font-bold text-white opacity-50">
                          {formData.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <label
                          className={`inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 ${
                            logoEnCours ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                          }`}
                        >
                          <ImagePlus size={16} />
                          {logo ? 'Changer le logo' : 'Ajouter un logo'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={logoEnCours}
                            onChange={(e) => {
                              const fichier = e.target.files?.[0];
                              if (fichier) envoyerLogo(fichier);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {logo && (
                          <button
                            type="button"
                            onClick={retirerLogo}
                            disabled={logoEnCours}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                            Retirer
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Idéal : PNG à fond transparent ou blanc, format carré. JPG, PNG ou WebP, 2 Mo maximum.
                        <br />
                        Affiché sur fond blanc sur votre carte dans la liste des restaurants.
                      </p>
                    </div>
                  </div>
                </div>

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
                  <AddressAutocomplete
                    value={formData.address}
                    onChange={(valeur) => handleInputChange('address', valeur)}
                    onSelect={(adresse) =>
                      setFormData((prev) => ({
                        ...prev,
                        address: adresse.street,
                        city: adresse.city || prev.city,
                        postalCode: adresse.postalCode || prev.postalCode,
                      }))
                    }
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
                      placeholder={t('city')}
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

            {/* Le genre du commerce, et sous quelle identité il facture. Les
                horaires par défaut qui occupaient cet onglet faisaient doublon
                avec l'onglet Horaires, et personne ne les lisait. */}
            {activeTab === 'facturation' && (
              <div className="space-y-8">
                <section className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-100">Genre du commerce</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Ce que vend ce commerce, et ce qu&apos;on y mange. Le client s&apos;en
                      sert pour vous trouver.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="businessType" className="block text-sm font-medium text-gray-300 mb-2">
                        Type d&apos;établissement
                      </label>
                      <select
                        id="businessType"
                        value={formData.businessType}
                        onChange={(e) =>
                          handleInputChange(
                            'businessType',
                            e.target.value,
                          )
                        }
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                      >
                        <option value="">Choisir…</option>
                        {etablissements.map((genre) => (
                          <option key={genre.code} value={genre.code}>
                            {genre.libelle}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Une épicerie n'a pas de cuisine : le champ n'apparaît
                        que là où il a un sens. */}
                    {formData.businessType === 'restaurant' && (
                      <div>
                        <label htmlFor="cuisineType" className="block text-sm font-medium text-gray-300 mb-2">
                          Type de cuisine
                        </label>
                        <select
                          id="cuisineType"
                          value={formData.cuisineType}
                          onChange={(e) => handleInputChange('cuisineType', e.target.value)}
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                        >
                          <option value="">Choisir…</option>
                          {cuisines.map((genre) => (
                            <option key={genre.code} value={genre.code}>
                              {genre.libelle}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-4 border-t border-gray-700 pt-6">
                  <div>
                    <h3 className="font-semibold text-gray-100">Identité de facturation</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Ce qui figure sur les factures de <em>cette boutique</em>. Laissez vide si
                      elle relève de votre société : c&apos;est le cas le plus courant.
                    </p>
                  </div>

                  {facturation && (
                    <div
                      className={`rounded-lg border p-4 text-sm ${
                        facturation.propre
                          ? 'border-amber-600/40 bg-amber-900/20 text-amber-200'
                          : 'border-gray-600 bg-gray-700/50 text-gray-300'
                      }`}
                    >
                      {facturation.propre ? (
                        <p>
                          Cette boutique facture sous sa propre identité :{' '}
                          <strong>{facturation.effective.legalName || '—'}</strong>
                          {facturation.effective.vatNumber && ` · TVA ${facturation.effective.vatNumber}`}
                        </p>
                      ) : (
                        <p>
                          Héritée de votre société :{' '}
                          <strong>{facturation.societe.legalName || 'non renseignée'}</strong>
                          {facturation.societe.vatNumber && ` · TVA ${facturation.societe.vatNumber}`}
                          {!facturation.societe.legalName && (
                            <>
                              {' — '}
                              <Link href="/merchant/profil" className="underline hover:text-white">
                                complétez votre profil
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="legalName" className="block text-sm font-medium text-gray-300 mb-2">
                        Raison sociale de la boutique
                      </label>
                      <input
                        id="legalName"
                        value={formData.legalName}
                        onChange={(e) => handleInputChange('legalName', e.target.value)}
                        placeholder={facturation?.societe.legalName || 'Celle de votre société'}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-300 mb-2">
                        Numéro de TVA
                      </label>
                      <input
                        id="vatNumber"
                        value={formData.vatNumber}
                        onChange={(e) => handleInputChange('vatNumber', e.target.value)}
                        placeholder={facturation?.societe.vatNumber || 'Celui de votre société'}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label htmlFor="registrationNumber" className="block text-sm font-medium text-gray-300 mb-2">
                        Numéro d&apos;immatriculation
                      </label>
                      <input
                        id="registrationNumber"
                        value={formData.registrationNumber}
                        onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                        placeholder={facturation?.societe.registrationNumber || 'Celui de votre société'}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    Le compte bancaire et les justificatifs restent au niveau de votre société,
                    dans{' '}
                    <Link href="/merchant/profil" className="underline hover:text-gray-300">
                      votre profil
                    </Link>
                    .
                  </p>
                </section>

                <p className="text-sm text-gray-400 border-t border-gray-700 pt-6">
                  Les horaires d&apos;ouverture se règlent dans l&apos;onglet{' '}
                  <strong>Horaires</strong> de la barre latérale, service par service.
                </p>
              </div>
            )}

            {/* Delivery Tab */}
            {activeTab === 'livraison' && (
              <div className="space-y-6">
                <section className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-100">Gestion de la livraison</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Configurez comment vous gérez les livraisons de vos commandes.
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                    <div>
                      <p className="font-medium">J&apos;utilise ma propre livraison</p>
                      <p className="text-sm text-gray-400">Activez cette option si vous livrez uniquement avec vos propres livreurs</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.delivery.useOwnDelivery}
                      onChange={(e) => handleNestedChange('delivery', 'useOwnDelivery', e.target.checked)}
                      className="w-5 h-5 rounded"
                    />
                  </div>

                  {formData.delivery.useOwnDelivery ? (
                    <div className="space-y-4">
                      <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-blue-300">
                          ✓ Vous livrez vous-même : les frais de livraison de vos zones vous reviennent.
                        </p>
                        <p className="text-sm text-blue-300">
                          Commission de la plateforme :{' '}
                          <strong>{commissions ? `${commissions.propre} %` : 'celle de votre formule'}</strong>{' '}
                          sur vos ventes.
                        </p>
                      </div>

                      <div className="bg-amber-600/10 border border-amber-600/30 rounded-lg p-4">
                        <p className="text-sm text-amber-300">
                          📍 Gérez votre rayon et vos frais de livraison dans l&apos;onglet <Link href={`/merchant/${orgId}/delivery-zones`} className="underline hover:text-amber-200">Zones de livraison</Link>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 space-y-1">
                      <p className="text-sm text-blue-300">
                        ✓ Vos commandes sont livrées par les livreurs de la plateforme. Lorsqu&apos;une commande est prête, un bouton vous permet d&apos;appeler un livreur.
                      </p>
                      <p className="text-sm text-blue-300">
                        Le rayon de livraison est fixé par la plateforme, et les frais sont calculés selon la distance entre votre boutique et l&apos;adresse du client. Le client les paie à la plateforme, qui les reverse au livreur.
                      </p>
                      <p className="text-sm text-blue-300">
                        Commission de la plateforme :{' '}
                        <strong>{commissions ? `${commissions.plateforme} %` : 'majorée'}</strong>{' '}
                        sur vos ventes (hors frais de livraison)
                        {commissions ? `, au lieu de ${commissions.propre} % si vous livrez vous-même` : ''}.
                      </p>
                    </div>
                  )}
                </section>
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
            {saving ? t('saving') : 'Enregistrer les modifications'}
          </button>
        </div>
      </div>
    </div>
  );
}
