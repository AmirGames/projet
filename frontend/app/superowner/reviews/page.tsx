'use client';

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, Star } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Compte {
  email: string;
  name: string | null;
}

interface Signalement {
  id: string;
  motif: string;
  signaleLe: string;
  /** Absent : signalement automatique, après la retouche d'un avis retiré. */
  signalePar: Compte | null;
  decision: 'KEPT' | 'REMOVED' | null;
  noteDecision: string | null;
  decideLe: string | null;
  decidePar: Compte | null;
  avis: {
    id: string;
    note: number;
    commentaire: string | null;
    statut: string;
    modifieLe: string;
    boutique: { id: string; name: string };
    plat: string | null;
    client: { name: string; email: string } | null;
  };
}

/**
 * Les avis signalés par les commerçants. Le commerçant ne peut ni rejeter ni
 * supprimer un avis : c'est ici que la plateforme le conserve ou le retire.
 */
export default function AvisSignalesPage() {
  const t = useTranslations('superownerReviews');
  const locale = useLocale();
  const [onglet, setOnglet] = useState<'EN_ATTENTE' | 'TRAITES'>('EN_ATTENTE');
  const [signalements, setSignalements] = useState<Signalement[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    setChargement(true);
    try {
      const res = await fetch(`${API_URL}/api/superowner/review-reports?etat=${onglet}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const donnees = await res.json();
      if (!res.ok) throw new Error(donnees.error);
      setSignalements(donnees.data || []);
      setTotal(donnees.total || 0);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('loadError'));
    } finally {
      setChargement(false);
    }
  }, [onglet, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const decider = async (id: string, decision: 'KEPT' | 'REMOVED') => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    setEnCours(id);
    try {
      const res = await fetch(`${API_URL}/api/superowner/review-reports/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision, note: notes[id] || undefined }),
      });
      const donnees = await res.json();
      if (!res.ok) throw new Error(donnees.error);
      // Tranché : il quitte la file.
      setSignalements((liste) => liste.filter((s) => s.id !== id));
      setTotal((n) => Math.max(0, n - 1));
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('decisionError'));
    } finally {
      setEnCours(null);
    }
  };

  const date = (valeur: string) =>
    new Date(valeur).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Flag className="text-orange-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t('title')} {onglet === 'EN_ATTENTE' && total > 0 && <span className="text-orange-400">({total})</span>}
          </h1>
          <p className="text-gray-400 text-sm">{t('description')}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(['EN_ATTENTE', 'TRAITES'] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              onglet === o
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'
            }`}
          >
            {o === 'EN_ATTENTE' ? t('tabPending') : t('tabDecided')}
          </button>
        ))}
      </div>

      {erreur && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-sm">{erreur}</div>
      )}

      {chargement ? (
        <p className="text-gray-400">{t('loading')}</p>
      ) : signalements.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
          {onglet === 'EN_ATTENTE' ? t('emptyPending') : t('emptyDecided')}
        </div>
      ) : (
        <div className="space-y-4">
          {signalements.map((s) => (
            <div key={s.id} className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-white font-semibold">{s.avis.boutique.name}</p>
                  <p className="text-gray-400 text-sm">{s.avis.plat ?? t('storeReview')}</p>
                </div>
                {s.decision && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      s.decision === 'REMOVED'
                        ? 'bg-red-600/20 text-red-400 border-red-600/50'
                        : 'bg-green-600/20 text-green-400 border-green-600/50'
                    }`}
                  >
                    {s.decision === 'REMOVED' ? t('removed') : t('kept')}
                  </span>
                )}
              </div>

              {/* L'avis tel qu'il est publié (ou était, s'il est retiré). */}
              <div className="bg-gray-900/60 rounded-lg p-4">
                <div className="flex items-center gap-1 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i < s.avis.note ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}
                    />
                  ))}
                  <span className="text-gray-500 text-xs ml-2">{date(s.avis.modifieLe)}</span>
                </div>
                {s.avis.commentaire ? (
                  <p className="text-gray-200 italic">« {s.avis.commentaire} »</p>
                ) : (
                  <p className="text-gray-500 text-sm">{t('noComment')}</p>
                )}
                {s.avis.client && (
                  <p className="text-gray-500 text-xs mt-2">
                    {t('by', { name: s.avis.client.name, email: s.avis.client.email })}
                  </p>
                )}
              </div>

              <div className="border-l-2 border-orange-600 pl-3">
                <p className="text-orange-300 text-sm font-semibold">
                  {s.signalePar
                    ? t('reportedBy', { who: s.signalePar.name || s.signalePar.email, date: date(s.signaleLe) })
                    : t('reportedAuto', { date: date(s.signaleLe) })}
                </p>
                <p className="text-gray-200 text-sm">{s.motif}</p>
              </div>

              {s.decision ? (
                <p className="text-gray-400 text-sm">
                  {t('decidedBy', { who: s.decidePar?.name || s.decidePar?.email || '—', date: s.decideLe ? date(s.decideLe) : '' })}
                  {s.noteDecision && <span className="text-gray-300"> — {s.noteDecision}</span>}
                </p>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={notes[s.id] || ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                    placeholder={t('notePlaceholder')}
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => decider(s.id, 'KEPT')}
                      disabled={enCours === s.id}
                      className="px-4 py-2 bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-600/50 rounded-lg text-sm font-semibold disabled:opacity-50"
                    >
                      {s.avis.statut === 'REMOVED' ? t('republish') : t('keep')}
                    </button>
                    <button
                      onClick={() => decider(s.id, 'REMOVED')}
                      disabled={enCours === s.id}
                      className="px-4 py-2 bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-600/50 rounded-lg text-sm font-semibold disabled:opacity-50"
                    >
                      {s.avis.statut === 'REMOVED' ? t('keepRemoved') : t('remove')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
