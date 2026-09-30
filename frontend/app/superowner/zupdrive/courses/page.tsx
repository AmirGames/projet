'use client';

/**
 * ZupDrive — les courses de la plateforme, les plus récentes d'abord.
 * Lecture seule en V1 : l'équipe voit qui a commandé quoi, qui a conduit,
 * à quel prix et où en est chaque course.
 */

import { useCallback, useState } from 'react';
import { Navigation } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { appelerZupDrive, kilometres, prix } from '@/lib/zupdrive';

const STATUTS = ['ALL', 'RECHERCHE', 'ACCEPTEE', 'ARRIVEE', 'EN_COURS', 'TERMINEE', 'ANNULEE', 'SANS_CHAUFFEUR'] as const;

interface CourseAdmin {
  id: string;
  statut: string;
  region: string;
  departAdresse: string;
  arriveeAdresse: string;
  distanceMetres: number;
  prixCentimes: number;
  annuleePar: string | null;
  createdAt: string;
  passager: { email: string; name: string | null } | null;
  chauffeur: { nomComplet: string; vehiculePlaque: string | null } | null;
  notes: { auteur: 'PASSAGER' | 'CHAUFFEUR'; note: number; commentaire: string | null }[];
}

export default function CoursesDrivePage() {
  const t = useTranslations('superownerCoursesDrive');
  const [filtre, setFiltre] = useState<string>('ALL');
  const [courses, setCourses] = useState<CourseAdmin[]>([]);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      setCourses(await appelerZupDrive<CourseAdmin[]>(`/api/zupdrive/admin/courses?statut=${filtre}`));
      setErreur('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    }
  }, [filtre, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);
  useDonneesModifiees('zupdrive', () => charger());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
          <Navigation className="h-8 w-8" />
          {t('titre')}
        </h1>
        <p className="mt-2 text-gray-400">{t('sousTitre')}</p>
      </div>

      {erreur && <div role="alert" className="rounded-lg border border-red-500/20 bg-red-900/20 p-4 text-red-400">{erreur}</div>}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filtre')}>
        {STATUTS.map((statut) => (
          <button
            key={statut}
            onClick={() => setFiltre(statut)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              filtre === statut ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t(`statut.${statut}`)}
          </button>
        ))}
      </div>

      {courses.length === 0 ? (
        <p className="rounded-lg bg-gray-800/50 py-12 text-center text-gray-400">{t('aucune')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800 text-gray-400">
              <tr>
                <th className="px-4 py-2">{t('colonne.date')}</th>
                <th className="px-4 py-2">{t('colonne.trajet')}</th>
                <th className="px-4 py-2">{t('colonne.passager')}</th>
                <th className="px-4 py-2">{t('colonne.chauffeur')}</th>
                <th className="px-4 py-2">{t('colonne.prix')}</th>
                <th className="px-4 py-2">{t('colonne.statut')}</th>
                <th className="px-4 py-2">{t('colonne.notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-900 text-gray-200">
              {courses.map((course) => (
                <tr key={course.id}>
                  <td className="whitespace-nowrap px-4 py-2">{new Date(course.createdAt).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-2">
                    {course.departAdresse} → {course.arriveeAdresse}
                    <span className="block text-xs text-gray-500">
                      {t(`region.${course.region}`)} · {kilometres(course.distanceMetres)}
                    </span>
                  </td>
                  <td className="px-4 py-2">{course.passager?.email ?? t('compteSupprime')}</td>
                  <td className="px-4 py-2">
                    {course.chauffeur ? `${course.chauffeur.nomComplet}${course.chauffeur.vehiculePlaque ? ` · ${course.chauffeur.vehiculePlaque}` : ''}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">{prix(course.prixCentimes)}</td>
                  <td className="px-4 py-2">
                    {t(`statut.${course.statut}`)}
                    {course.annuleePar && <span className="block text-xs text-gray-500">{t(`annuleePar.${course.annuleePar}`)}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {course.notes.length === 0
                      ? '—'
                      : course.notes.map((n) => (
                          <span key={n.auteur} className={`block ${n.note <= 2 ? 'text-red-300' : ''}`}>
                            {t(`noteDe.${n.auteur}`, { note: n.note })}
                            {n.commentaire && <span className="block text-gray-400 italic">« {n.commentaire} »</span>}
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
