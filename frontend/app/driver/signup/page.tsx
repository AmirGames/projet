'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bike, Car, Truck } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const VEHICULES = [
  { valeur: 'bike', libelle: 'Vélo', icone: Bike },
  { valeur: 'scooter', libelle: 'Scooter', icone: Truck },
  { valeur: 'car', libelle: 'Voiture', icone: Car },
];

export default function InscriptionLivreurPage() {
  const router = useRouter();
  const t = useTranslations('driverSignup');

  const [formulaire, setFormulaire] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    vehicleType: 'bike',
    vehiclePlate: '',
  });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

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
          ...formulaire,
          vehiclePlate: formulaire.vehiclePlate || undefined,
        }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || donnees.message || t('signupError'));
        return;
      }

      // L'espace livreur lit son jeton sous une clé dédiée.
      localStorage.setItem('driverToken', donnees.accessToken);
      localStorage.setItem('accessToken', donnees.accessToken);
      router.push('/driver');
    } catch {
      setErreur(t('error'));
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
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center p-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bike size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Devenir livreur</h1>
          <p className="text-slate-600 mt-2">Créez votre compte pour recevoir des courses</p>
        </div>

        <form onSubmit={soumettre} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900 text-sm">
              {erreur}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-700 font-medium mb-1">Nom complet</label>
            <input
              type="text"
              required
              minLength={2}
              {...champ('name')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 font-medium mb-1">Adresse e-mail</label>
            <input
              type="email"
              required
              {...champ('email')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 font-medium mb-1">Téléphone</label>
            <input
              type="tel"
              required
              minLength={9}
              {...champ('phone')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 font-medium mb-1">
              Mot de passe <span className="text-slate-500">(8 caractères minimum)</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              {...champ('password')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 font-medium mb-2">Véhicule</label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICULES.map((vehicule) => (
                <button
                  key={vehicule.valeur}
                  type="button"
                  onClick={() => setFormulaire({ ...formulaire, vehicleType: vehicule.valeur })}
                  className={`flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-colors ${
                    formulaire.vehicleType === vehicule.valeur
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
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
              <label className="block text-sm text-slate-700 font-medium mb-1">
                Plaque d&apos;immatriculation <span className="text-slate-500">(facultatif)</span>
              </label>
              <input
                type="text"
                {...champ('vehiclePlate')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={envoi}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {envoi ? 'Création du compte...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-slate-600 text-center text-sm mt-6">
          Déjà inscrit ?{' '}
          <Link href="/driver/login" className="text-primary hover:text-primary-hover font-medium transition">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
