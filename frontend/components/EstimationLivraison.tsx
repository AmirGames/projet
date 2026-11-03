'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';

export interface EstimationLivraisonClient {
  etape: string;
  fourchette: { debut: string; fin: string } | null;
  motif: string | null;
  calculeeLe: string;
  valideJusqua: string;
}

const ETAPES = new Set(['CONFIRMATION', 'PREPARATION', 'RECHERCHE_LIVREUR', 'LIVREUR_EN_APPROCHE', 'COLLECTE', 'AUTRE_LIVRAISON', 'EN_ROUTE', 'ATTENTE_CLIENT', 'LIVREE', 'ANNULEE', 'LIVRAISON_COMMERCANT']);
const MOTIFS = new Set(['GPS_INDISPONIBLE', 'PREPARATION_INCONNUE', 'PREPARATION_EN_RETARD', 'TRAJET_INCONNU']);

/** L'âge est mesuré depuis la réception, indépendamment de l'horloge du client. */
export function EstimationLivraison({ estimation }: { estimation?: EstimationLivraisonClient | null }) {
  if (!estimation || !ETAPES.has(estimation.etape)) return null;
  return <AffichageEstimation key={JSON.stringify(estimation)} estimation={estimation} />;
}

function AffichageEstimation({ estimation }: { estimation: EstimationLivraisonClient }) {
  const t = useTranslations('estimationLivraison');
  const locale = useLocale();
  const [recueA] = useState(() => performance.now());
  const [ecoule, setEcoule] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setEcoule(performance.now() - recueA), 5000);
    return () => clearInterval(timer);
  }, [recueA]);

  const terminale = ['LIVREE', 'ANNULEE'].includes(estimation.etape);
  const maintenant = Date.parse(estimation.calculeeLe) + ecoule;
  const validite = Date.parse(estimation.valideJusqua);
  const perimee = !terminale && (!Number.isFinite(maintenant) || !Number.isFinite(validite) || maintenant >= validite);
  const debut = estimation.fourchette ? Date.parse(estimation.fourchette.debut) : NaN;
  const fin = estimation.fourchette ? Date.parse(estimation.fourchette.fin) : NaN;
  const affichable = !perimee && !terminale && Number.isFinite(debut) && Number.isFinite(fin) && fin > debut && fin > maintenant;
  const heure = (date: number) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);

  return (
    <section aria-label={t('titre')} className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-gray-900">
      <div className="flex items-center gap-2 font-semibold"><Clock size={18} aria-hidden="true" />{t('titre')}</div>
      <p role="status" className="mt-2 text-sm">{perimee ? t('actualisation') : t(`etapes.${estimation.etape}`)}</p>
      {affichable && <p className="mt-2 text-xl font-bold">{t('fourchette', { debut: heure(debut), fin: heure(fin) })}</p>}
      {!perimee && estimation.motif && MOTIFS.has(estimation.motif) && <p className="mt-2 text-sm">{t(`motifs.${estimation.motif}`)}</p>}
      {affichable && <p className="mt-2 text-xs text-gray-600">{t('indicatif')}</p>}
    </section>
  );
}
