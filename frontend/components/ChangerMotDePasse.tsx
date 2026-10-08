'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import ReglesMotDePasse from '@/components/ReglesMotDePasse';
import { motDePasseValide } from '@/lib/mot-de-passe';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const CHAMP =
  'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-hidden focus:border-orange-500';
const CHAMP_CLAIR =
  'w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:border-orange-500';

/**
 * Changement du mot de passe depuis le profil.
 *
 * Connecté, on n'a pas besoin d'un lien par e-mail : l'ancien mot de passe
 * suffit à prouver qu'on est bien le titulaire du compte.
 */
export default function ChangerMotDePasse({ clair = false }: { clair?: boolean } = {}) {
  const t = useTranslations('changerMotDePasse');
  const champ = clair ? CHAMP_CLAIR : CHAMP;
  const etiquette = `block text-sm mb-1 ${clair ? 'text-gray-600' : 'text-gray-400'}`;
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
      setMessage({ ok: false, texte: t('differents') });
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
        setMessage({ ok: false, texte: donnees.error || t('echec') });
        return;
      }

      // Les anciens jetons ne valent plus rien : on garde ceux de cette session.
      try {
        if (donnees.accessToken) localStorage.setItem('accessToken', donnees.accessToken);
      } catch {
        // Stockage refusé : la session se refera à la prochaine connexion.
      }

      setMessage({ ok: true, texte: donnees.message || t('modifie') });
      setActuel('');
      setNouveau('');
      setConfirmation('');
    } catch {
      setMessage({ ok: false, texte: t('injoignable') });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={envoyer} className={`rounded-lg p-6 space-y-4 border ${clair ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'}`}>
      <h2 className={`text-lg font-bold flex items-center gap-2 ${clair ? 'text-gray-900' : 'text-white'}`}>
        <KeyRound size={20} className="text-orange-500" />
        {t('titre')}
      </h2>

      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.ok ? (clair ? 'bg-green-50 text-green-800' : 'bg-green-900/40 text-green-200') : clair ? 'bg-red-50 text-red-800' : 'bg-red-900/40 text-red-200'}`}>
          {message.texte}
        </div>
      )}

      <div>
        <label htmlFor="mdp-actuel" className={etiquette}>{t('actuel')}</label>
        <input id="mdp-actuel" type="password" autoComplete="current-password" required value={actuel} onChange={(e) => setActuel(e.target.value)} className={champ} />
      </div>

      <div>
        <label htmlFor="mdp-nouveau" className={etiquette}>{t('nouveau')}</label>
        <input id="mdp-nouveau" type="password" autoComplete="new-password" required value={nouveau} onChange={(e) => setNouveau(e.target.value)} className={champ} />
        <ReglesMotDePasse valeur={nouveau} sombre={!clair} />
      </div>

      <div>
        <label htmlFor="mdp-confirmation" className={etiquette}>{t('confirmer')}</label>
        <input id="mdp-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={champ} />
      </div>

      <button
        type="submit"
        disabled={envoi || !valide || !actuel}
        className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium text-white transition-colors"
      >
        {envoi ? t('enregistrement') : t('changer')}
      </button>
    </form>
  );
}
