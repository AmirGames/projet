'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Scale, Send, ExternalLink, History } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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

const date = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export default function PagesLegalesPage() {
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
        setErreur(donnees.error || 'Chargement impossible');
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
      setErreur('Serveur injoignable');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const choisir = (p: Page) => {
    if (brouillonModifie && !confirm('Abandonner les modifications en cours ?')) return;
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
        `Publier la version « ${brouillon.version} » de « ${brouillon.titre} » ? Elle s'appliquera immédiatement et ne pourra plus être modifiée.`
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
        setErreur(donnees.error || 'Publication impossible');
        return;
      }
      setMessage(`Version ${donnees.data.version} publiée.`);
      await charger(page.slug);
    } catch {
      setErreur('Serveur injoignable');
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement && pages.length === 0) {
    return <div className="p-8 text-gray-400">Chargement…</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Scale size={28} className="text-red-500" />
        <div>
          <h1 className="text-3xl font-bold">Pages légales</h1>
          <p className="text-gray-400 text-sm">
            Chaque publication crée une nouvelle version. Les inscriptions et commandes enregistrent la
            version acceptée ; les anciennes restent consultables.
          </p>
        </div>
      </div>

      {erreur && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg px-4 py-3">{erreur}</div>
      )}
      {message && (
        <div className="bg-green-900/30 border border-green-700 text-green-200 rounded-lg px-4 py-3">{message}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-6">
        {/* Liste des pages */}
        <nav className="space-y-1">
          {pages.map((p) => (
            <button
              key={p.slug}
              onClick={() => choisir(p)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                p.slug === slug ? 'bg-red-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
              }`}
            >
              <span className="block font-medium">{p.titre}</span>
              <span className="block text-xs opacity-75">
                v{p.version}
                {p.parDefaut ? ' · texte de départ' : ''}
              </span>
            </button>
          ))}
        </nav>

        {page && brouillon && (
          <div className="space-y-6">
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-400">
                  En vigueur : <strong className="text-gray-200">v{page.version}</strong>
                  {page.publieLe ? ` depuis le ${date(page.publieLe)}` : ' (texte de départ, jamais publié)'}
                </p>
                <Link
                  href={`/${page.slug}`}
                  target="_blank"
                  className="flex items-center gap-1 text-sm text-gray-300 hover:text-white"
                >
                  Voir la page publique <ExternalLink size={14} />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1" htmlFor="titre">
                    Titre
                  </label>
                  <input
                    id="titre"
                    value={brouillon.titre}
                    onChange={(e) => setBrouillon({ ...brouillon, titre: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1" htmlFor="version">
                    Nouvelle version
                  </label>
                  <input
                    id="version"
                    value={brouillon.version}
                    onChange={(e) => setBrouillon({ ...brouillon, version: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1" htmlFor="contenu">
                    Texte (Markdown : <code>## Titre</code>, <code>- liste</code>, <code>**gras**</code>,{' '}
                    <code>[lien](/cgu)</code>, tableaux)
                  </label>
                  <textarea
                    id="contenu"
                    value={brouillon.contenu}
                    onChange={(e) => setBrouillon({ ...brouillon, contenu: e.target.value })}
                    rows={28}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 font-mono text-sm leading-relaxed focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-1">Aperçu</p>
                  <div className="legal bg-white text-slate-800 rounded p-6 max-h-[42rem] overflow-y-auto">
                    <h1>{brouillon.titre}</h1>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{brouillon.contenu}</ReactMarkdown>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={publier}
                  disabled={envoi || !brouillon.version.trim() || !brouillon.contenu.trim()}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  <Send size={16} />
                  {envoi ? 'Publication…' : `Publier la version ${brouillon.version}`}
                </button>
                {brouillonModifie && (
                  <button
                    onClick={() => setBrouillon(partirDe(page))}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    Annuler les modifications
                  </button>
                )}
                <p className="text-xs text-gray-500">
                  Une modification substantielle des CGU doit être annoncée aux inscrits avant son entrée en vigueur.
                </p>
              </div>
            </section>

            {/* Historique */}
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-3">
                <History size={18} /> Versions publiées
              </h2>
              {page.historique.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Aucune version publiée : le site affiche le texte de départ (v{page.version}).
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-left">
                    <tr>
                      <th className="py-2">Version</th>
                      <th>Publiée le</th>
                      <th>Par</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {page.historique.map((v, i) => (
                      <tr key={v.id} className="border-t border-gray-700">
                        <td className="py-2 font-mono">
                          {v.version}
                          {i === 0 && <span className="ml-2 text-xs text-green-400">en vigueur</span>}
                        </td>
                        <td>{date(v.publieLe)}</td>
                        <td className="text-gray-400">{v.publiePar ?? '—'}</td>
                        <td className="text-right space-x-3">
                          <button onClick={() => setConsultee(v)} className="text-gray-300 hover:text-white">
                            Voir
                          </button>
                          <button
                            onClick={() => setBrouillon({ titre: v.titre, contenu: v.contenu, version: versionSuivante(page.version) })}
                            className="text-gray-300 hover:text-white"
                          >
                            Repartir de ce texte
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
            className="legal bg-white text-slate-800 rounded-lg p-8 max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-500">
              Version {consultee.version} — publiée le {date(consultee.publieLe)}
            </p>
            <h1>{consultee.titre}</h1>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{consultee.contenu}</ReactMarkdown>
            <button onClick={() => setConsultee(null)} className="mt-6 rounded bg-slate-800 px-4 py-2 text-white">
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
