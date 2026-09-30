'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader, MapPin, Navigation } from 'lucide-react';

import { Etoiles, NoterCourseDrive } from '@/components/NoterCourseDrive';
import { useAuth } from '@/lib/auth-context';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { appelerZupDrive, kilometres, minutes, prix } from '@/lib/zupdrive';

/**
 * ZupDrive — les courses du chauffeur (driver.zupdrive.com/chauffeur/courses).
 *
 * En ligne, la page envoie la position du téléphone et relit l'état toutes
 * les quelques secondes : une proposition arrive, il a 20 secondes pour
 * l'accepter. Toutes les règles (qui reçoit quoi, dans quel ordre) sont au
 * serveur ; les boutons ne proposent que l'étape suivante.
 */

interface Moyenne {
  moyenne: number | null;
  avis: number;
}

interface CoursePourChauffeur {
  id: string;
  statut: string;
  passager: string | null;
  notePassager: Moyenne | null;
  departAdresse: string;
  arriveeAdresse: string;
  distanceMetres: number;
  dureeSecondes: number;
  prixCentimes: number;
}

interface Tableau {
  statut: string;
  enLigne: boolean;
  positionLe: string | null;
  proposition: { id: string; expireA: string; distanceMetres: number; course: CoursePourChauffeur } | null;
  course: CoursePourChauffeur | null;
  historique: {
    id: string;
    statut: string;
    departAdresse: string;
    arriveeAdresse: string;
    prixCentimes: number;
    peutNoter: boolean;
    noteDonnee: boolean;
  }[];
  /** Sa moyenne, telle que les passagers la font. */
  maNote: Moyenne;
}

const RELECTURE_MS = 3000;
const POSITION_MS = 15_000;

const ETAPE_SUIVANTE: Record<string, 'arrive' | 'demarrer' | 'terminer'> = {
  ACCEPTEE: 'arrive',
  ARRIVEE: 'demarrer',
  EN_COURS: 'terminer',
};

export default function CoursesChauffeurPage() {
  const t = useTranslations('chauffeurCourses');
  const { user, isLoading } = useAuth();
  const [tableau, setTableau] = useState<Tableau | null>(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState('');
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const dernierePosition = useRef(0);

  const charger = useCallback(async () => {
    try {
      setTableau(await appelerZupDrive<Tableau>('/api/zupdrive/chauffeur/me/courses'));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    }
  }, [t]);

  useEffectChargement(() => {
    if (user) charger();
  }, [user, charger]);

  const enLigne = !!tableau?.enLigne;

  // En ligne : relecture régulière et compte à rebours de la proposition.
  useEffect(() => {
    if (!enLigne) return;
    const relecture = setInterval(charger, RELECTURE_MS);
    const horloge = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => {
      clearInterval(relecture);
      clearInterval(horloge);
    };
  }, [enLigne, charger]);

  // En ligne : la position du téléphone, au plus toutes les 15 secondes.
  useEffect(() => {
    if (!enLigne || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const suivi = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - dernierePosition.current < POSITION_MS) return;
        dernierePosition.current = Date.now();
        appelerZupDrive('/api/zupdrive/chauffeur/me/position', {
          method: 'POST',
          corps: { latitude: p.coords.latitude, longitude: p.coords.longitude },
        }).catch(() => undefined);
      },
      () => setErreur(t('positionRefusee')),
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(suivi);
  }, [enLigne, t]);

  const agir = async (chemin: string, corps: unknown = {}) => {
    setEnvoi(true);
    setErreur('');
    try {
      setTableau(await appelerZupDrive<Tableau>(`/api/zupdrive/chauffeur/me${chemin}`, { method: 'POST', corps }));
      return true;
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
      await charger();
      return false;
    } finally {
      setEnvoi(false);
    }
  };

  if (isLoading || (user && !tableau && !erreur)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }

  if (!user || !tableau) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-slate-600">{erreur || t('connexionRequise')}</p>
        <Link href="/chauffeur" className="mt-4 inline-block text-accent hover:underline">
          {t('versDossier')}
        </Link>
      </main>
    );
  }

  const valide = tableau.statut === 'VALIDE';
  const proposition = tableau.proposition;
  const resteSecondes = proposition
    ? Math.max(0, Math.ceil((new Date(proposition.expireA).getTime() - maintenant) / 1000))
    : 0;
  const course = tableau.course;
  const etape = course ? ETAPE_SUIVANTE[course.statut] : undefined;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('titre')}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-600" data-ma-moyenne>
            {tableau.maNote.moyenne != null ? (
              <>
                <Etoiles valeur={tableau.maNote.moyenne} taille={14} />
                {t('maMoyenne', { moyenne: tableau.maNote.moyenne.toLocaleString('fr-FR'), avis: tableau.maNote.avis })}
              </>
            ) : (
              t('pasEncoreNote')
            )}
          </p>
        </div>
        <Link href="/chauffeur" className="text-sm text-slate-500 hover:underline">
          {t('versDossier')}
        </Link>
      </div>

      {!valide && <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">{t('pasValide')}</p>}

      {erreur && (
        <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      {valide && (
        <section className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <p className="font-semibold text-slate-900">{enLigne ? t('enLigne') : t('horsLigne')}</p>
            <p className="text-sm text-slate-500">{enLigne ? t('enLigneAide') : t('horsLigneAide')}</p>
          </div>
          <button
            type="button"
            onClick={() => agir('/disponibilite', { enLigne: !enLigne })}
            disabled={envoi}
            className={`rounded-full px-5 py-2 font-semibold text-white disabled:opacity-60 ${
              enLigne ? 'bg-slate-600 hover:bg-slate-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {enLigne ? t('passerHorsLigne') : t('passerEnLigne')}
          </button>
        </section>
      )}

      {proposition && resteSecondes > 0 && (
        <section className="mt-6 rounded-xl border-2 border-accent bg-white p-5" data-proposition={proposition.id}>
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-slate-900">{t('nouvelleCourse')}</p>
            <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-white">{resteSecondes} s</span>
          </div>
          <Trajet course={proposition.course} />
          <p className="mt-2 text-sm text-slate-500">
            {t('aDistance', { distance: kilometres(proposition.distanceMetres) })}
            <NotePassager note={proposition.course.notePassager} />
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => agir(`/propositions/${proposition.id}/accepter`)}
              disabled={envoi}
              className="flex-1 rounded-full bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {t('accepter')}
            </button>
            <button
              type="button"
              onClick={() => agir(`/propositions/${proposition.id}/refuser`)}
              disabled={envoi}
              className="rounded-full border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60"
            >
              {t('refuser')}
            </button>
          </div>
        </section>
      )}

      {course && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5" data-course={course.id} data-statut={course.statut}>
          <p className="text-lg font-bold text-slate-900">{t(`statut.${course.statut}`)}</p>
          {course.passager && (
            <p className="text-sm text-slate-600">
              {t('passager', { prenom: course.passager })}
              <NotePassager note={course.notePassager} />
            </p>
          )}
          <Trajet course={course} />
          {etape && (
            <button
              type="button"
              onClick={() => agir(`/courses/${course.id}/${etape}`)}
              disabled={envoi}
              className="mt-4 w-full rounded-full bg-accent px-5 py-3 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {t(`etape.${etape}`)}
            </button>
          )}
          {(course.statut === 'ACCEPTEE' || course.statut === 'ARRIVEE') && (
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder={t('motifAnnulation')}
                aria-label={t('motifAnnulation')}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  if (await agir(`/courses/${course.id}/annuler`, { motif })) setMotif('');
                }}
                disabled={envoi || motif.trim().length < 3}
                className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {t('annuler')}
              </button>
            </div>
          )}
        </section>
      )}

      {tableau.historique.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">{t('historique')}</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {tableau.historique.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="min-w-0 truncate text-slate-700">
                    {c.departAdresse} → {c.arriveeAdresse}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {prix(c.prixCentimes)} · {t(`statut.${c.statut}`)}
                  </span>
                </div>
                {c.peutNoter && (
                  <div className="mt-2" data-noter-course={c.id}>
                    <NoterCourseDrive
                      chemin={`/api/zupdrive/chauffeur/me/courses/${encodeURIComponent(c.id)}/note`}
                      question={t('noterPassager')}
                      onNote={() => charger()}
                    />
                  </div>
                )}
                {c.noteDonnee && <p className="mt-1 text-xs text-slate-500">{t('passagerNote')}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** La moyenne du passager, pour aider à décider ; jamais le détail. */
function NotePassager({ note }: { note: Moyenne | null }) {
  const t = useTranslations('chauffeurCourses');
  if (!note) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
      {note.moyenne != null ? (
        <>
          <Etoiles valeur={note.moyenne} taille={12} /> {note.moyenne.toLocaleString('fr-FR')} ({note.avis})
        </>
      ) : (
        t('passagerNouveau')
      )}
    </span>
  );
}

function Trajet({ course }: { course: CoursePourChauffeur }) {
  const t = useTranslations('chauffeurCourses');
  return (
    <div className="mt-3 space-y-1 text-sm text-slate-700">
      <p className="flex items-start gap-2">
        <MapPin size={16} className="mt-0.5 shrink-0" /> {course.departAdresse}
      </p>
      <p className="flex items-start gap-2">
        <Navigation size={16} className="mt-0.5 shrink-0" /> {course.arriveeAdresse}
      </p>
      <p className="font-semibold text-slate-900">
        {prix(course.prixCentimes)}
        <span className="ml-2 font-normal text-slate-500">
          {t('trajetEstime', { distance: kilometres(course.distanceMetres), duree: minutes(course.dureeSecondes) })}
        </span>
      </p>
    </div>
  );
}
