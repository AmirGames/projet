'use client';

import { useEffect, useState } from 'react';
import { jetonAcces } from './jeton-session';
import { EVENEMENT_COMMANDES_CHANGEES } from './reponse-commande';

export interface EtatCuisine {
  minutes: number;
  habituelle: number;
  source: 'HISTORIQUE' | 'REGLAGE';
  echantillons: number;
  commandesEnCours: number;
  attenteMinutes: number;
  rush: { supplementMinutes: number; jusqua: string } | null;
  reglages: { minutesParDefaut: number; commandesParalleles: number };
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export async function enregistrerCuisine(storeId: string, corps: { minutesParDefaut: number; commandesParalleles: number; supplementRush: number; dureeRush: number | null }) {
  const reponse = await fetch(`${API}/api/order-management/${encodeURIComponent(storeId)}/preparation`, {
    method: 'PUT', headers: { Authorization: `Bearer ${jetonAcces()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  });
  const resultat = await reponse.json();
  if (!reponse.ok) throw new Error(resultat.error || 'Action impossible');
  window.dispatchEvent(new Event(EVENEMENT_COMMANDES_CHANGEES));
}

export function usePreparationCuisine(storeId: string, actif: boolean) {
  const [etat, setEtat] = useState<EtatCuisine | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  useEffect(() => {
    if (!actif) return;
    const controleur = new AbortController();
    let enCours = false;
    const lire = async () => {
      if (enCours) return;
      enCours = true;
      try {
        const reponse = await fetch(`${API}/api/order-management/${encodeURIComponent(storeId)}/preparation`, {
          headers: { Authorization: `Bearer ${jetonAcces()}` }, signal: controleur.signal,
        });
        if (!reponse.ok) throw new Error('Indisponible');
        const resultat = await reponse.json();
        if (!controleur.signal.aborted) { setEtat(resultat); setIndisponible(false); }
      } catch {
        if (!controleur.signal.aborted) { setEtat(null); setIndisponible(true); }
      } finally { enCours = false; }
    };
    void lire();
    const timer = setInterval(lire, 20_000);
    window.addEventListener(EVENEMENT_COMMANDES_CHANGEES, lire);
    return () => { controleur.abort(); clearInterval(timer); window.removeEventListener(EVENEMENT_COMMANDES_CHANGEES, lire); };
  }, [storeId, actif]);
  return { etat, indisponible };
}
