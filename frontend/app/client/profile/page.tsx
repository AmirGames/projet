'use client';

import { useCallback, useEffect, useState } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import { paysDuNavigateur } from '@/lib/pays-client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { User, Mail, ShoppingBag, Wallet, Save } from 'lucide-react';
import { euro } from '@/lib/format';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
interface Profil {
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  memberSince: string;
  totalOrders: number;
  totalSpent: number;
}

export default function ProfilClientPage() {
  const t = useTranslations('clientProfile');
  const router = useRouter();

  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [formulaire, setFormulaire] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
  });

  const charger = useCallback(async () => {
    const token = localStorage.getItem('accessToken');

    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const reponse = await fetch(`${API_URL}/api/client/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        // Un compte qui n'a jamais commandé n'a pas encore de fiche client.
        setErreur(donnees.error || t('profileNotCreated'));
        return;
      }

      setProfil(donnees.data);
      setFormulaire({
        name: donnees.data.name || '',
        phone: donnees.data.phone || '',
        address: donnees.data.address || '',
        city: donnees.data.city || '',
        postalCode: donnees.data.postalCode || '',
      });
    } catch {
      setErreur(t('connectionError'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    charger();
  }, [charger]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnregistrement(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/client/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formulaire.name,
          phone: formulaire.phone ? telephoneInternational(formulaire.phone, paysDuNavigateur()) : undefined,
          address: formulaire.address,
          city: formulaire.city,
          postalCode: formulaire.postalCode,
        }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || t('saveError')}`);
        return;
      }

      setMessage(t('savedSuccess'));
    } catch {
      setMessage(t('connectionError'));
    } finally {
      setEnregistrement(false);
    }
  };

  const champ = (cle: keyof typeof formulaire) => ({
    value: formulaire[cle],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormulaire({ ...formulaire, [cle]: e.target.value }),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <User size={28} className="text-orange-500" />
          {t('title')}
        </h1>
        {profil && (
          <p className="text-gray-400 mt-1">
            {t('memberSince', { date: new Date(profil.memberSince).toLocaleDateString('fr-FR') })}
          </p>
        )}
      </div>

      {erreur && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-gray-300">
          {erreur}
        </div>
      )}

      {profil && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-sm">{t('ordersPlaced')}</p>
                <ShoppingBag size={20} className="text-blue-500" />
              </div>
              <p className="text-3xl font-bold text-white">{profil.totalOrders}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-sm">{t('totalSpent')}</p>
                <Wallet size={20} className="text-green-500" />
              </div>
              <p className="text-3xl font-bold text-white">{euro(profil.totalSpent)}</p>
            </div>
          </div>

          <form onSubmit={enregistrer} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">{t('myInfo')}</h2>

            {message && (
              <div className="bg-gray-700 rounded-lg p-3 text-sm text-white">{message}</div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('email')}</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-400">
                <Mail size={16} />
                <span className="break-all">{profil.email}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('emailInfo')}
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('fullName')}</label>
              <input
                type="text"
                required
                minLength={2}
                {...champ('name')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('phone')}</label>
              <input
                type="tel"
                {...champ('phone')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('deliveryAddress')}</label>
              <AddressAutocomplete
                value={formulaire.address}
                onChange={(valeur) => setFormulaire({ ...formulaire, address: valeur })}
                onSelect={(adresse) =>
                  setFormulaire({
                    ...formulaire,
                    address: adresse.street,
                    city: adresse.city || formulaire.city,
                    postalCode: adresse.postalCode || formulaire.postalCode,
                  })
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-sm text-gray-400 mb-1">{t('postalCode')}</label>
                <input
                  type="text"
                  {...champ('postalCode')}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">{t('city')}</label>
                <input
                  type="text"
                  {...champ('city')}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={enregistrement}
              className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium text-white transition-colors"
            >
              <Save size={16} /> {t('save')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
