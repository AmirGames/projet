'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, Package, CheckCircle, AlertCircle, Star, Navigation } from 'lucide-react';
import { euro } from '@/lib/format';

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
  createdAt: string;
}

interface Reponse {
  data: Course[];
  pagination: { page: number; parPage: number; total: number; pages: number };
  resume: { livrees: number; gains: number; distanceKm: number };
}

const FILTRES: { id: Filtre; label: string }[] = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'ACTIVE', label: 'En cours' },
  { id: 'DELIVERED', label: 'Livrées' },
  { id: 'CANCELLED', label: 'Annulées' },
];

const PERIODES: { id: Periode; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' },
];

/** Début de la période choisie, ou null pour tout l'historique. */
function debutPeriode(periode: Periode): Date | null {
  const maintenant = new Date();
  if (periode === 'today') return new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  if (periode === 'week') return new Date(maintenant.getTime() - 7 * 86400000);
  if (periode === 'month') return new Date(maintenant.getTime() - 30 * 86400000);
  return null;
}

const STATUTS: Record<string, { label: string; classes: string; Icon: typeof Clock }> = {
  ACCEPTED: { label: 'Acceptée', classes: 'bg-blue-900 text-blue-300', Icon: Package },
  PICKED_UP: { label: 'En route', classes: 'bg-purple-900 text-purple-300', Icon: Navigation },
  DELIVERED: { label: 'Livrée', classes: 'bg-green-900 text-green-300', Icon: CheckCircle },
  CANCELLED: { label: 'Annulée', classes: 'bg-red-900 text-red-300', Icon: AlertCircle },
};

function Badge({ status }: { status: string }) {
  const s = STATUTS[status] || { label: status, classes: 'bg-gray-700 text-gray-300', Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${s.classes}`}>
      <s.Icon size={14} />
      {s.label}
    </span>
  );
}

const date = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export default function HistoriqueCoursesPage() {
  const router = useRouter();
  const [filtre, setFiltre] = useState<Filtre>('ALL');
  const [periode, setPeriode] = useState<Periode>('all');
  const [page, setPage] = useState(1);
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
      return;
    }

    setLoading(true);
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
        setErreur(donnees.error || "L'historique n'a pas pu être chargé.");
        return;
      }

      setReponse(donnees);
    } catch {
      setErreur('Serveur injoignable.');
    } finally {
      setLoading(false);
    }
  }, [filtre, periode, page, router]);

  useEffect(() => {
    charger();
  }, [charger]);

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
    <div className="min-h-screen bg-gray-900">
      <header className="pt-4">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/driver" className="p-2 hover:bg-gray-700 rounded-lg transition" aria-label="Retour">
            <ArrowLeft size={20} className="text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Historique des courses</h1>
            <p className="text-gray-400 text-sm">Toutes vos livraisons, gains et avis</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Résumé de la période */}
        {reponse && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Livrées</p>
              <p className="text-white text-2xl font-bold">{reponse.resume.livrees}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Gains</p>
              <p className="text-white text-2xl font-bold">{euro(reponse.resume.gains)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Distance</p>
              <p className="text-white text-2xl font-bold">{reponse.resume.distanceKm.toFixed(1)} km</p>
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTRES.map((f) => (
              <button
                key={f.id}
                onClick={() => changerFiltre(f.id)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                  filtre === f.id ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={periode}
            onChange={(e) => changerPeriode(e.target.value as Periode)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            aria-label="Période"
          >
            {PERIODES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {erreur && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-sm">{erreur}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : courses.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <Package size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-white text-lg">Aucune course sur cette période</p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => {
              const enCours = c.status === 'ACCEPTED' || c.status === 'PICKED_UP';
              const contenu = (
                <div
                  className={`bg-gray-800 rounded-lg p-4 border border-gray-700 ${
                    enCours ? 'hover:border-orange-600 cursor-pointer' : ''
                  }`}
                >
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <p className="text-white font-semibold">{c.store || 'Commerce'}</p>
                      <p className="text-gray-500 text-xs">
                        #{c.orderId.slice(0, 8)} · {date(c.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.status === 'DELIVERED' && (
                        <span className="text-green-400 font-bold text-lg">{euro(c.payout)}</span>
                      )}
                      <Badge status={c.status} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <p className="flex items-start gap-2 text-gray-300">
                      <MapPin size={14} className="text-orange-500 mt-0.5 flex-shrink-0" />
                      {c.pickupAddress || '—'}
                    </p>
                    <p className="flex items-start gap-2 text-gray-300">
                      <MapPin size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                      {c.deliveryCity || '—'}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                    {c.distanceKm != null && <span>{c.distanceKm.toFixed(1)} km</span>}
                    {c.durationMin != null && <span>{c.durationMin} min de course</span>}
                    {c.deliveredAt && <span>Livrée {date(c.deliveredAt)}</span>}
                    {c.proofType && <span>Preuve : {c.proofType === 'CODE' ? 'code client' : 'photo'}</span>}
                    {c.rating && (
                      <span className="inline-flex items-center gap-1 text-yellow-400">
                        <Star size={12} fill="currentColor" /> {c.rating.note}/5
                        {c.rating.commentaire && <span className="text-gray-400"> — « {c.rating.commentaire} »</span>}
                      </span>
                    )}
                  </div>

                  {c.status === 'CANCELLED' && c.cancellationReason && (
                    <p className="mt-2 text-xs text-red-300">Motif : {c.cancellationReason}</p>
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
              className="px-4 py-2 bg-gray-800 rounded-lg text-white disabled:opacity-40"
            >
              Précédent
            </button>
            <span className="text-gray-400 text-sm">
              Page {reponse.pagination.page} / {reponse.pagination.pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(reponse.pagination.pages, p + 1))}
              disabled={page >= reponse.pagination.pages}
              className="px-4 py-2 bg-gray-800 rounded-lg text-white disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
