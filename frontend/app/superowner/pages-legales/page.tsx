'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Scale, Send, ExternalLink, History } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Les pages légales, modifiables sans mise en production.
 *
 * Chaque publication crée une nouvelle version, qui ne sera plus jamais
 * réécrite : c'est ce texte-là que les inscrits et les clients ont accepté,
 * et la preuve d'acceptation enregistre la version en vigueur.
 */

interface Version {
  id: string;
  version: string;
  titre: string;
  contenu: string;
  publieLe: string;
  publiePar: string | null;
}

interface Page {
  slug: string;
  titre: string;
  contenu: string;
  version: string;
  publieLe: string | null;
  parDefaut: boolean;
  historique: Version[];
}

type Brouillon = { titre: string; contenu: string; version: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Propose le numéro suivant : « 3 » → « 4 », « v2 » → « v3 », sinon la date du jour. */
function versionSuivante(actuelle: string): string {
  const m = actuelle.match(/^(.*?)(\d+)$/);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (m && !/^\d{4}-\d{2}-\d{2}$/.test(actuelle)) return `${m[1]}${Number(m[2]) + 1}`;
  return actuelle === aujourdhui ? `${aujourdhui}-2` : aujourdhui;
}

export default function PagesLegalesPage() {
  const t = useTranslations('pagesLegalesAdmin');
  const locale = useLocale();
  const date = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  const [pages, setPages] = useState<Page[]>([]);
  const [slug, setSlug] = useState('');
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [consultee, setConsultee] = useState<Version | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const page = pages.find((p) => p.slug === slug);

  const partirDe = (p: Page): Brouillon => ({
    titre: p.titre,
    contenu: p.contenu,
    version: versionSuivante(p.version),
  });

  const charger = useCallback(async (garder?: string) => {
    setChargement(true);
    try {
      const reponse = await fetch(`${API_URL}/api/superowner/pages-legales`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.error || t('chargementImpossible'));
        return;
      }
      const liste: Page[] = donnees.data;
      setPages(liste);
      const choisie = liste.find((p) => p.slug === garder) ?? liste[0];
      if (choisie) {
        setSlug(choisie.slug);
        setBrouillon(partirDe(choisie));
      }
      setErreur('');
    } catch {
      setErreur(t('injoignable'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const choisir = (p: Page) => {
    if (brouillonModifie && !confirm(t('abandonner'))) return;
    setSlug(p.slug);
    setBrouillon(partirDe(p));
    setConsultee(null);
    setMessage('');
    setErreur('');
  };

  const brouillonModifie =
    !!page && !!brouillon && (brouillon.titre !== page.titre || brouillon.contenu !== page.contenu);

  const publier = async () => {
    if (!page || !brouillon) return;
    if (
      !confirm(
        t('confirmerPublication', { version: brouillon.version, titre: brouillon.titre })
      )
    )
      return;

    setEnvoi(true);
    setErreur('');
    setMessage('');
    try {
      const reponse = await fetch(`${API_URL}/api/superowner/pages-legales/${page.slug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(brouillon),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.error || t('publicationImpossible'));
        return;
      }
      setMessage(t('publiee', { version: donnees.data.version }));
      await charger(page.slug);
    } catch {
      setErreur(t('injoignable'));
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement && pages.length === 0) {
    return <div className="p-8 text-gray-500">{t('chargement')}</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Scale size={28} className="text-red-500" />
        <div>
          <h1 className="text-3xl font-bold">{t('titrePage')}</h1>
          <p className="text-gray-500 text-sm">
            {t('intro')}
          </p>
        </div>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">{erreur}</div>
      )}
      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3">{message}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-6">
        {/* Liste des pages */}
        <nav className="space-y-1">
          {pages.map((p) => (
            <button
              key={p.slug}
              onClick={() => choisir(p)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                p.slug === slug ? 'bg-red-600 text-white' : 'bg-white hover:bg-gray-100 text-gray-800'
              }`}
            >
              <span className="block font-medium">{p.titre}</span>
              <span className="block text-xs opacity-75">
                v{p.version}
                {p.parDefaut ? t('texteDepartCourt') : ''}
              </span>
            </button>
          ))}
        </nav>

        {page && brouillon && (
          <div className="space-y-6">
            <section className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500">
                  {t.rich('enVigueur', {
                    version: page.version,
                    fort: (morceau) => <strong className="text-gray-800">{morceau}</strong>,
                  })}
                  {page.publieLe ? t('depuis', { date: date(page.publieLe) }) : t('jamaisPublie')}
                </p>
                <Link
                  href={`/${page.slug}`}
                  target="_blank"
                  className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
                >
                  {t('voirPublique')} <ExternalLink size={14} />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1" htmlFor="titre">
                    {t('titre')}
                  </label>
                  <input
                    id="titre"
                    value={brouillon.titre}
                    onChange={(e) => setBrouillon({ ...brouillon, titre: e.target.value })}
                    className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 focus:outline-hidden focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1" htmlFor="version">
                    {t('nouvelleVersion')}
                  </label>
                  <input
                    id="version"
                    value={brouillon.version}
                    onChange={(e) => setBrouillon({ ...brouillon, version: e.target.value })}
                    className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 font-mono focus:outline-hidden focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1" htmlFor="contenu">
                    {t.rich('texteMarkdown', { code: (morceau) => <code>{morceau}</code> })}
                  </label>
                  <textarea
                    id="contenu"
                    value={brouillon.contenu}
                    onChange={(e) => setBrouillon({ ...brouillon, contenu: e.target.value })}
                    rows={28}
                    className="w-full bg-white border border-gray-300 rounded-sm px-3 py-2 font-mono text-sm leading-relaxed focus:outline-hidden focus:border-red-500"
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">{t('apercu')}</p>
                  <div className="legal bg-white ring-1 ring-gray-200 text-gray-800 rounded-sm p-6 max-h-168 overflow-y-auto">
                    <h1>{brouillon.titre}</h1>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{brouillon.contenu}</ReactMarkdown>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={publier}
                  disabled={envoi || !brouillon.version.trim() || !brouillon.contenu.trim()}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  <Send size={16} />
                  {envoi ? t('publication') : t('publier', { version: brouillon.version })}
                </button>
                {brouillonModifie && (
                  <button
                    onClick={() => setBrouillon(partirDe(page))}
                    className="text-sm text-gray-500 hover:text-gray-900"
                  >
                    {t('annulerModifs')}
                  </button>
                )}
                <p className="text-xs text-gray-500">
                  {t('cguAnnonce')}
                </p>
              </div>
            </section>

            {/* Historique */}
            <section className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-3">
                <History size={18} /> {t('versionsPubliees')}
              </h2>
              {page.historique.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {t('aucuneVersion', { version: page.version })}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-left">
                    <tr>
                      <th className="py-2">{t('version')}</th>
                      <th>{t('publieeLe')}</th>
                      <th>{t('par')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {page.historique.map((v, i) => (
                      <tr key={v.id} className="border-t border-gray-200">
                        <td className="py-2 font-mono">
                          {v.version}
                          {i === 0 && <span className="ml-2 text-xs text-green-600">{t('enVigueurCourt')}</span>}
                        </td>
                        <td>{date(v.publieLe)}</td>
                        <td className="text-gray-500">{v.publiePar ?? '—'}</td>
                        <td className="text-right space-x-3">
                          <button onClick={() => setConsultee(v)} className="text-gray-700 hover:text-gray-900">
                            {t('voir')}
                          </button>
                          <button
                            onClick={() => setBrouillon({ titre: v.titre, contenu: v.contenu, version: versionSuivante(page.version) })}
                            className="text-gray-700 hover:text-gray-900"
                          >
                            {t('repartir')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>

      {consultee && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConsultee(null)}
        >
          <div
            className="legal bg-white ring-1 ring-gray-200 text-gray-800 rounded-lg p-8 max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-500">
              {t('versionPubliee', { version: consultee.version, date: date(consultee.publieLe) })}
            </p>
            <h1>{consultee.titre}</h1>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{consultee.contenu}</ReactMarkdown>
            <button onClick={() => setConsultee(null)} className="mt-6 rounded-sm bg-white ring-1 ring-gray-200 px-4 py-2 text-gray-900">
              {t('fermer')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
