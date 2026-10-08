'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, Package, CheckCircle, AlertCircle, Star, Navigation, Gift } from 'lucide-react';
import { euro } from '@/lib/format';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { numeroCourt } from '@/lib/numero-commande';
import { useLocale, useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Filtre = 'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED';
type Periode = 'all' | 'today' | 'week' | 'month';

interface Course {
  id: string;
  orderId: string;
  status: 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | string;
  cancelledBy: string | null;
  cancellationReason: string | null;
  store: string;
  pickupAddress: string;
  deliveryCity: string;
  distanceKm: number | null;
  payout: number;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  durationMin: number | null;
  proofType: string | null;
  rating: { note: number; commentaire: string | null } | null;
  /** Le pourboire du client, à la commande ou après la livraison. */
  pourboire?: number;
  createdAt: string;
}

interface Reponse {
  data: Course[];
  pagination: { page: number; parPage: number; total: number; pages: number };
  resume: { livrees: number; gains: number; distanceKm: number };
}

// Les libellés : `filtres.<id>` et `periodes.<id>` des traductions.
const FILTRES: Filtre[] = ['ALL', 'ACTIVE', 'DELIVERED', 'CANCELLED'];

const PERIODES: Periode[] = ['all', 'today', 'week', 'month'];

/** Début de la période choisie, ou null pour tout l'historique. */
function debutPeriode(periode: Periode): Date | null {
  const maintenant = new Date();
  if (periode === 'today') return new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  if (periode === 'week') return new Date(maintenant.getTime() - 7 * 86400000);
  if (periode === 'month') return new Date(maintenant.getTime() - 30 * 86400000);
  return null;
}

const STATUTS: Record<string, { classes: string; Icon: typeof Clock }> = {
  ACCEPTED: { classes: 'bg-blue-50 text-blue-700', Icon: Package },
  PICKED_UP: { classes: 'bg-purple-50 text-purple-700', Icon: Navigation },
  DELIVERED: { classes: 'bg-green-50 text-green-700', Icon: CheckCircle },
  CANCELLED: { classes: 'bg-red-50 text-red-700', Icon: AlertCircle },
};

function Badge({ status }: { status: string }) {
  const t = useTranslations('historiqueCourses');
  const s = STATUTS[status] || { classes: 'bg-gray-100 text-gray-700', Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${s.classes}`}>
      <s.Icon size={14} />
      {STATUTS[status] ? t(`statuts.${status}`) : status}
    </span>
  );
}

const km = (n: number, locale: string) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const date = (iso: string | null | undefined, locale: string) =>
  iso
    ? new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export default function HistoriqueCoursesPage() {
  const t = useTranslations('historiqueCourses');
  const locale = useLocale();
  const router = useRouter();
  const [filtre, setFiltre] = useState<Filtre>('ALL');
  const [periode, setPeriode] = useState<Periode>('all');
  const [page, setPage] = useState(1);
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  // silencieux : une relecture en direct ne remplace pas la liste par la roue.
  const charger = useCallback(async (silencieux = false) => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
      return;
    }

    if (!silencieux) setLoading(true);
    setErreur('');

    const params = new URLSearchParams({ filtre, page: String(page), parPage: '20' });
    const debut = debutPeriode(periode);
    if (debut) params.set('depuis', debut.toISOString());

    try {
      const res = await fetch(`${API_URL}/api/drivers/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        router.push('/driver/login');
        return;
      }

      const donnees = await res.json();
      if (!res.ok) {
        setErreur(donnees.error || t('echecChargement'));
        return;
      }

      setReponse(donnees);
    } catch {
      setErreur(t('injoignable'));
    } finally {
      setLoading(false);
    }
  }, [filtre, periode, page, router, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Une course livrée, annulée ou payée s'inscrit dans l'historique aussitôt.
  useDonneesModifiees(['orders', 'drivers'], () => charger(true));

  const changerFiltre = (f: Filtre) => {
    setFiltre(f);
    setPage(1);
  };

  const changerPeriode = (p: Periode) => {
    setPeriode(p);
    setPage(1);
  };

  const courses = reponse?.data || [];

  return (
    <div className="min-h-screen">
      <header className="pt-4">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/driver" className="p-2 hover:bg-gray-100 rounded-lg transition" aria-label={t('retour')}>
            <ArrowLeft size={20} className="text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('titre')}</h1>
            <p className="text-gray-500 text-sm">{t('sousTitre')}</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Résumé de la période */}
        {reponse && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-4">
              <p className="text-gray-500 text-xs">{t('livrees')}</p>
              <p className="text-gray-900 text-2xl font-bold">{reponse.resume.livrees}</p>
            </div>
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-4">
              <p className="text-gray-500 text-xs">{t('gains')}</p>
              <p className="text-gray-900 text-2xl font-bold">{euro(reponse.resume.gains)}</p>
            </div>
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-4">
              <p className="text-gray-500 text-xs">{t('distance')}</p>
              <p className="text-gray-900 text-2xl font-bold">{t('km', { n: km(reponse.resume.distanceKm, locale) })}</p>
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTRES.map((f) => (
              <button
                key={f}
                onClick={() => changerFiltre(f)}
                className={`px-4 py-2 rounded-full font-semibold text-sm transition ${
                  filtre === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100'
                }`}
              >
                {t(`filtres.${f}`)}
              </button>
            ))}
          </div>
          <select
            value={periode}
            onChange={(e) => changerPeriode(e.target.value as Periode)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            aria-label={t('periode')}
          >
            {PERIODES.map((p) => (
              <option key={p} value={p}>
                {t(`periodes.${p}`)}
              </option>
            ))}
          </select>
        </div>

        {erreur && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{erreur}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : courses.length === 0 ? (
          <div className="bg-white ring-1 ring-gray-200 rounded-lg p-12 text-center">
            <Package size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-900 text-lg">{t('aucune')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => {
              const enCours = c.status === 'ACCEPTED' || c.status === 'PICKED_UP';
              const contenu = (
                <div
                  className={`bg-white rounded-lg p-4 border border-gray-200 ${
                    enCours ? 'hover:border-orange-600 cursor-pointer' : ''
                  }`}
                >
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <p className="text-gray-900 font-semibold">{c.store || t('commerce')}</p>
                      <p className="text-gray-500 text-xs">
                        {numeroCourt(c.orderId)} · {date(c.createdAt, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.status === 'DELIVERED' && (
                        <span className="text-green-600 font-bold text-lg">{euro(c.payout)}</span>
                      )}
                      <Badge status={c.status} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <p className="flex items-start gap-2 text-gray-700">
                      <MapPin size={14} className="text-orange-500 mt-0.5 shrink-0" />
                      {c.pickupAddress || '—'}
                    </p>
                    <p className="flex items-start gap-2 text-gray-700">
                      <MapPin size={14} className="text-green-500 mt-0.5 shrink-0" />
                      {c.deliveryCity || '—'}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                    {c.distanceKm != null && <span>{t('km', { n: km(c.distanceKm, locale) })}</span>}
                    {c.durationMin != null && <span>{t('dureeCourse', { n: c.durationMin })}</span>}
                    {c.deliveredAt && <span>{t('livreeLe', { date: date(c.deliveredAt, locale) })}</span>}
                    {c.proofType && <span>{c.proofType === 'CODE' ? t('preuveCode') : t('preuvePhoto')}</span>}
                    {c.rating && (
                      <span className="inline-flex items-center gap-1 text-yellow-600">
                        <Star size={12} fill="currentColor" /> {c.rating.note}/5
                        {c.rating.commentaire && <span className="text-gray-500"> — « {c.rating.commentaire} »</span>}
                      </span>
                    )}
                    {(c.pourboire ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-yellow-600 font-semibold">
                        <Gift size={12} /> {t('pourboire', { montant: euro(c.pourboire!) })}
                      </span>
                    )}
                  </div>

                  {c.status === 'CANCELLED' && c.cancellationReason && (
                    <p className="mt-2 text-xs text-red-700">{t('motif', { motif: c.cancellationReason })}</p>
                  )}
                </div>
              );

              // Seule une course en cours s'ouvre : la page de suivi n'a rien à
              // montrer pour une course terminée.
              return enCours ? (
                <Link key={c.id} href={`/driver/deliveries/${c.id}`} className="block">
                  {contenu}
                </Link>
              ) : (
                <div key={c.id}>{contenu}</div>
              );
            })}
          </div>
        )}

        {reponse && reponse.pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 bg-white ring-1 ring-gray-200 rounded-lg text-gray-900 disabled:opacity-50"
            >
              {t('precedent')}
            </button>
            <span className="text-gray-500 text-sm">
              {t('page', { page: reponse.pagination.page, pages: reponse.pagination.pages })}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(reponse.pagination.pages, p + 1))}
              disabled={page >= reponse.pagination.pages}
              className="px-4 py-2 bg-white ring-1 ring-gray-200 rounded-lg text-gray-900 disabled:opacity-50"
            >
              {t('suivant')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
