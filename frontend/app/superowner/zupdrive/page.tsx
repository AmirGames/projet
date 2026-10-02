'use client';

/**
 * ZupDrive — le tableau de bord de la plateforme dans l'administration du
 * groupe (manager.zupone.com) : où en sont les dossiers des chauffeurs et les
 * courses, sans avoir à ouvrir chaque liste.
 *
 * Tout vient de l'API d'administration ZupDrive (/api/zupdrive/admin), gardée
 * par les permissions de la plateforme DRIVE : un bloc dont la section n'est
 * pas ouverte au rôle n'est ni demandé ni affiché.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Car, ChevronRight, Clock, Navigation } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AccesPlateforme, chargerAcces } from '@/lib/acces-plateforme';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { prix } from '@/lib/zupdrive';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Les statuts d'une course qui a un chauffeur et n'est pas finie. */
const EN_COURS = ['ACCEPTEE', 'ARRIVEE', 'EN_COURS'] as const;

interface DossierEnAttente {
  id: string;
  nomComplet: string;
  region: string | null;
  soumisLe: string | null;
  piecesValidees: number;
  piecesExigees: number;
}

interface Course {
  id: string;
  statut: string;
  departAdresse: string;
  arriveeAdresse: string;
  prixCentimes: number;
  createdAt: string;
}

interface Chiffres {
  chauffeurs: {
    parStatut: Record<string, number>;
    enAttente: DossierEnAttente[];
    /** Les sociétés par statut : même section « chauffeurs » (dossiers LVC). */
    societes: Record<string, number>;
  } | null;
  courses: { parStatut: Record<string, number>; dernieres: Course[] } | null;
}

/** La réponse complète : les compteurs et la pagination sont hors de `data`. */
async function lire<T>(chemin: string): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const reponse = await fetch(`${API_URL}/api/zupdrive/admin${chemin}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const lu = await reponse.json().catch(() => null);
  if (!reponse.ok) throw new Error(lu?.error || `HTTP ${reponse.status}`);
  return lu as T;
}

const totalDes = async (statut: string) =>
  (await lire<{ pagination: { total: number } }>(`/courses?statut=${statut}&limit=1`)).pagination.total;

export default function TableauDeBordZupDrive() {
  const t = useTranslations('superownerZupDrive');
  const tCourses = useTranslations('superownerCoursesDrive');
  const [chiffres, setChiffres] = useState<Chiffres | null>(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const acces: AccesPlateforme = await chargerAcces();
      const voit = (section: string) => acces.isSuperOwner || !!acces.permissions[section];

      const [chauffeurs, courses] = await Promise.all([
        voit('chauffeurs')
          ? Promise.all([
              lire<{ data: DossierEnAttente[]; counts: Record<string, number> }>('/chauffeurs?statut=SOUMIS&limit=5'),
              lire<{ counts: Record<string, number> }>('/societes?statut=SOUMIS&limit=1'),
            ]).then(([lu, societes]) => ({ parStatut: lu.counts, enAttente: lu.data, societes: societes.counts }))
          : null,
        voit('courses-drive')
          ? Promise.all([
              lire<{ data: Course[] }>('/courses?statut=ALL&limit=5'),
              ...['RECHERCHE', ...EN_COURS, 'TERMINEE', 'SANS_CHAUFFEUR'].map(async (statut) => [statut, await totalDes(statut)] as const),
            ]).then(([dernieres, ...totaux]) => ({
              dernieres: (dernieres as { data: Course[] }).data,
              parStatut: Object.fromEntries(totaux as (readonly [string, number])[]),
            }))
          : null,
      ]);
      setChiffres({ chauffeurs, courses });
      setErreur('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);
  useDonneesModifiees('zupdrive', () => charger());

  const date = (valeur: string) => new Date(valeur).toLocaleDateString('fr-FR');
  const enCours = chiffres?.courses ? EN_COURS.reduce((somme, statut) => somme + (chiffres.courses?.parStatut[statut] ?? 0), 0) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Car className="h-8 w-8" />
          {t('titre')}
        </h1>
        <p className="mt-2 text-gray-500">{t('sousTitre')}</p>
      </div>

      {erreur && (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-50 p-4 text-red-600">
          {erreur}
        </div>
      )}

      {!chiffres && !erreur && <p className="text-gray-500">{t('chargement')}</p>}

      {chiffres?.chauffeurs && (
        <section className="space-y-4" aria-labelledby="bloc-chauffeurs">
          <h2 id="bloc-chauffeurs" className="text-xl font-semibold text-gray-900">
            {t('chauffeurs.titre')}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tuile
              libelle={t('chauffeurs.aExaminer')}
              valeur={chiffres.chauffeurs.parStatut.SOUMIS ?? 0}
              accent={(chiffres.chauffeurs.parStatut.SOUMIS ?? 0) > 0}
              href="/superowner/zupdrive/chauffeurs"
            />
            <Tuile libelle={t('chauffeurs.valides')} valeur={chiffres.chauffeurs.parStatut.VALIDE ?? 0} />
            <Tuile libelle={t('chauffeurs.suspendus')} valeur={chiffres.chauffeurs.parStatut.SUSPENDU ?? 0} />
            <Tuile libelle={t('chauffeurs.brouillons')} valeur={chiffres.chauffeurs.parStatut.BROUILLON ?? 0} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tuile
              libelle={t('chauffeurs.societesAExaminer')}
              valeur={chiffres.chauffeurs.societes.SOUMIS ?? 0}
              accent={(chiffres.chauffeurs.societes.SOUMIS ?? 0) > 0}
              href="/superowner/zupdrive/societes"
            />
            <Tuile libelle={t('chauffeurs.societesValidees')} valeur={chiffres.chauffeurs.societes.VALIDE ?? 0} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <h3 className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">
              <Clock size={16} />
              {t('chauffeurs.plusAnciens')}
            </h3>
            {chiffres.chauffeurs.enAttente.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">{t('chauffeurs.aucunEnAttente')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {chiffres.chauffeurs.enAttente.map((dossier) => (
                  <li key={dossier.id}>
                    <Link
                      href={`/superowner/zupdrive/chauffeurs/${dossier.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50 hover:no-underline"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">{dossier.nomComplet}</span>
                        <span className="text-xs text-gray-500">
                          {dossier.soumisLe ? t('chauffeurs.soumisLe', { date: date(dossier.soumisLe) }) : ''}
                          {' · '}
                          {t('chauffeurs.pieces', { validees: dossier.piecesValidees, exigees: dossier.piecesExigees })}
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-gray-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {chiffres?.courses && (
        <section className="space-y-4" aria-labelledby="bloc-courses">
          <h2 id="bloc-courses" className="text-xl font-semibold text-gray-900">
            {t('courses.titre')}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tuile libelle={t('courses.recherche')} valeur={chiffres.courses.parStatut.RECHERCHE ?? 0} />
            <Tuile libelle={t('courses.enCours')} valeur={enCours} />
            <Tuile
              libelle={t('courses.sansChauffeur')}
              valeur={chiffres.courses.parStatut.SANS_CHAUFFEUR ?? 0}
              accent={(chiffres.courses.parStatut.SANS_CHAUFFEUR ?? 0) > 0}
            />
            <Tuile libelle={t('courses.terminees')} valeur={chiffres.courses.parStatut.TERMINEE ?? 0} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <h3 className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">
              <span className="flex items-center gap-2">
                <Navigation size={16} />
                {t('courses.dernieres')}
              </span>
              <Link href="/superowner/zupdrive/courses" className="text-xs font-normal text-blue-600">
                {t('courses.toutes')}
              </Link>
            </h3>
            {chiffres.courses.dernieres.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">{t('courses.aucune')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {chiffres.courses.dernieres.map((course) => (
                  <li key={course.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-800">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {course.departAdresse} → {course.arriveeAdresse}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(course.createdAt).toLocaleString('fr-FR')} · {tCourses(`statut.${course.statut}`)}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap">{prix(course.prixCentimes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Tuile({ libelle, valeur, accent, href }: { libelle: string; valeur: number; accent?: boolean; href?: string }) {
  const contenu = (
    <>
      <p className="text-sm text-gray-500">{libelle}</p>
      <p className={`mt-2 text-3xl font-bold ${accent ? 'text-amber-600' : 'text-gray-900'}`}>{valeur}</p>
    </>
  );
  const classes = 'block rounded-lg border border-gray-200 bg-white p-5';
  return href ? (
    <Link href={href} className={`${classes} hover:border-gray-400 hover:no-underline`}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}
