'use client';

import { adopterRefresh } from '@/lib/jeton-session';
import { useState, useEffect } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import AcceptationConditions from '@/components/AcceptationConditions';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { confierSessionCentrale } from '@/lib/sso';
import { Bike, Car, Truck } from 'lucide-react';
import { SelecteurPays } from '@/components/SelecteurPays';
import { usePays } from '@/lib/pays-client';
import { PAYS } from '@/lib/pays-infos';

import { useTranslations } from 'next-intl';
import ReglesMotDePasse from '@/components/ReglesMotDePasse';
import { motDePasseValide } from '@/lib/mot-de-passe';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Le libellé de chaque véhicule : `vehicules.<valeur>` des traductions.
const VEHICULES = [
  { valeur: 'bike', icone: Bike },
  { valeur: 'scooter', icone: Truck },
  { valeur: 'car', icone: Car },
];

export default function InscriptionLivreurPage() {
  const t = useTranslations('driverAuth');
  const tMdp = useTranslations('motDePasse');
  const tConditions = useTranslations('acceptationConditions');
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [formulaire, setFormulaire] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    vehicleType: 'bike',
    vehiclePlate: '',
  });
  const [pays, setPays] = usePays();
  const [erreur, setErreur] = useState('');
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  // Rediriger vers onboard si connecté
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/driver/onboard');
    }
  }, [user, authLoading, router]);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    if (!motDePasseValide(formulaire.password)) {
      setErreur(tMdp('invalide'));
      return;
    }

    setEnvoi(true);

    try {
      const reponse = await fetch(`${API_URL}/api/drivers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditionsAcceptees,
          ...formulaire,
          phone: telephoneInternational(formulaire.phone, pays),
          vehiclePlate: formulaire.vehiclePlate || undefined,
        }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || donnees.message || t('inscription.echec'));
        return;
      }

      // L'espace livreur lit son jeton sous une clé dédiée.
      localStorage.setItem('driverToken', donnees.accessToken);
      localStorage.setItem('accessToken', donnees.accessToken);
      // Le jeton de renouvellement devient un cookie httpOnly, il n'est pas gardé.
      await adopterRefresh(donnees.refreshToken);
      if (await confierSessionCentrale(donnees.accessToken, '/driver')) return;
      router.push('/driver');
    } catch {
      setErreur(t('erreurServeur'));
    } finally {
      setEnvoi(false);
    }
  };

  const champ = (cle: keyof typeof formulaire) => ({
    value: formulaire[cle],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormulaire({ ...formulaire, [cle]: e.target.value }),
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bike size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('inscription.titre')}</h1>
          <p className="text-gray-500 mt-2">{t('inscription.sousTitre')}</p>
        </div>

        <form onSubmit={soumettre} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          {erreur && (
            <div className="bg-red-100 border border-red-500/50 rounded-lg p-3 text-red-600 text-sm">
              {erreur}
            </div>
          )}

          <div>
            <label htmlFor="pays" className="block text-sm text-gray-500 mb-1">{t('inscription.pays')}</label>
            <SelecteurPays
              pays={pays}
              onChange={setPays}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('inscription.nom')}</label>
            <input
              type="text"
              required
              minLength={2}
              {...champ('name')}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('inscription.email')}</label>
            <input
              type="email"
              required
              {...champ('email')}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">{t('inscription.telephone')}</label>
            <input
              type="tel"
              required
              minLength={9}
              placeholder={PAYS[pays].exempleTelephone}
              {...champ('phone')}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">
              {t('inscription.motDePasse')}
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              {...champ('password')}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:border-orange-500"
            />
            <ReglesMotDePasse valeur={formulaire.password} />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-2">{t('inscription.vehicule')}</label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICULES.map((vehicule) => (
                <button
                  key={vehicule.valeur}
                  type="button"
                  onClick={() => setFormulaire({ ...formulaire, vehicleType: vehicule.valeur })}
                  className={`flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-colors ${
                    formulaire.vehicleType === vehicule.valeur
                      ? 'border-orange-500 bg-orange-100 text-orange-600'
                      : 'border-gray-300 bg-gray-100 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <vehicule.icone size={20} />
                  <span className="text-sm">{t(`inscription.vehicules.${vehicule.valeur}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {formulaire.vehicleType !== 'bike' && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                {t('inscription.plaque')} <span className="text-gray-500">{t('inscription.facultatif')}</span>
              </label>
              <input
                type="text"
                {...champ('vehiclePlate')}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>
          )}

          <AcceptationConditions
            clair
            coche={conditionsAcceptees}
            onChange={setConditionsAcceptees}
            documents={[
              { href: '/cgu', libelle: tConditions('docs.cgu') },
              { href: '/conditions-livreurs', libelle: tConditions('docs.livreurs') },
            ]}
          />

          <button
            type="submit"
            disabled={envoi || !conditionsAcceptees}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {envoi ? t('inscription.creation') : t('inscription.creer')}
          </button>
        </form>

        <p className="text-gray-500 text-center text-sm mt-6">
          {t('inscription.dejaInscrit')}{' '}
          <Link href="/driver/login" className="text-orange-500 hover:text-orange-600">
            {t('inscription.seConnecter')}
          </Link>
        </p>
      </div>
    </div>
  );
}
