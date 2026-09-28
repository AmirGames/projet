'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Pause, Play, Terminal, Trash2 } from 'lucide-react';

/**
 * La console du serveur, en direct : ce que `npm run dev` ou
 * `./deploy/zup.sh logs backend` affichent, sans ouvrir de terminal.
 */

interface Ligne {
  id: number;
  date: string;
  niveau: string;
  message: string;
  meta?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MAX_LIGNES = 2000;

const COULEURS: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-amber-400',
  info: 'text-sky-400',
  http: 'text-gray-500',
  debug: 'text-fuchsia-400',
};

const NIVEAUX = ['error', 'warn', 'info', 'http', 'debug'] as const;

export default function ConsolePage() {
  const t = useTranslations('superownerConsole');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [erreur, setErreur] = useState('');
  const [enPause, setEnPause] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [niveaux, setNiveaux] = useState<Record<string, boolean>>({
    error: true, warn: true, info: true, http: true, debug: true,
  });
  const dernierId = useRef(0);
  const bas = useRef<HTMLDivElement>(null);
  const suivre = useRef(true);

  useEffect(() => {
    if (enPause) return;
    let actif = true;

    const charger = async () => {
      try {
        const jeton = localStorage.getItem('accessToken');
        const reponse = await fetch(`${API_URL}/api/superowner/console?apres=${dernierId.current}`, {
          headers: { Authorization: `Bearer ${jeton}` },
        });
        const donnees = await reponse.json();
        if (!actif) return;
        if (!reponse.ok) {
          setErreur(donnees.error || t('loadError'));
          return;
        }
        const nouvelles: Ligne[] = donnees.data;
        // Le serveur a redémarré : ses ids repartent de 1.
        if (nouvelles.length > 0 && nouvelles[0].id <= dernierId.current) {
          dernierId.current = 0;
          setLignes([]);
          return;
        }
        if (nouvelles.length > 0) {
          dernierId.current = nouvelles[nouvelles.length - 1].id;
          setLignes((avant) => [...avant, ...nouvelles].slice(-MAX_LIGNES));
        }
        setErreur('');
      } catch {
        if (actif) setErreur(t('serverUnreachable'));
      }
    };

    charger();
    const minuterie = setInterval(charger, 2000);
    return () => {
      actif = false;
      clearInterval(minuterie);
    };
  }, [enPause, t]);

  const visibles = useMemo(() => {
    const r = recherche.trim().toLowerCase();
    return lignes.filter((l) =>
      (niveaux[l.niveau] ?? true) &&
      (!r || `${l.message} ${l.meta ?? ''}`.toLowerCase().includes(r)));
  }, [lignes, niveaux, recherche]);

  useEffect(() => {
    if (suivre.current) bas.current?.scrollIntoView({ block: 'end' });
  }, [visibles]);

  const compte = (niveau: string) => lignes.filter((l) => l.niveau === niveau).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/superowner" aria-label={t('back')} className="p-2 hover:bg-gray-800 rounded-lg transition">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Terminal size={28} className="text-red-500" />
              {t('title')}
            </h1>
            <p className="text-gray-400 text-sm mt-1">{t('subtitle')}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEnPause((p) => !p)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-lg transition"
          >
            {enPause ? <Play size={16} /> : <Pause size={16} />}
            {enPause ? t('resume') : t('pause')}
          </button>
          <button
            type="button"
            onClick={() => setLignes([])}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-lg transition"
          >
            <Trash2 size={16} />
            {t('clear')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {NIVEAUX.map((niveau) => (
          <button
            key={niveau}
            type="button"
            onClick={() => setNiveaux((n) => ({ ...n, [niveau]: !n[niveau] }))}
            className={`px-3 py-1 rounded-full text-xs font-mono border transition ${
              niveaux[niveau] ? `border-gray-600 bg-gray-800 ${COULEURS[niveau]}` : 'border-gray-800 text-gray-600 line-through'
            }`}
          >
            {niveau.toUpperCase()} ({compte(niveau)})
          </button>
        ))}
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('search')}
          className="flex-1 min-w-[12rem] px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
        />
      </div>

      {erreur && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg px-4 py-3">{erreur}</div>
      )}

      <div
        className="bg-black border border-gray-700 rounded-lg p-3 h-[70vh] overflow-auto font-mono text-xs leading-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          suivre.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {visibles.length === 0 && <p className="text-gray-500">{t('empty')}</p>}
        {visibles.map((l) => (
          <div key={l.id} className="whitespace-pre-wrap break-all">
            <span className={COULEURS[l.niveau] ?? 'text-gray-300'}>
              [{new Date(l.date).toLocaleString('fr-FR')}] {l.niveau.toUpperCase()}
            </span>{' '}
            <span className="text-gray-200">{l.message}</span>
            {l.meta && <span className="text-gray-500"> {l.meta}</span>}
          </div>
        ))}
        <div ref={bas} />
      </div>
    </div>
  );
}
