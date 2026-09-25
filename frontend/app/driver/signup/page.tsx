'use client';

import { useState, useEffect } from 'react';
import AcceptationConditions from '@/components/AcceptationConditions';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Bike, Car, Truck } from 'lucide-react';

import { useTranslations } from 'next-intl';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const VEHICULES = [
  { valeur: 'bike', libelle: 'Vélo', icone: Bike },
  { valeur: 'scooter', libelle: 'Scooter', icone: Truck },
  { valeur: 'car', libelle: 'Voiture', icone: Car },
];

export default function InscriptionLivreurPage() {
  const t = useTranslations('driverAuth');
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

    if (formulaire.password.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères');
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
          vehiclePlate: formulaire.vehiclePlate || undefined,
        }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || donnees.message || "Échec de l'inscription");
        return;
      }

      // L'espace livreur lit son jeton sous une clé dédiée.
      localStorage.setItem('driverToken', donnees.accessToken);
      localStorage.setItem('accessToken', donnees.accessToken);
      router.push('/driver');
    } catch {
      setErreur('Erreur de connexion au serveur');
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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bike size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Devenir livreur</h1>
          <p className="text-gray-400 mt-2">Créez votre compte pour recevoir des courses</p>
        </div>

        <form onSubmit={soumettre} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          {erreur && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
              {erreur}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nom complet</label>
            <input
              type="text"
              required
              minLength={2}
              {...champ('name')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Adresse e-mail</label>
            <input
              type={t('email')}
              required
              {...champ('email')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Téléphone</label>
            <input
              type="tel"
              required
              minLength={9}
              {...champ('phone')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Mot de passe <span className="text-gray-500">(8 caractères minimum)</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              {...champ('password')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Véhicule</label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICULES.map((vehicule) => (
                <button
                  key={vehicule.valeur}
                  type="button"
                  onClick={() => setFormulaire({ ...formulaire, vehicleType: vehicule.valeur })}
                  className={`flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-colors ${
                    formulaire.vehicleType === vehicule.valeur
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                      : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <vehicule.icone size={20} />
                  <span className="text-sm">{vehicule.libelle}</span>
                </button>
              ))}
            </div>
          </div>

          {formulaire.vehicleType !== 'bike' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Plaque d&apos;immatriculation <span className="text-gray-500">(facultatif)</span>
              </label>
              <input
                type="text"
                {...champ('vehiclePlate')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          )}

          <AcceptationConditions
            coche={conditionsAcceptees}
            onChange={setConditionsAcceptees}
            documents={[
              { href: '/cgu', libelle: 'les conditions générales d’utilisation' },
              { href: '/conditions-livreurs', libelle: 'les conditions générales livreurs' },
            ]}
          />

          <button
            type="submit"
            disabled={envoi || !conditionsAcceptees}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {envoi ? 'Création du compte...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-gray-400 text-center text-sm mt-6">
          Déjà inscrit ?{' '}
          <Link href="/driver/login" className="text-orange-500 hover:text-orange-400">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
