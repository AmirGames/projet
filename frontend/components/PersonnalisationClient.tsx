'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Le droit d'opposition à la personnalisation : tant qu'il est coupé, les
 * suggestions de commerces ne se fondent plus sur les commandes passées. Le
 * serveur est seul juge : l'interrupteur affiche ce qu'il a enregistré.
 */
export function PersonnalisationClient() {
  const t = useTranslations('personnalisationClient');
  const [active, setActive] = useState<boolean | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(false);

  const entetes = () => ({
    Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    'Content-Type': 'application/json',
  });

  useEffect(() => {
    fetch(`${API_URL}/api/client/me/personnalisation`, { headers: entetes() })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => setActive(donnees ? !!donnees.data?.personnalisationActive : null))
      .catch(() => undefined);
  }, []);

  if (active === null) return null;

  const basculer = async () => {
    setEnCours(true);
    setErreur(false);
    try {
      const reponse = await fetch(`${API_URL}/api/client/me/personnalisation`, {
        method: 'PUT',
        headers: entetes(),
        body: JSON.stringify({ desactivee: active }),
      });
      if (!reponse.ok) throw new Error();
      setActive(!!(await reponse.json()).data?.personnalisationActive);
    } catch {
      setErreur(true);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="rounded-[18px] border border-[#ECECEA] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-extrabold tracking-tight text-gray-900">{t('titre')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('explication')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={t('titre')}
          disabled={enCours}
          onClick={basculer}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            active ? 'bg-orange-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              active ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
      {erreur && <p className="mt-2 text-sm text-red-700">{t('erreur')}</p>}
    </section>
  );
}
