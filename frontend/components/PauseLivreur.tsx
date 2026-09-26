'use client';

import { useEffect, useState } from 'react';
import { Coffee, Play } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const DUREES = [15, 30, 60];
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
      const res = await fetch(`${API_URL}/drivers/pause`, {
        method: methode,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: corps ? JSON.stringify(corps) : undefined,
      });
      const donnees = await res.json().catch(() => null);

      if (!res.ok) {
        setErreur(donnees?.error || "La pause n'a pas pu être enregistrée.");
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
      setErreur('Serveur injoignable.');
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
      <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-200 font-semibold">
          <Coffee size={18} /> En pause{pauseReason ? ` — ${pauseReason}` : ''}
        </div>
        <p className="text-3xl font-bold text-white tabular-nums">
          {mm}:{ss}
        </p>
        <p className="text-xs text-amber-200/80">Aucune course ne vous sera proposée d&apos;ici là.</p>
        <button
          onClick={() => appeler('DELETE')}
          disabled={enCours}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg"
        >
          <Play size={16} /> Reprendre maintenant
        </button>
        {erreur && <p className="text-sm text-red-400">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-gray-400 text-sm flex items-center gap-2">
        <Coffee size={16} /> Faire une pause
      </p>
      {enCourse ? (
        <p className="text-xs text-gray-500">Disponible une fois la course en cours terminée.</p>
      ) : (
        <>
          <select
            value={raison}
            onChange={(e) => setRaison(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
            aria-label="Motif de la pause"
          >
            {RAISONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            {DUREES.map((d) => (
              <button
                key={d}
                onClick={() => appeler('POST', { minutes: d, reason: raison })}
                disabled={enCours}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg"
              >
                {d} min
              </button>
            ))}
          </div>
        </>
      )}
      {erreur && <p className="text-sm text-red-400">{erreur}</p>}
    </div>
  );
}
