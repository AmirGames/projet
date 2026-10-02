'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Car, Loader } from 'lucide-react';

import { CarteCourseDrive } from '@/components/CarteCourseDrive';
import { Etoiles, NoterCourseDrive } from '@/components/NoterCourseDrive';
import { useAuth } from '@/lib/auth-context';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { appelerZupDrive, kilometres, minutes, prix, STATUTS_ACTIFS } from '@/lib/zupdrive';

/**
 * ZupDrive — le suivi d'un trajet par son passager.
 *
 * L'état fait foi côté serveur : la page le relit toutes les quelques
 * secondes tant que le trajet est en cours (une notification perdue ne
 * laisse jamais l'écran en retard).
 */

interface Trajet {
  id: string;
  statut: string;
  departAdresse: string;
  arriveeAdresse: string;
  distanceMetres: number;
  dureeSecondes: number;
  prixCentimes: number;
  annuleePar: string | null;
  departLatitude: number;
  departLongitude: number;
  arriveeLatitude: number;
  arriveeLongitude: number;
  chauffeur: {
    prenom: string | null;
    vehicule: string | null;
    plaque: string | null;
    /** Seulement pendant son approche. */
    position: { latitude: number; longitude: number } | null;
    /** Sa moyenne donnée par les passagers ; nulle tant que personne ne l'a noté. */
    note: { moyenne: number | null; avis: number } | null;
  } | null;
  maNote: number | null;
  peutNoter: boolean;
}

const RELECTURE_MS = 4000;
const ANNULABLE = ['RECHERCHE', 'ACCEPTEE', 'ARRIVEE'];

export default function SuiviTrajetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('zupdriveTrajet');
  const { user, isLoading } = useAuth();
  const [trajet, setTrajet] = useState<Trajet | null>(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      setTrajet(await appelerZupDrive<Trajet>(`/api/zupdrive/courses/${encodeURIComponent(id)}`));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    }
  }, [id, t]);

  useEffectChargement(() => {
    if (user) charger();
  }, [user, charger]);

  const actif = !!trajet && STATUTS_ACTIFS.includes(trajet.statut);
  useEffect(() => {
    if (!actif) return;
    const minuteur = setInterval(charger, RELECTURE_MS);
    return () => clearInterval(minuteur);
  }, [actif, charger]);

  const annuler = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      setTrajet(await appelerZupDrive<Trajet>(`/api/zupdrive/courses/${encodeURIComponent(id)}/annuler`, { method: 'POST', corps: {} }));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (isLoading || (user && !trajet && !erreur)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href="/trajet" className="text-sm text-slate-500 hover:underline">
        {t('retour')}
      </Link>

      {erreur && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      {trajet && (
        <section className="mt-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200" data-statut={trajet.statut}>
          <p className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            {actif && <Car className="text-blue-600" />}
            {t(`statutDetail.${trajet.statut}`)}
          </p>
          {trajet.statut === 'ANNULEE' && trajet.annuleePar === 'CHAUFFEUR' && (
            <p className="mt-1 text-sm text-slate-600">{t('annuleeParChauffeur')}</p>
          )}

          {actif && (
            <div className="mt-4">
              <CarteCourseDrive
                depart={{ latitude: trajet.departLatitude, longitude: trajet.departLongitude }}
                arrivee={{ latitude: trajet.arriveeLatitude, longitude: trajet.arriveeLongitude }}
                chauffeur={trajet.chauffeur?.position ?? null}
              />
            </div>
          )}

          {trajet.chauffeur && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p className="flex items-center gap-2 font-semibold">
                {trajet.chauffeur.prenom}
                {trajet.chauffeur.note?.moyenne != null ? (
                  <span className="flex items-center gap-1 text-xs font-normal text-slate-500">
                    <Etoiles valeur={trajet.chauffeur.note.moyenne} taille={12} />
                    {trajet.chauffeur.note.moyenne.toLocaleString('fr-FR')} ({trajet.chauffeur.note.avis})
                  </span>
                ) : (
                  <span className="text-xs font-normal text-slate-500">{t('pasEncoreNote')}</span>
                )}
              </p>
              <p>
                {trajet.chauffeur.vehicule}
                {trajet.chauffeur.plaque ? ` · ${trajet.chauffeur.plaque}` : ''}
              </p>
            </div>
          )}

          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-slate-500">{t('depart')}</dt>
              <dd className="text-slate-900">{trajet.departAdresse}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">{t('destination')}</dt>
              <dd className="text-slate-900">{trajet.arriveeAdresse}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">{t('prix')}</dt>
              <dd className="font-semibold text-slate-900">
                {prix(trajet.prixCentimes)}
                <span className="ml-2 font-normal text-slate-500">
                  {kilometres(trajet.distanceMetres)} · {minutes(trajet.dureeSecondes)}
                </span>
              </dd>
            </div>
          </dl>

          {trajet.peutNoter && (
            <div className="mt-6">
              <NoterCourseDrive
                chemin={`/api/zupdrive/courses/${encodeURIComponent(trajet.id)}/note`}
                question={t('noterChauffeur', { prenom: trajet.chauffeur?.prenom ?? '' })}
                onNote={() => charger()}
              />
            </div>
          )}
          {trajet.maNote != null && (
            <p className="mt-6 flex items-center gap-2 text-sm text-slate-600" data-ma-note={trajet.maNote}>
              {t('votreNote')} <Etoiles valeur={trajet.maNote} />
            </p>
          )}

          {ANNULABLE.includes(trajet.statut) && (
            <button
              type="button"
              onClick={annuler}
              disabled={envoi}
              className="mt-6 rounded-full border border-red-300 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {t('annuler')}
            </button>
          )}
        </section>
      )}
    </main>
  );
}
