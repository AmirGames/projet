'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Choix d'un nouveau mot de passe, depuis le lien reçu par courriel. */
function Formulaire() {
  const router = useRouter();
  const jeton = useSearchParams().get('jeton') || '';

  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [reussi, setReussi] = useState(false);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    // Vérifié ici pour un retour immédiat ; le serveur reste juge du reste.
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.');
      return;
    }

    setEnCours(true);

    try {
      const reponse = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton, password: motDePasse }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || "Ce lien n'est plus valable.");
        return;
      }

      setReussi(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      setErreur('Serveur injoignable. Vérifiez votre connexion.');
    } finally {
      setEnCours(false);
    }
  };

  if (!jeton) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Lien incomplet</h1>
        <p className="text-gray-300">
          Cette adresse ne contient pas de jeton. Ouvrez le lien depuis l&apos;e-mail reçu, ou
          demandez-en un nouveau.
        </p>
        <Link
          href="/mot-de-passe-oublie"
          className="inline-block text-orange-400 hover:text-orange-300"
        >
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  if (reussi) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-green-400" />
        <h1 className="text-2xl font-bold text-white">Mot de passe modifié</h1>
        <p className="text-gray-300">Vous allez être redirigé vers la connexion.</p>
        <Link href="/login" className="inline-block text-orange-400 hover:text-orange-300">
          Se connecter maintenant
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-bold text-white mb-2 text-center">Nouveau mot de passe</h1>
      <p className="text-gray-400 text-center mb-6">Choisissez-en un d&apos;au moins 6 caractères.</p>

      {erreur && <div className="bg-red-600 text-white p-4 rounded-lg mb-4">{erreur}</div>}

      <form onSubmit={valider} className="space-y-4">
        <div>
          <label htmlFor="motdepasse" className="block text-gray-300 mb-2">
            Mot de passe
          </label>
          <input
            id="motdepasse"
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="••••••••"
            minLength={6}
            required
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="confirmation" className="block text-gray-300 mb-2">
            Confirmation
          </label>
          <input
            id="confirmation"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="••••••••"
            minLength={6}
            required
          />
        </div>

        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
        >
          {enCours ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </>
  );
}

export default function Reinitialiser() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
        {/* useSearchParams impose une frontière de suspense au rendu statique. */}
        <Suspense fallback={<p className="text-center text-gray-400">Chargement...</p>}>
          <Formulaire />
        </Suspense>
      </div>
    </div>
  );
}
