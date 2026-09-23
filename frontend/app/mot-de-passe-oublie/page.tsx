'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Demande d'un lien de réinitialisation.
 *
 * La réponse est la même que l'adresse existe ou non : ce formulaire ne doit
 * pas devenir un moyen de savoir qui est inscrit.
 */
export default function MotDePasseOublie() {
  const t = useTranslations('forgotPassword');
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

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

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-lg w-full max-w-md">
        {envoye ? (
          <div className="text-center space-y-4">
            <MailCheck size={48} className="mx-auto text-primary" />
            <h1 className="text-2xl font-bold text-slate-900">Regardez vos e-mails</h1>
            <p className="text-slate-600">
              Si un compte existe pour <strong className="text-slate-900">{email}</strong>, un lien de
              réinitialisation vient d&apos;y être envoyé.
            </p>
            <p className="text-sm text-slate-500">
              Le lien est valable une heure. Pensez à regarder dans les indésirables.
            </p>
            <Link
              href="/login"
              className="inline-block mt-2 text-primary hover:text-primary-hover font-medium transition"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-slate-900 mb-2 text-center">Mot de passe oublié</h1>
            <p className="text-slate-600 text-center mb-6">
              Indiquez votre adresse, nous vous enverrons un lien pour en choisir un nouveau.
            </p>

            {erreur && <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">{erreur}</div>}

            <form onSubmit={envoyer} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-slate-700 font-medium mb-2">
                  Adresse e-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="vous@exemple.fr"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={envoiEnCours}
                className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition"
              >
                {envoiEnCours ? 'Envoi...' : 'Envoyer le lien'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/login" className="text-slate-600 hover:text-primary font-medium transition">
                Retour à la connexion
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
