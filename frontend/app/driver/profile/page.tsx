'use client';

import { useEffect, useState, useCallback } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import { paysDuNavigateur } from '@/lib/pays-client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Mail, Phone, MapPin, FileText, Star } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Driver {
  id: string;
  name: string;
  email?: string;
  phone: string;
  address?: string;
  rating: number | null;
  avis?: number;
  totalEarnings: number;
  completedDeliveries: number;
  isAvailable: boolean;
  status?: string;
  documents?: {
    id_card?: boolean;
    driver_license?: boolean;
    insurance?: boolean;
  };
  createdAt?: string;
}

export default function DriverProfilePage() {
  const t = useTranslations('driverProfile');
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  const loadDriverData = useCallback(async () => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/drivers/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDriver(data.data);
        setFormData({
          name: data.data.name || '',
          email: data.data.email || '',
          phone: data.data.phone || '',
          address: data.data.address || '',
        });
      } else if (response.status === 401) {
        router.push('/driver/login');
      }
    } catch (err) {
      console.error('Error loading driver data:', err);
      setError('Erreur lors du chargement du profil');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadDriverData();
  }, [loadDriverData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('driverToken');
    if (!token) return;

    try {
      setError('');
      setSuccess('');

      const response = await fetch(`${API_URL}/api/drivers/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          phone: formData.phone ? telephoneInternational(formData.phone, paysDuNavigateur()) : formData.phone,
        })
      });

      if (response.ok) {
        setSuccess('Profil mis à jour avec succès');
        setIsEditing(false);
        loadDriverData();
      } else {
        const data = await response.json();
        setError(data.error || 'Erreur lors de la mise à jour');
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Erreur de connexion');
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">Erreur de chargement du profil</p>
          <button
            onClick={() => router.push('/driver')}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Retourner au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="pt-4">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/driver">
                <button className="p-2 hover:bg-gray-700 rounded-lg transition">
                  <ArrowLeft size={20} className="text-gray-400" />
                </button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white">Mon profil</h1>
                <p className="text-gray-400 text-sm">Gérez vos informations personnelles</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-900 border border-red-700 rounded-lg p-4">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-900 border border-green-700 rounded-lg p-4">
            <p className="text-green-200">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Sidebar - Stats */}
          <div className="space-y-6">
            {/* Profile Avatar */}
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <div className="w-24 h-24 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-4xl font-bold mx-auto mb-4">
                {driver.name.charAt(0)}
              </div>
              <p className="text-white text-lg font-semibold">{driver.name}</p>
              <div className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${
                driver.status === 'VALIDATED'
                  ? 'bg-green-900 text-green-400'
                  : driver.status === 'PENDING'
                  ? 'bg-yellow-900 text-yellow-400'
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {driver.status === 'VALIDATED' && '✓ Validé'}
                {driver.status === 'PENDING' && '⏳ En attente de validation'}
                {!driver.status && 'Nouveau'}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-gray-800 rounded-lg p-6 space-y-4">
              <div className="border-b border-gray-700 pb-4">
                <p className="text-gray-400 text-sm mb-2">Note moyenne</p>
                <div className="flex items-center gap-2">
                  <Star size={24} className="text-yellow-500" />
                  <div>
                    {driver.rating == null ? (
                      <p className="text-white font-semibold">Pas encore noté</p>
                    ) : (
                      <>
                        <p className="text-white text-xl font-bold">
                          {driver.rating.toFixed(1).replace('.', ',')}
                        </p>
                        <p className="text-gray-400 text-xs">{driver.avis} avis</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-b border-gray-700 pb-4">
                <p className="text-gray-400 text-sm mb-2">Livraisons complétées</p>
                <p className="text-white text-2xl font-bold">{driver.completedDeliveries}</p>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-2">Revenus totaux</p>
                <p className="text-white text-2xl font-bold">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(driver.totalEarnings || 0)}
                </p>
              </div>
            </div>

            {/* Documents Status */}
            <div className="bg-gray-800 rounded-lg p-6">
              <p className="text-white font-semibold mb-4 flex items-center gap-2">
                <FileText size={18} />
                Documents requis
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Carte d'identité</span>
                  <span className={`text-sm font-semibold ${driver.documents?.id_card ? 'text-green-400' : 'text-red-400'}`}>
                    {driver.documents?.id_card ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Permis de conduire</span>
                  <span className={`text-sm font-semibold ${driver.documents?.driver_license ? 'text-green-400' : 'text-red-400'}`}>
                    {driver.documents?.driver_license ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Assurance</span>
                  <span className={`text-sm font-semibold ${driver.documents?.insurance ? 'text-green-400' : 'text-red-400'}`}>
                    {driver.documents?.insurance ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Profile Form */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Informations personnelles</h2>
                <button
                  onClick={() => {
                    setIsEditing(!isEditing);
                    if (driver) {
                      setFormData({
                        name: driver.name || '',
                        email: driver.email || '',
                        phone: driver.phone || '',
                        address: driver.address || '',
                      });
                    }
                  }}
                  className={`font-semibold py-2 px-4 rounded-lg transition ${
                    isEditing
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {isEditing ? t('cancel') : t('edit')}
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6">
                {/* Name */}
                <div>
                  <label className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                    <User size={16} />
                    Nom complet
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                    <Mail size={16} />
                    Email
                  </label>
                  <input
                    type={t('email')}
                    name={t('email')}
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                    <Phone size={16} />
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    name={t('phone')}
                    value={formData.phone}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                    <MapPin size={16} />
                    Adresse
                  </label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    rows={3}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Submit Button */}
                {isEditing && (
                  <div className="pt-6 border-t border-gray-700">
                    <button
                      type="submit"
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition"
                    >
                      Enregistrer les modifications
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Quick Links */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <Link href="/driver/earnings">
                <button className="w-full bg-gray-800 hover:bg-gray-750 text-white font-semibold py-3 rounded-lg transition border border-gray-700">
                  Voir les revenus
                </button>
              </Link>
              <Link href="/driver/deliveries">
                <button className="w-full bg-gray-800 hover:bg-gray-750 text-white font-semibold py-3 rounded-lg transition border border-gray-700">
                  Historique livraisons
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
