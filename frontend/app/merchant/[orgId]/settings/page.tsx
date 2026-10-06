'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, ImagePlus, Trash2 } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import Link from 'next/link';
import { useCurrentStore } from '@/lib/current-store';

import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';
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
  // Le logo et la photo de couverture s'enregistrent à l'envoi du fichier,
  // sans attendre le bouton du bas.
  const [logo, setLogo] = useState<string | null>(null);
  const [logoEnCours, setLogoEnCours] = useState(false);
  const [couverture, setCouverture] = useState<string | null>(null);
  const [couvertureEnCours, setCouvertureEnCours] = useState(false);

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
    /**
     * Position de la suggestion d'adresse retenue. Absente, le serveur situe
     * l'adresse lui-même : taper par-dessus une suggestion l'efface donc.
     */
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
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

  const fetchSettings = useCallback(async () => {
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
      setCouverture(settings_obj.banner || null);
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
        latitude: undefined,
        longitude: undefined,
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
      signalerErreur('Error fetching settings:', error);
      setMessage({ type: 'error', text: t('loadError') });
    } finally {
      setLoading(false);
    }
  }, [router, storeId, t]);

  useEffectChargement(() => {
    if (storeId) {
      fetchSettings();
    }
  }, [storeId, fetchSettings]);

  /**
   * Les deux images de la boutique, envoyées et retirées de la même façon :
   * le logo (carré, sur fond blanc) et la photo de couverture (la grande image
   * en tête de la vitrine et sur la carte de la liste).
   */
  const IMAGES = {
    logo: {
      chemin: 'logo',
      champ: 'logo',
      trop: t('images.logo.trop'),
      envoye: t('images.logo.envoye'),
      nonEnvoye: t('images.logo.nonEnvoye'),
      retire: t('images.logo.retire'),
      nonRetire: t('images.logo.nonRetire'),
      appliquer: setLogo,
      enCours: setLogoEnCours,
    },
    banner: {
      chemin: 'banner',
      champ: 'banner',
      trop: t('images.couverture.trop'),
      envoye: t('images.couverture.envoye'),
      nonEnvoye: t('images.couverture.nonEnvoye'),
      retire: t('images.couverture.retire'),
      nonRetire: t('images.couverture.nonRetire'),
      appliquer: setCouverture,
      enCours: setCouvertureEnCours,
    },
  } as const;

  const envoyerImage = async (quelle: keyof typeof IMAGES, fichier: File) => {
    const image = IMAGES[quelle];
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!token || !storeId) return;

    if (fichier.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: image.trop });
      return;
    }

    try {
      image.enCours(true);
      const corps = new FormData();
      corps.append('file', fichier);

      const response = await fetch(`${API_URL}/api/store-settings/${storeId}/${image.chemin}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: corps,
      });
      const lu = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage({ type: 'error', text: lu?.error || image.nonEnvoye });
        return;
      }

      image.appliquer(lu?.[image.champ] || null);
      setMessage({ type: 'success', text: image.envoye });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      signalerErreur(`Error uploading ${quelle}:`, error);
      setMessage({ type: 'error', text: image.nonEnvoye });
    } finally {
      image.enCours(false);
    }
  };

  const retirerImage = async (quelle: keyof typeof IMAGES) => {
    const image = IMAGES[quelle];
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!token || !storeId) return;

    try {
      image.enCours(true);
      const response = await fetch(`${API_URL}/api/store-settings/${storeId}/${image.chemin}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setMessage({ type: 'error', text: image.nonRetire });
        return;
      }

      image.appliquer(null);
      setMessage({ type: 'success', text: image.retire });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      image.enCours(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    const adresse = field === 'address' || field === 'city' || field === 'postalCode';
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(adresse && { latitude: undefined, longitude: undefined }),
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
        setMessage({ type: 'error', text: lu?.error || t('refuses') });
        return;
      }

      // La position de la boutique suit son adresse : si la nouvelle est
      // introuvable, le commerçant doit le savoir, sans quoi aucun livreur ne
      // viendrait sans qu'il comprenne pourquoi.
      if (lu?.settings?.position === 'introuvable') {
        setMessage({
          type: 'error',
          text: t('enregistresAdresseIntrouvable'),
        });
        fetchSettings();
        return;
      }

      setMessage({
        type: 'success',
        text:
          lu?.settings?.position === 'recalculee'
            ? t('enregistresPosition')
            : t('enregistres'),
      });
      setTimeout(() => setMessage(null), 3000);
      fetchSettings();
    } catch (error) {
      signalerErreur('Error saving settings:', error);
      setMessage({ type: 'error', text: t('erreurSauvegarde') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-500">{t('chargement')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/merchant/${orgId}/dashboard`} className="text-red-600 hover:text-red-700 text-sm mb-4 inline-block">
            {t('retourTableau')}
          </Link>
          <h1 className="text-3xl font-bold mb-2">{t('titre')}</h1>
          <p className="text-gray-500">{t('sousTitre')}</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-600' : 'bg-red-50 border border-red-200 text-red-600'}`}>
            {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white border border-gray-200 rounded-lg mb-6">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {(['general', 'contact', 'notifications', 'facturation', 'livraison'] as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-4 font-medium transition-colors text-center whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-b-2 border-red-600 text-red-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t(`onglets.${tab}`)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('logo')}</label>
                  <div className="flex items-center gap-4">
                    {/* Le même fond que la carte vue par les clients : blanc avec
                        un logo, dégradé avec l'initiale. */}
                    <div
                      className={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-300 flex items-center justify-center ${
                        logo ? 'bg-white p-1.5' : 'bg-gradient-to-r from-orange-500 to-red-500'
                      }`}
                    >
                      {logo ? (
                        <img src={logo} alt={t('logo')} className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-2xl font-bold text-gray-900 opacity-50">
                          {formData.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <label
                          className={`bg-orange-600 text-white hover:bg-orange-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                            logoEnCours ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                          }`}
                        >
                          <ImagePlus size={16} />
                          {logo ? t('changerLogo') : t('ajouterLogo')}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={logoEnCours}
                            onChange={(e) => {
                              const fichier = e.target.files?.[0];
                              if (fichier) envoyerImage('logo', fichier);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {logo && (
                          <button
                            type="button"
                            onClick={() => retirerImage('logo')}
                            disabled={logoEnCours}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                            {t('retirer')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {t('logoIdeal')}
                        <br />
                        {t('logoAide')}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('couverture')}</label>
                  {/* L'aperçu au format de la vitrine : la grande image en tête
                      de page, et la carte du commerce dans la liste. */}
                  <div className="relative aspect-[16/6] w-full max-w-xl overflow-hidden rounded-lg border border-gray-300 bg-gradient-to-br from-orange-500 via-orange-600 to-red-600">
                    {couverture ? (
                      <img src={couverture} alt={t('couverture')} className="h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white/80">
                        {t('sansPhoto')}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label
                      className={`bg-orange-600 text-white hover:bg-orange-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                        couvertureEnCours ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <ImagePlus size={16} />
                      {couverture ? t('changerPhoto') : t('ajouterCouverture')}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={couvertureEnCours}
                        onChange={(e) => {
                          const fichier = e.target.files?.[0];
                          if (fichier) envoyerImage('banner', fichier);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {couverture && (
                      <button
                        type="button"
                        onClick={() => retirerImage('banner')}
                        disabled={couvertureEnCours}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                        {t('retirer')}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {t('couvertureAide')}
                    <br />
                    {t('couvertureAide2')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('nom')}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600"
                    placeholder={t('nomPlaceholder')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600 resize-none"
                    placeholder={t('descriptionPlaceholder')}
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.description.length}/500</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('siteWeb')}</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600"
                    placeholder="https://votre-site.com"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('fuseau')}</label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => handleInputChange('timezone', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                    >
                      <option value="">{t('selectionner')}</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/Paris">Europe/Paris</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="America/Los_Angeles">America/Los_Angeles</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('devise')}</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => handleInputChange('currency', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                    >
                      <option value="">{t('selectionner')}</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('langue')}</label>
                    <select
                      value={formData.language}
                      onChange={(e) => handleInputChange('language', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                    >
                      <option value="">{t('selectionner')}</option>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('adresse')}</label>
                  <AddressAutocomplete
                    value={formData.address}
                    onChange={(valeur) => handleInputChange('address', valeur)}
                    onSelect={(adresse) =>
                      setFormData((prev) => ({
                        ...prev,
                        address: adresse.street,
                        city: adresse.city || prev.city,
                        postalCode: adresse.postalCode || prev.postalCode,
                        latitude: adresse.latitude ?? undefined,
                        longitude: adresse.longitude ?? undefined,
                      }))
                    }
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600"
                    placeholder={t('adressePlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('ville')}</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600"
                      placeholder={t('city')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('codePostal')}</label>
                    <input
                      type="text"
                      value={formData.postalCode}
                      onChange={(e) => handleInputChange('postalCode', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600"
                      placeholder={t('codePostal')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('telephone')}</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600"
                    placeholder="+33 1 23 45 67 89"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('email')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600"
                    placeholder={t('emailPlaceholder')}
                  />
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <div>
                    <p className="font-medium">{t('notifCommandes')}</p>
                    <p className="text-sm text-gray-500">{t('notifCommandesAide')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notifications.orderNotifications}
                    onChange={(e) => handleNestedChange('notifications', 'orderNotifications', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <div>
                    <p className="font-medium">{t('notifStock')}</p>
                    <p className="text-sm text-gray-500">{t('notifStockAide')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notifications.lowStockAlerts}
                    onChange={(e) => handleNestedChange('notifications', 'lowStockAlerts', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <div>
                    <p className="font-medium">{t('notifAvis')}</p>
                    <p className="text-sm text-gray-500">{t('notifAvisAide')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notifications.reviewNotifications}
                    onChange={(e) => handleNestedChange('notifications', 'reviewNotifications', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <div>
                    <p className="font-medium">{t('notifEmail')}</p>
                    <p className="text-sm text-gray-500">{t('notifEmailAide')}</p>
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
                    <h3 className="font-semibold text-gray-900">{t('genre')}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('genreAide')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="businessType" className="block text-sm font-medium text-gray-700 mb-2">
                        {t('typeEtablissement')}
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
                        className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                      >
                        <option value="">{t('choisir')}</option>
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
                        <label htmlFor="cuisineType" className="block text-sm font-medium text-gray-700 mb-2">
                          {t('typeCuisine')}
                        </label>
                        <select
                          id="cuisineType"
                          value={formData.cuisineType}
                          onChange={(e) => handleInputChange('cuisineType', e.target.value)}
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                        >
                          <option value="">{t('choisir')}</option>
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

                <section className="space-y-4 border-t border-gray-200 pt-6">
                  <div>
                    <h3 className="font-semibold text-gray-900">{t('identiteFacturation')}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {t.rich('facturationAide', { i: (c) => <em>{c}</em> })}
                    </p>
                  </div>

                  {facturation && (
                    <div
                      className={`rounded-lg border p-4 text-sm ${
                        facturation.propre
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-gray-300 bg-gray-50 text-gray-700'
                      }`}
                    >
                      {facturation.propre ? (
                        <p>
                          {t('facturePropre')}{' '}
                          <strong>{facturation.effective.legalName || '—'}</strong>
                          {facturation.effective.vatNumber && t('tva', { numero: facturation.effective.vatNumber })}
                        </p>
                      ) : (
                        <p>
                          {t('heritee')}{' '}
                          <strong>{facturation.societe.legalName || t('nonRenseignee')}</strong>
                          {facturation.societe.vatNumber && t('tva', { numero: facturation.societe.vatNumber })}
                          {!facturation.societe.legalName && (
                            <>
                              {' — '}
                              <Link href="/merchant/profil" className="underline hover:text-gray-900">
                                {t('completezProfil')}
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="legalName" className="block text-sm font-medium text-gray-700 mb-2">
                        {t('raisonSociale')}
                      </label>
                      <input
                        id="legalName"
                        value={formData.legalName}
                        onChange={(e) => handleInputChange('legalName', e.target.value)}
                        placeholder={facturation?.societe.legalName || t('celleSociete')}
                        className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-700 mb-2">
                        {t('numeroTva')}
                      </label>
                      <input
                        id="vatNumber"
                        value={formData.vatNumber}
                        onChange={(e) => handleInputChange('vatNumber', e.target.value)}
                        placeholder={facturation?.societe.vatNumber || t('celuiSociete')}
                        className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label htmlFor="registrationNumber" className="block text-sm font-medium text-gray-700 mb-2">
                        {t('immatriculation')}
                      </label>
                      <input
                        id="registrationNumber"
                        value={formData.registrationNumber}
                        onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                        placeholder={facturation?.societe.registrationNumber || t('celuiSociete')}
                        className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    {t('compteBancaire')}{' '}
                    <Link href="/merchant/profil" className="underline hover:text-gray-700">
                      {t('votreProfil')}
                    </Link>
                    .
                  </p>
                </section>

                <p className="text-sm text-gray-500 border-t border-gray-200 pt-6">
                  {t.rich('horairesAilleurs', { b: (c) => <strong>{c}</strong> })}
                </p>
              </div>
            )}

            {/* Delivery Tab */}
            {activeTab === 'livraison' && (
              <div className="space-y-6">
                <section className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{t('gestionLivraison')}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('gestionLivraisonAide')}
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-300">
                    <div>
                      <p className="font-medium">{t('propreLivraison')}</p>
                      <p className="text-sm text-gray-500">{t('propreLivraisonAide')}</p>
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
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-blue-700">
                          {t('vousLivrez')}
                        </p>
                        <p className="text-sm text-blue-700">
                          {t('commission')}{' '}
                          <strong>{commissions ? t('pourcent', { n: commissions.propre }) : t('celleFormule')}</strong>{' '}
                          {t('surVentes')}
                        </p>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm text-amber-700">
                          {t('gerezRayon')}{' '}
                          <Link href={`/merchant/${orgId}/delivery-zones`} className="underline hover:text-amber-800">
                            {t('zonesLivraison')}
                          </Link>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1">
                      <p className="text-sm text-blue-700">
                        {t('livreursPlateforme')}
                      </p>
                      <p className="text-sm text-blue-700">
                        {t('rayonPlateforme')}
                      </p>
                      <p className="text-sm text-blue-700">
                        {t('commission')}{' '}
                        <strong>{commissions ? t('pourcent', { n: commissions.plateforme }) : t('majoree')}</strong>{' '}
                        {commissions
                          ? t('surVentesHorsLivraisonAuLieu', { n: commissions.propre })
                          : t('surVentesHorsLivraison')}
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
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            {t('annuler')}
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-orange-600 text-white hover:bg-orange-700 px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? t('saving') : t('enregistrer')}
          </button>
        </div>
      </div>
    </div>
  );
}
