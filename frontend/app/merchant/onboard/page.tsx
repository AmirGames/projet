'use client';

import { signalerErreur } from '@/lib/erreurs';
import { slugify } from '@/lib/slug';
import { useState, useEffect } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import { paysDuNavigateur } from '@/lib/pays-client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import Link from 'next/link';

import { useTranslations } from 'next-intl';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FormData {
  businessName: string;
  businessType: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  description: string;
  storeName: string;
  storeSlug: string;
}

interface FormErrors {
  [key: string]: string;
}

export default function MerchantOnboardPage() {
  const t = useTranslations('merchantOnboard');
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState<FormData>({
    businessName: '',
    businessType: 'RESTAURANT',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    description: '',
    storeName: '',
    storeSlug: '',
  });

  // Rediriger si pas connecté
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/merchant/register');
    }
  }, [user, isLoading, router]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.businessName.trim()) {
      newErrors.businessName = t('erreurs.entreprise');
    }

    if (!formData.phone.trim()) {
      newErrors.phone = t('erreurs.telephone');
    }

    if (!formData.address.trim()) {
      newErrors.address = t('erreurs.adresse');
    }

    if (!formData.city.trim()) {
      newErrors.city = t('erreurs.ville');
    }

    if (!formData.postalCode.trim()) {
      newErrors.postalCode = t('erreurs.codePostal');
    }

    if (!formData.description.trim()) {
      newErrors.description = t('erreurs.description');
    }

    if (!formData.storeName.trim()) {
      newErrors.storeName = t('erreurs.boutique');
    }

    if (!formData.storeSlug.trim()) {
      newErrors.storeSlug = t('erreurs.url');
    } else if (!/^[a-z0-9-]+$/.test(formData.storeSlug)) {
      newErrors.storeSlug = t('erreurs.urlFormat');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');
    setSuccessMessage('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('Pas de token');
      }

      const response = await fetch(`${API_URL}/api/auth/me/become-merchant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          phone: telephoneInternational(formData.phone, paysDuNavigateur()),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setApiError(data.message || t('error'));
        return;
      }

      setSuccessMessage('Boutique créée avec succès !');

      // Stocker l'orgId pour le contexte d'authentification
      if (data.organization?.id) {
        localStorage.setItem('currentOrgId', data.organization.id);
      }

      setTimeout(() => {
        router.push(`/merchant/${data.organization?.id || ''}`);
      }, 1500);
    } catch (error) {
      setApiError(t('connectionError'));
      signalerErreur('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'storeSlug' ? slugify(value, false) : value,
      // Génère automatiquement le slug à partir du nom de la boutique
      ...(name === 'storeName' ? { storeSlug: slugify(value) } : {}),
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F6] text-gray-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('creerTitre')}</h1>
          <p className="text-gray-500">Connecté en tant que {user?.email}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-8">
          {apiError && (
            <div className="mb-6 bg-red-100 border border-red-500/50 rounded-lg p-4 flex gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-red-600">{apiError}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 bg-green-100 border border-green-500/50 rounded-lg p-4 flex gap-3">
              <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
              <p className="text-green-600">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('nomEntreprise')}
                </label>
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                />
                {errors.businessName && <p className="text-red-600 text-sm mt-1">{errors.businessName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('typeCommerce')}
                </label>
                <select
                  name="businessType"
                  value={formData.businessType}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="RESTAURANT">{t('types.restaurant')}</option>
                  <option value="BAKERY">{t('types.boulangerie')}</option>
                  <option value="GROCERY">{t('types.epicerie')}</option>
                  <option value="PHARMACY">{t('types.pharmacie')}</option>
                  <option value="FLORIST">{t('types.fleuriste')}</option>
                  <option value="OTHER">{t('types.autre')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('telephone')}
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                />
                {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('nomBoutique')}
                </label>
                <input
                  type="text"
                  name="storeName"
                  value={formData.storeName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                />
                {errors.storeName && <p className="text-red-600 text-sm mt-1">{errors.storeName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('urlBoutique')}
                </label>
                <input
                  type="text"
                  name="storeSlug"
                  placeholder="exemple-boutique"
                  value={formData.storeSlug}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                />
                {errors.storeSlug && <p className="text-red-600 text-sm mt-1">{errors.storeSlug}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('ville')}
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                />
                {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('adresse')}
                </label>
                <AddressAutocomplete
                  clair
                  value={formData.address}
                  onChange={(valeur) => setFormData((prev) => ({ ...prev, address: valeur }))}
                  onSelect={(adresse) =>
                    setFormData((prev) => ({
                      ...prev,
                      address: adresse.street,
                      city: adresse.city || prev.city,
                      postalCode: adresse.postalCode || prev.postalCode,
                    }))
                  }
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                />
                {errors.address && <p className="text-red-600 text-sm mt-1">{errors.address}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('codePostal')}
                </label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                />
                {errors.postalCode && <p className="text-red-600 text-sm mt-1">{errors.postalCode}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('description')}
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
              />
              {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader className="animate-spin" size={20} /> : null}
                {loading ? t('creation') : t('creer')}
              </button>
              <Link
                href="/"
                className="px-6 py-3 border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-bold rounded-lg transition"
              >
                {t('annuler')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
