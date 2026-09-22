'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Save, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface StoreSettings {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  timezone: string;
  currency: string;
}

export default function AdminSettings() {
  const t = useTranslations('adminSettings');
  const [settings, setSettings] = useState<StoreSettings>({
    name: '',
    description: '',
    address: '',
    phone: '',
    email: '',
    logo: '',
    primaryColor: '#3b82f6',
    secondaryColor: '#10b981',
    timezone: 'Europe/Paris',
    currency: 'EUR',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const storeId = localStorage.getItem('storeId');
      if (storeId) {
        const data = await apiClient.getStore(storeId);
        const storeSettings = typeof data.settings === 'object' ? data.settings : {};
        setSettings(prev => ({
          ...prev,
          name: data.name || '',
          description: data.description || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          logo: storeSettings.logo || '',
          primaryColor: storeSettings.primaryColor || '#3b82f6',
          secondaryColor: storeSettings.secondaryColor || '#10b981',
          timezone: storeSettings.timezone || 'Europe/Paris',
          currency: storeSettings.currency || 'EUR',
        }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const storeId = localStorage.getItem('storeId');
      const token = localStorage.getItem('accessToken') || '';
      if (storeId) {
        await apiClient.updateStore(storeId, settings, token);
        setMessage(t('saveSuccess'));
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage(t('saveError'));
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-8">{t('loading')}</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle size={20} />
          {message}
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Infos générales */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">{t('sectionGeneral')}</h2>
          
          <div>
            <label className="block text-sm font-medium mb-2">{t('storeName')}</label>
            <input
              type="text"
              name="name"
              value={settings.name}
              onChange={handleChange}
              placeholder={t('storeNamePlaceholder')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('description')}</label>
            <textarea
              name="description"
              value={settings.description}
              onChange={handleChange}
              placeholder={t('descriptionPlaceholder')}
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('address')}</label>
            <input
              type="text"
              name="address"
              value={settings.address}
              onChange={handleChange}
              placeholder={t('addressPlaceholder')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('phone')}</label>
              <input
                type="tel"
                name="phone"
                value={settings.phone}
                onChange={handleChange}
                placeholder={t('phonePlaceholder')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('email')}</label>
              <input
                type="email"
                name="email"
                value={settings.email}
                onChange={handleChange}
                placeholder={t('emailPlaceholder')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Design */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">{t('sectionDesign')}</h2>
          
          <div>
            <label className="block text-sm font-medium mb-2">{t('logo')}</label>
            <input
              type="url"
              name="logo"
              value={settings.logo}
              onChange={handleChange}
              placeholder={t('logoPlaceholder')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('primaryColor')}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  name="primaryColor"
                  value={settings.primaryColor}
                  onChange={handleChange}
                  className="w-12 h-10 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  readOnly
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('secondaryColor')}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  name="secondaryColor"
                  value={settings.secondaryColor}
                  onChange={handleChange}
                  className="w-12 h-10 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.secondaryColor}
                  readOnly
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Régionaux */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">{t('sectionRegional')}</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('timezone')}</label>
              <select
                name="timezone"
                value={settings.timezone}
                onChange={handleChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option>Europe/Paris</option>
                <option>Europe/London</option>
                <option>Europe/Brussels</option>
                <option>UTC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('currency')}</label>
              <select
                name="currency"
                value={settings.currency}
                onChange={handleChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option>EUR</option>
                <option>USD</option>
                <option>GBP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-3 rounded-lg transition-colors font-medium"
          >
            <Save size={20} />
            {saving ? t('savingButton') : t('saveButton')}
          </button>
        </div>
      </form>
    </div>
  );
}