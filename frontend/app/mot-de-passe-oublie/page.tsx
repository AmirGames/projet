'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Demande d'un lien de réinitialisation.
 *
 * La réponse est la même que l'adresse existe ou non : ce formulaire ne doit
 * pas devenir un moyen de savoir qui est inscrit.
 */
export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoiEnCours(true);
    setErreur('');

    try {
      const reponse = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || "L'envoi a échoué. Réessayez dans un instant.");
        return;
      }

      setEnvoye(true);
    } catch {
      setErreur('Serveur injoignable. Vérifiez votre connexion.');
    } finally {
      setEnvoiEnCours(false);
    }
  };

  // Connecté, on connaît déjà son mot de passe : le changement se fait depuis
  // le profil, pas par un lien envoyé par e-mail.
  if (!isLoading && isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-200 md:p-10 text-center space-y-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Vous êtes connecté</h1>
          <p className="text-slate-600">Veuillez changer votre mot de passe depuis votre profil.</p>
          <Link href="/" className="inline-block mt-2 font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-200 md:p-10">
        {envoye ? (
          <div className="text-center space-y-4">
            <MailCheck size={48} className="mx-auto text-gray-900" />
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Regardez vos e-mails</h1>
            <p className="text-slate-600">
              Si un compte existe pour <strong className="text-slate-900">{email}</strong>, un lien de
              réinitialisation vient d&apos;y être envoyé.
            </p>
            <p className="text-sm text-slate-500">
              Le lien est valable une heure. Pensez à regarder dans les indésirables.
            </p>
            <Link
              href="/login"
              className="inline-block mt-2 font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-center text-3xl font-extrabold tracking-tight text-gray-900">Mot de passe oublié</h1>
            <p className="text-slate-600 text-center mb-6">
              Indiquez votre adresse, nous vous enverrons un lien pour en choisir un nouveau.
            </p>

            {erreur && <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">{erreur}</div>}

            <form onSubmit={envoyer} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Adresse e-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="vous@exemple.fr"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={envoiEnCours}
                className="w-full rounded-full bg-gray-900 px-4 py-3.5 font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {envoiEnCours ? 'Envoi...' : 'Envoyer le lien'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/login" className="font-medium text-gray-600 transition hover:text-gray-900">
                Retour à la connexion
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
