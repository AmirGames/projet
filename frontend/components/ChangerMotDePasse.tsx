'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import ReglesMotDePasse from '@/components/ReglesMotDePasse';
import { motDePasseValide } from '@/lib/mot-de-passe';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const CHAMP =
  'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500';

/**
 * Changement du mot de passe depuis le profil.
 *
 * Connecté, on n'a pas besoin d'un lien par e-mail : l'ancien mot de passe
 * suffit à prouver qu'on est bien le titulaire du compte.
 */
export default function ChangerMotDePasse() {
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const valide = motDePasseValide(nouveau);

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (nouveau !== confirmation) {
      setMessage({ ok: false, texte: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }

    setEnvoi(true);
    try {
      const reponse = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`,
        },
        body: JSON.stringify({ currentPassword: actuel, newPassword: nouveau }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setMessage({ ok: false, texte: donnees.error || 'Le changement a échoué.' });
        return;
      }

      setMessage({ ok: true, texte: 'Mot de passe modifié.' });
      setActuel('');
      setNouveau('');
      setConfirmation('');
    } catch {
      setMessage({ ok: false, texte: 'Serveur injoignable. Réessayez dans un instant.' });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={envoyer} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <KeyRound size={20} className="text-orange-500" />
        Mot de passe
      </h2>

      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.ok ? 'bg-green-900/40 text-green-200' : 'bg-red-900/40 text-red-200'}`}>
          {message.texte}
        </div>
      )}

      <div>
        <label htmlFor="mdp-actuel" className="block text-sm text-gray-400 mb-1">Mot de passe actuel</label>
        <input id="mdp-actuel" type="password" autoComplete="current-password" required value={actuel} onChange={(e) => setActuel(e.target.value)} className={CHAMP} />
      </div>

      <div>
        <label htmlFor="mdp-nouveau" className="block text-sm text-gray-400 mb-1">Nouveau mot de passe</label>
        <input id="mdp-nouveau" type="password" autoComplete="new-password" required value={nouveau} onChange={(e) => setNouveau(e.target.value)} className={CHAMP} />
        <ReglesMotDePasse valeur={nouveau} sombre />
      </div>

      <div>
        <label htmlFor="mdp-confirmation" className="block text-sm text-gray-400 mb-1">Confirmer le nouveau mot de passe</label>
        <input id="mdp-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={CHAMP} />
      </div>

      <button
        type="submit"
        disabled={envoi || !valide || !actuel}
        className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium text-white transition-colors"
      >
        {envoi ? 'Enregistrement…' : 'Changer le mot de passe'}
      </button>
    </form>
  );
}
