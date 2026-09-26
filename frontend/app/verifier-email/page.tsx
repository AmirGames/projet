'use client';

import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

type Etat = 'en-cours' | 'confirme' | 'echec';

/** Confirmation d'adresse : le lien reçu suffit, rien à saisir. */
function Confirmation() {
  const jeton = useSearchParams().get('jeton') || '';

  const [etat, setEtat] = useState<Etat>('en-cours');
  const [message, setMessage] = useState('');

  const confirmer = useCallback(async () => {
    if (!jeton) {
      setEtat('echec');
      setMessage("Cette adresse ne contient pas de jeton. Ouvrez le lien depuis l'e-mail reçu.");
      return;
    }

    try {
      const reponse = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setEtat('echec');
        setMessage(donnees.error || "Ce lien de confirmation n'est pas valable.");
        return;
      }

      setEtat('confirme');
      setMessage(donnees.email || '');
    } catch {
      setEtat('echec');
      setMessage('Serveur injoignable. Vérifiez votre connexion.');
    }
  }, [jeton]);

  useEffectChargement(() => {
    confirmer();
  }, [confirmer]);

  if (etat === 'en-cours') {
    return (
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
        <p className="text-slate-600">Confirmation en cours...</p>
      </div>
    );
  }

  if (etat === 'confirme') {
    return (
      <div className="text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-primary" />
        <h1 className="text-2xl font-bold text-slate-900">Adresse confirmée</h1>
        {message && (
          <p className="text-slate-600">
            <strong className="text-slate-900">{message}</strong> est bien la vôtre.
          </p>
        )}
        <Link
          href="/login"
          className="inline-block bg-accent hover:bg-accent-hover text-white font-bold py-2 px-6 rounded-full transition"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <XCircle size={48} className="mx-auto text-red-500" />
      <h1 className="text-2xl font-bold text-slate-900">Confirmation impossible</h1>
      <p className="text-slate-600">{message}</p>
      <p className="text-sm text-slate-500">
        Un lien de confirmation expire au bout de 24 heures. Connectez-vous pour en demander un
        nouveau.
      </p>
      <Link href="/login" className="inline-block text-primary hover:text-primary-hover font-medium transition">
        Retour à la connexion
      </Link>
    </div>
  );
}

export default function VerifierEmail() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-lg w-full max-w-md">
        {/* useSearchParams impose une frontière de suspense au rendu statique. */}
        <Suspense fallback={<p className="text-center text-slate-600">Chargement...</p>}>
          <Confirmation />
        </Suspense>
      </div>
    </div>
  );
}
