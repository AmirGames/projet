'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Le client ne répond pas : le livreur lance l'attente de six minutes, que le
 * client voit sur son suivi. Au terme seulement, il peut déposer la commande
 * en lieu sûr et la photographier — le serveur refuse la photo avant.
 */
export function AttenteDepotLivreur({
  deliveryId,
  finLe,
  maintenant,
  surDepot,
}: {
  deliveryId: string;
  /** Fin de l'attente déjà lancée, à l'heure du serveur. */
  finLe?: string | null;
  maintenant?: string | null;
  /** L'attente est écoulée : place à la photo du dépôt. */
  surDepot: () => void;
}) {
  const t = useTranslations('attenteDepotLivreur');
  const [fin, setFin] = useState<number | null>(finLe ? new Date(finLe).getTime() : null);
  const [ecart, setEcart] = useState(() => (maintenant ? new Date(maintenant).getTime() - Date.now() : 0));
  const [instant, setInstant] = useState(() => Date.now());
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const reste = fin == null ? null : Math.max(0, Math.ceil((fin - (instant + ecart)) / 1000));

  useEffect(() => {
    if (reste == null || reste === 0) return;
    const minuteur = setInterval(() => setInstant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [reste]);

  const lancer = async () => {
    const token = jetonAcces();
    if (!token) return;
    setEnvoi(true);
    setErreur('');
    try {
      const reponse = await fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}/attente`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const lu = await reponse.json().catch(() => null);
      if (!reponse.ok) throw new Error(lu?.error || t('impossible'));
      setEcart(new Date(lu.data.maintenant).getTime() - Date.now());
      setInstant(Date.now());
      setFin(new Date(lu.data.attenteFinLe).getTime());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('impossible'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-900">{t('titre')}</p>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {reste == null ? (
        <>
          <p className="text-xs text-gray-500">
            {t('aide')}
          </p>
          <button
            type="button"
            onClick={lancer}
            disabled={envoi}
            className="w-full rounded-lg bg-gray-900 py-2 font-semibold text-white hover:bg-black disabled:opacity-60"
          >
            {t('lancer')}
          </button>
        </>
      ) : reste > 0 ? (
        <div className="text-center">
          <p className="text-sm text-amber-800">{t('prevenu')}</p>
          <p className="text-3xl font-bold tabular-nums text-amber-700">
            {Math.floor(reste / 60)}:{String(reste % 60).padStart(2, '0')}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={surDepot}
          className="w-full rounded-lg bg-green-700 py-2 font-semibold text-white hover:bg-green-800"
        >
          {t('deposer')}
        </button>
      )}
    </div>
  );
}
