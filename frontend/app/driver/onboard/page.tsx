'use client';

import { useState, useEffect } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import { paysDuNavigateur } from '@/lib/pays-client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AlertCircle, CheckCircle, Loader, Bike, Car, Truck } from 'lucide-react';
import Link from 'next/link';

import { useTranslations } from 'next-intl';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const VEHICULES = [
  { valeur: 'bike', libelle: 'Vélo', icone: Bike },
  { valeur: 'scooter', libelle: 'Scooter', icone: Truck },
  { valeur: 'car', libelle: 'Voiture', icone: Car },
];

interface FormData {
  phone: string;
  vehicleType: 'bike' | 'scooter' | 'car';
  vehiclePlate: string;
}

interface FormErrors {
  [key: string]: string;
}

export default function DriverOnboardPage() {
  const t = useTranslations('driverOnboard');
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState<FormData>({
    phone: '',
    vehicleType: 'bike',
    vehiclePlate: '',
  });

  // Rediriger si pas connecté
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/driver/signup');
    }
  }, [user, isLoading, router]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.phone.trim()) {
      newErrors.phone = t('phoneRequired');
    } else if (!/^[\d\s+()-]{9,}$/.test(formData.phone)) {
      newErrors.phone = t('phoneInvalid');
    }

    if (formData.vehicleType !== 'bike' && !formData.vehiclePlate.trim()) {
      newErrors.vehiclePlate = t('plateRequired');
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

      const response = await fetch(`${API_URL}/api/auth/me/become-driver`, {
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
        setApiError(data.message || t('errorMessage'));
        return;
      }

      setSuccessMessage(t('successMessage'));

      // Stocker les infos du livreur
      localStorage.setItem('driverToken', data.accessToken);

      setTimeout(() => {
        router.push('/driver');
      }, 1500);
    } catch (error) {
      setApiError(t('connectionError'));
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center">
              <Bike size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{t('heading')}</h1>
              <p className="text-slate-400">{t('subtitle', { email: user?.email || '' })}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8">
          {apiError && (
            <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex gap-3">
              <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
              <p className="text-red-400">{apiError}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-lg p-4 flex gap-3">
              <CheckCircle className="text-green-400 flex-shrink-0" size={20} />
              <p className="text-green-400">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('phoneLabel')}
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder={t('phonePlaceholder')}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
              {errors.phone && <p className="text-red-400 text-sm mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                {t('vehicleLabel')}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {VEHICULES.map(({ valeur, icone: Icon }) => {
                  const labelKey = valeur === 'bike' ? 'vehicleBike' : valeur === 'scooter' ? 'vehicleScooter' : 'vehicleCar';
                  return (
                    <button
                      key={valeur}
                      type="button"
                      onClick={() => setFormData({ ...formData, vehicleType: valeur as any })}
                      className={`p-4 rounded-lg border-2 transition flex flex-col items-center gap-2 ${
                        formData.vehicleType === valeur
                          ? 'border-orange-500 bg-orange-500/20'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <Icon size={24} className={formData.vehicleType === valeur ? 'text-orange-400' : 'text-slate-400'} />
                      <span className={formData.vehicleType === valeur ? 'text-orange-400 font-medium' : 'text-slate-400'}>
                        {t(labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {formData.vehicleType !== 'bike' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('plateLabelRequired')}
                </label>
                <input
                  type="text"
                  name="vehiclePlate"
                  value={formData.vehiclePlate}
                  onChange={handleChange}
                  placeholder={t('platePlaceholder')}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
                {errors.vehiclePlate && <p className="text-red-400 text-sm mt-1">{errors.vehiclePlate}</p>}
              </div>
            )}

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
              <p className="text-slate-400 text-sm">
                {t('infoMessage')}
              </p>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-600 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader className="animate-spin" size={20} /> : null}
                {loading ? t('registering') : t('registerButton')}
              </button>
              <Link
                href="/"
                className="px-6 py-3 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white font-bold rounded-lg transition"
              >
                {t('cancelButton')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
