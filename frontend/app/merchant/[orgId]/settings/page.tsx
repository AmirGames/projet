'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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

type TabType = 'general' | 'contact' | 'notifications' | 'facturation';

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
        businessType: data.businessType || '',
        cuisineType: data.cuisineType || '',
        legalName: data.legalName || '',
        vatNumber: data.vatNumber || '',
        registrationNumber: data.registrationNumber || '',
      });
      setFacturation(data.facturation || null);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: t('errorLoadingSettings') });
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

      const lu = await response.json().catch(() => null);

      // Un refus muet — une TVA au mauvais format, par exemple — laissait
      // croire que tout était enregistré.
      if (!response.ok) {
        setMessage({ type: 'error', text: lu?.error || t('settingsRejected') });
        return;
      }

      setMessage({ type: 'success', text: t('settingsSaved') });
      setTimeout(() => setMessage(null), 3000);
      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: t('errorSavingSettings') });
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
            <p className="text-gray-400">{t('loading')}</p>
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
            {t('backDashboard')}
          </Link>
          <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
          <p className="text-gray-400">{t('description')}</p>
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
            {(['general', 'contact', 'notifications', 'facturation'] as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-4 font-medium transition-colors text-center ${
                  activeTab === tab
                    ? 'border-b-2 border-red-600 text-red-400'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {tab === 'general' && t('tabGeneral')}
                {tab === 'contact' && t('tabContact')}
                {tab === 'notifications' && t('tabNotifications')}
                {tab === 'facturation' && t('tabFacturation')}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldStoreName')}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder={t('placeholderStoreName')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldDescription')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600 resize-none"
                    placeholder={t('placeholderDescription')}
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.description.length}/500</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldWebsite')}</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder={t('placeholderWebsite')}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldTimezone')}</label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => handleInputChange('timezone', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    >
                      <option value="">{t('selectOption')}</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/Paris">Europe/Paris</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="America/Los_Angeles">America/Los_Angeles</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldCurrency')}</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => handleInputChange('currency', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    >
                      <option value="">{t('selectOption')}</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldLanguage')}</label>
                    <select
                      value={formData.language}
                      onChange={(e) => handleInputChange('language', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                    >
                      <option value="">{t('selectOption')}</option>
                      <option value="fr">{t('langFrench')}</option>
                      <option value="en">{t('langEnglish')}</option>
                      <option value="es">{t('langSpanish')}</option>
                      <option value="de">{t('langGerman')}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Tab */}
            {activeTab === 'contact' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldAddress')}</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder={t('placeholderAddress')}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldCity')}</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                      placeholder={t('placeholderCity')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldPostalCode')}</label>
                    <input
                      type="text"
                      value={formData.postalCode}
                      onChange={(e) => handleInputChange('postalCode', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                      placeholder={t('placeholderPostalCode')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldPhone')}</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder={t('placeholderPhone')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('fieldEmail')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
                    placeholder={t('placeholderEmail')}
                  />
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <div>
                    <p className="font-medium">{t('notifOrder')}</p>
                    <p className="text-sm text-gray-400">{t('notifOrderDesc')}</p>
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
                    <p className="font-medium">{t('notifStock')}</p>
                    <p className="text-sm text-gray-400">{t('notifStockDesc')}</p>
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
                    <p className="font-medium">{t('notifReview')}</p>
                    <p className="text-sm text-gray-400">{t('notifReviewDesc')}</p>
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
                    <p className="font-medium">{t('notifEmail')}</p>
                    <p className="text-sm text-gray-400">{t('notifEmailDesc')}</p>
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
                    <h3 className="font-semibold text-gray-100">{t('facturBusinessType')}</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {t('facturBusinessTypeDesc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="businessType" className="block text-sm font-medium text-gray-300 mb-2">
                        {t('fieldBusinessType')}
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
                        <option value="">{t('selectOptionEllipsis')}</option>
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
                          {t('fieldCuisineType')}
                        </label>
                        <select
                          id="cuisineType"
                          value={formData.cuisineType}
                          onChange={(e) => handleInputChange('cuisineType', e.target.value)}
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                        >
                          <option value="">{t('selectOptionEllipsis')}</option>
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
                    <h3 className="font-semibold text-gray-100">{t('facturBillingIdentity')}</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {t('facturBillingIdentityDesc')}
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
                          {t('facturOwnIdentity', { name: facturation.effective.legalName || '—' })}{' '}
                          {facturation.effective.vatNumber && `· TVA ${facturation.effective.vatNumber}`}
                        </p>
                      ) : (
                        <p>
                          {t('facturInheritedIdentity', { name: facturation.societe.legalName || t('notProvided') })}{' '}
                          {facturation.societe.vatNumber && `· TVA ${facturation.societe.vatNumber}`}
                          {!facturation.societe.legalName && (
                            <>
                              {' — '}
                              <Link href="/merchant/profil" className="underline hover:text-white">
                                {t('completeProfile')}
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
                        {t('fieldLegalName')}
                      </label>
                      <input
                        id="legalName"
                        value={formData.legalName}
                        onChange={(e) => handleInputChange('legalName', e.target.value)}
                        placeholder={facturation?.societe.legalName || t('placeholderLegalName')}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-300 mb-2">
                        {t('fieldVatNumber')}
                      </label>
                      <input
                        id="vatNumber"
                        value={formData.vatNumber}
                        onChange={(e) => handleInputChange('vatNumber', e.target.value)}
                        placeholder={facturation?.societe.vatNumber || t('placeholderVatNumber')}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label htmlFor="registrationNumber" className="block text-sm font-medium text-gray-300 mb-2">
                        {t('fieldRegistrationNumber')}
                      </label>
                      <input
                        id="registrationNumber"
                        value={formData.registrationNumber}
                        onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                        placeholder={facturation?.societe.registrationNumber || t('placeholderRegistrationNumber')}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    {t('facturBankAccount')}{' '}
                    <Link href="/merchant/profil" className="underline hover:text-gray-300">
                      {t('yourProfile')}
                    </Link>
                    .
                  </p>
                </section>

                <p className="text-sm text-gray-400 border-t border-gray-700 pt-6">
                  {t('facturHoursNote')}
                </p>
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
            {t('cancel')}
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 rounded-lg font-medium transition-colors"
          >
            {saving ? t('saving') : t('saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}
