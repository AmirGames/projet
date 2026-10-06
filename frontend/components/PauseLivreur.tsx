'use client';

import { useEffect, useState } from 'react';
import { Coffee, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const DUREES = [15, 30, 60];
// Le motif part au serveur en français ; l'affichage suit la langue (`raisons.<rang>`).
const RAISONS = ['Repas', 'Pause café', 'Plein / recharge', 'Problème véhicule', 'Autre'];

interface Props {
  isOnline: boolean;
  /** Une course en cours interdit la pause. */
  enCourse: boolean;
  pausedUntil: string | null;
  pauseReason?: string | null;
  /** Le nouvel état renvoyé par le serveur, à reprendre par la page. */
  surChangement: (etat: { isAvailable: boolean; pausedUntil: string | null; pauseReason?: string | null }) => void;
}

/**
 * Pause temporaire : le livreur reste en ligne et localisé, mais ne reçoit
 * plus de course jusqu'à la fin du compte à rebours.
 */
export function PauseLivreur({ isOnline, enCourse, pausedUntil, pauseReason, surChangement }: Props) {
  const t = useTranslations('pauseLivreur');
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [raison, setRaison] = useState(RAISONS[0]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  const fin = pausedUntil ? new Date(pausedUntil).getTime() : null;
  const enPause = fin != null && fin > maintenant;

  useEffect(() => {
    if (!fin) return;
    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [fin]);

  // Le serveur lève la pause de lui-même ; l'écran se remet à jour à
  // l'échéance sans attendre un rechargement.
  useEffect(() => {
    if (fin != null && fin <= maintenant) {
      surChangement({ isAvailable: isOnline && !enCourse, pausedUntil: null, pauseReason: null });
    }
  }, [fin, maintenant, isOnline, enCourse, surChangement]);

  const appeler = async (methode: 'POST' | 'DELETE', corps?: object) => {
    const token = localStorage.getItem('driverToken');
    if (!token) return;

    setEnCours(true);
    setErreur('');

    try {
      const res = await fetch(`${API_URL}/api/drivers/pause`, {
        method: methode,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: corps ? JSON.stringify(corps) : undefined,
      });
      const donnees = await res.json().catch(() => null);

      if (!res.ok) {
        setErreur(donnees?.error || t('echec'));
        return;
      }

      // Faux positif : le compilateur croit `appeler` exécuté pendant le rendu
      // parce que des boutons créés dans DUREES.map() l'appellent.
      // eslint-disable-next-line react-hooks/purity
      setMaintenant(Date.now());
      surChangement({
        isAvailable: donnees.isAvailable,
        pausedUntil: donnees.pausedUntil,
        pauseReason: donnees.pauseReason,
      });
    } catch {
      setErreur(t('injoignable'));
    } finally {
      setEnCours(false);
    }
  };

  if (!isOnline) return null;

  if (enPause && fin) {
    const reste = Math.max(0, Math.round((fin - maintenant) / 1000));
    const mm = String(Math.floor(reste / 60)).padStart(2, '0');
    const ss = String(reste % 60).padStart(2, '0');

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-800 font-semibold">
          <Coffee size={18} /> {pauseReason ? t('enPauseMotif', { motif: RAISONS.includes(pauseReason) ? t(`raisons.${RAISONS.indexOf(pauseReason)}`) : pauseReason }) : t('enPause')}
        </div>
        <p className="text-3xl font-bold text-gray-900 tabular-nums">
          {mm}:{ss}
        </p>
        <p className="text-xs text-amber-800/80">{t('aucuneCourse')}</p>
        <button
          onClick={() => appeler('DELETE')}
          disabled={enCours}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg"
        >
          <Play size={16} /> {t('reprendre')}
        </button>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-gray-500 text-sm flex items-center gap-2">
        <Coffee size={16} /> {t('faireUnePause')}
      </p>
      {enCourse ? (
        <p className="text-xs text-gray-500">{t('disponibleApres')}</p>
      ) : (
        <>
          <select
            value={raison}
            onChange={(e) => setRaison(e.target.value)}
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            aria-label={t('motif')}
          >
            {RAISONS.map((r, rang) => (
              <option key={r} value={r}>
                {t(`raisons.${rang}`)}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            {DUREES.map((d) => (
              <button
                key={d}
                onClick={() => appeler('POST', { minutes: d, reason: raison })}
                disabled={enCours}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 text-sm font-semibold py-2 rounded-lg"
              >
                {t('minutes', { n: d })}
              </button>
            ))}
          </div>
        </>
      )}
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
    </div>
  );
}
