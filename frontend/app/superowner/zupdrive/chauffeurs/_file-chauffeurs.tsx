'use client';

/**
 * ZupDrive — la file de validation des dossiers chauffeurs (licence LVC).
 *
 * Les chauffeurs transportent des personnes : rien à voir avec les livreurs
 * ZupEat (/superowner/zupeat/drivers). Tout se décide côté API
 * (/api/zupdrive/admin/chauffeurs), qui applique les permissions de la
 * plateforme ZupDrive et journalise chaque décision : l'écran se contente de
 * relire l'état réel après chaque geste.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Car, Check, Eye, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { useDerniereValeur } from '@/lib/use-derniere-valeur';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const BASE = `${API_URL}/api/zupdrive/admin/chauffeurs`;

const STATUTS = ['SOUMIS', 'VALIDE', 'REFUSE', 'SUSPENDU', 'BROUILLON', 'ALL'] as const;

interface LigneChauffeur {
  id: string;
  nomComplet: string;
  email: string;
  telephone: string | null;
  region: string | null;
  raisonSociale: string | null;
  vehiculePlaque: string | null;
  statut: string;
  motifStatut: string | null;
  soumisLe: string | null;
  piecesDeposees: number;
  piecesValidees: number;
  piecesExigees: number;
  note?: { moyenne: number | null; avis: number };
}

interface Piece {
  id: string;
  type: string;
  libelle: string;
  url: string;
  statut: string;
  noteExamen: string | null;
  /** Nouvelle version déposée alors que l'ancienne est encore en vigueur. */
  renouvellement?: boolean;
  dateExpiration: string | null;
}

interface Dossier {
  id: string;
  nomComplet: string;
  email: string | null;
  telephone: string | null;
  region: string | null;
  numeroEntreprise: string | null;
  numeroTva: string | null;
  raisonSociale: string | null;
  numeroLicence: string | null;
  vehiculeMarque: string | null;
  vehiculeModele: string | null;
  vehiculePlaque: string | null;
  statut: string;
  motifStatut: string | null;
  soumisLe: string | null;
  valideLe: string | null;
  piecesExigees: { type: string; libelle: string }[];
  piecesAValider: string[];
  dossierValidable: boolean;
  documents: Piece[];
}

const COULEURS: Record<string, string> = {
  BROUILLON: 'bg-gray-700 text-gray-300',
  SOUMIS: 'bg-amber-500/20 text-amber-300',
  VALIDE: 'bg-green-500/20 text-green-300',
  REFUSE: 'bg-red-500/20 text-red-300',
  SUSPENDU: 'bg-red-500/20 text-red-300',
};

const COULEURS_PIECE: Record<string, string> = {
  APPROVED: 'text-green-400',
  REJECTED: 'text-red-400',
  EXPIRED: 'text-red-400',
  PENDING: 'text-amber-300',
};

const jeton = () => localStorage.getItem('accessToken');
const date = (valeur: string | null) => (valeur ? new Date(valeur).toLocaleDateString('fr-FR') : '—');

export function FileChauffeurs({ idInitial }: { idInitial?: string }) {
  const t = useTranslations('superownerChauffeurs');

  const [chauffeurs, setChauffeurs] = useState<LigneChauffeur[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});
  const [filtre, setFiltre] = useState<string>(idInitial ? 'ALL' : 'SOUMIS');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [motif, setMotif] = useState('');
  // Le motif de refus en cours de saisie, par pièce.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [apercu, setApercu] = useState<Piece | null>(null);

  const lireDossier = useCallback(async (id: string) => {
    const reponse = await fetch(`${BASE}/${id}`, { headers: { Authorization: `Bearer ${jeton()}` } });
    if (!reponse.ok) throw new Error(t('loadError'));
    return (await reponse.json()).data as Dossier;
  }, [t]);

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) {
      setChargement(true);
      setErreur('');
    }
    try {
      const reponse = await fetch(`${BASE}?statut=${filtre}&limit=100`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });
      if (!reponse.ok) throw new Error(t('loadError'));
      const lu = await reponse.json();
      setChauffeurs(lu.data || []);
      setComptes(lu.counts || {});
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setChargement(false);
    }
  }, [filtre, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Arrivé depuis une notification (« Nouveau dossier chauffeur ») : le
  // dossier s'ouvre directement.
  useEffectChargement(() => {
    if (!idInitial) return;
    lireDossier(idInitial)
      .then(setDossier)
      .catch((err) => setErreur(err instanceof Error ? err.message : t('loadError')));
  }, [idInitial, lireDossier, t]);

  // Un dossier soumis, une décision d'un collègue : la file et le dossier
  // ouvert suivent.
  const dossierOuvert = useDerniereValeur<string | null>(dossier?.id ?? null);
  useDonneesModifiees('zupdrive', async () => {
    charger(true);
    const id = dossierOuvert.current;
    if (!id) return;
    try {
      const lu = await lireDossier(id);
      if (dossierOuvert.current === id) setDossier(lu);
    } catch {
      // Le dossier affiché reste celui d'avant ; la relecture suivante corrigera.
    }
  });

  const ouvrir = async (id: string) => {
    if (dossier?.id === id) {
      setDossier(null);
      return;
    }
    setMotif('');
    setNotes({});
    try {
      setDossier(await lireDossier(id));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('loadError'));
    }
  };

  /** Un geste sur le dossier ouvert, puis relecture de l'état réel. */
  const agir = async (chemin: string, methode: 'POST' | 'PATCH', corps?: unknown): Promise<boolean> => {
    if (!dossier) return false;
    setErreur('');
    setEnvoi(true);
    try {
      const reponse = await fetch(`${BASE}/${dossier.id}${chemin}`, {
        method: methode,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton()}` },
        body: JSON.stringify(corps ?? {}),
      });
      const lu = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        setErreur(lu?.error || t('actionFailed'));
        return false;
      }
      setDossier(await lireDossier(dossier.id));
      await charger(true);
      return true;
    } catch {
      setErreur(t('connectionError'));
      return false;
    } finally {
      setEnvoi(false);
    }
  };

  const examiner = async (piece: Piece, approuve: boolean) => {
    const note = notes[piece.id]?.trim();
    if (!approuve && !note) {
      setErreur(t('reasonRequired'));
      return;
    }
    if (await agir(`/documents/${piece.id}`, 'PATCH', approuve ? { approuve } : { approuve, note })) {
      setNotes(({ [piece.id]: _, ...reste }) => reste);
    }
  };

  const decider = async (action: 'approve' | 'reject' | 'suspend' | 'reactivate') => {
    const avecMotif = action === 'reject' || action === 'suspend';
    if (avecMotif && motif.trim().length < 3) {
      setErreur(t('reasonRequired'));
      return;
    }
    if (await agir(`/${action}`, 'POST', avecMotif ? { motif: motif.trim() } : undefined)) setMotif('');
  };

  return (
    <div className="space-y-6">
      {apercu && (
        <DocumentPreviewModal documentUrl={apercu.url} libelle={apercu.libelle} onClose={() => setApercu(null)} />
      )}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
          <Car className="h-8 w-8" />
          {t('title')}
        </h1>
        <p className="mt-2 text-gray-400">{t('subtitle')}</p>
      </div>

      {erreur && (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-900/20 p-4 text-red-400">
          {erreur}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filter')}>
        {STATUTS.map((statut) => (
          <button
            key={statut}
            onClick={() => setFiltre(statut)}
            className={`rounded px-4 py-2 text-sm font-medium transition ${
              filtre === statut ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t(`status.${statut}`)}
            {comptes[statut] !== undefined && <span className="ml-2 text-xs opacity-75">{comptes[statut]}</span>}
          </button>
        ))}
      </div>

      {chargement ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
        </div>
      ) : chauffeurs.length === 0 && !dossier ? (
        <div className="rounded-lg bg-gray-800/50 py-12 text-center">
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Un dossier ouvert depuis une notification, hors du filtre courant. */}
          {dossier && !chauffeurs.some((c) => c.id === dossier.id) && (
            ficheDossier()
          )}
          {chauffeurs.map((chauffeur) => (
            <div key={chauffeur.id} className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
              <button
                onClick={() => ouvrir(chauffeur.id)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-gray-700/50"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-white">{chauffeur.nomComplet}</h3>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${COULEURS[chauffeur.statut] || COULEURS.BROUILLON}`}>
                      {t(`status.${chauffeur.statut}`)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">
                    {chauffeur.email}
                    {chauffeur.telephone ? ` · ${chauffeur.telephone}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    {chauffeur.region && <span>{t(`region.${chauffeur.region}`)}</span>}
                    {chauffeur.vehiculePlaque && <span>{chauffeur.vehiculePlaque}</span>}
                    <span>{t('piecesCount', { validees: chauffeur.piecesValidees, exigees: chauffeur.piecesExigees })}</span>
                    {chauffeur.soumisLe && <span>{t('submittedOn', { date: date(chauffeur.soumisLe) })}</span>}
                    {chauffeur.statut === 'VALIDE' && (
                      <span>
                        {chauffeur.note?.moyenne != null
                          ? t('rating', { moyenne: chauffeur.note.moyenne.toLocaleString('fr-FR'), avis: chauffeur.note.avis })
                          : t('neverRated')}
                      </span>
                    )}
                  </div>
                  {chauffeur.motifStatut && <p className="mt-2 text-xs text-red-300">{chauffeur.motifStatut}</p>}
                </div>
                <span className="shrink-0 text-sm text-gray-400">
                  {dossier?.id === chauffeur.id ? t('collapse') : t('open')}
                </span>
              </button>
              {dossier?.id === chauffeur.id && ficheDossier()}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  function ficheDossier() {
    if (!dossier) return null;
    const exigees = new Set(dossier.piecesExigees.map((p) => p.type));
    const champs: [string, string | null][] = [
      ['email', dossier.email],
      ['telephone', dossier.telephone],
      ['region', dossier.region ? t(`region.${dossier.region}`) : null],
      ['numeroEntreprise', dossier.numeroEntreprise],
      ['numeroTva', dossier.numeroTva],
      ['raisonSociale', dossier.raisonSociale],
      ['numeroLicence', dossier.numeroLicence],
      ['vehicule', [dossier.vehiculeMarque, dossier.vehiculeModele].filter(Boolean).join(' ') || null],
      ['vehiculePlaque', dossier.vehiculePlaque],
      ['soumisLe', dossier.soumisLe ? date(dossier.soumisLe) : null],
      ['valideLe', dossier.valideLe ? date(dossier.valideLe) : null],
    ];
    const manquantes = dossier.piecesExigees.filter((p) => !dossier.documents.some((d) => d.type === p.type));

    return (
      <div className="space-y-5 border-t border-gray-700 p-5" data-dossier={dossier.id}>
        <div>
          <h4 className="mb-2 font-semibold text-white">{dossier.nomComplet}</h4>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {champs.map(([cle, valeur]) => (
              <div key={cle} className="flex gap-2">
                <dt className="text-gray-400">{t(`field.${cle}`)}</dt>
                <dd className="text-white">{valeur || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h4 className="mb-2 font-semibold text-white">{t('documents')}</h4>
          <ul className="space-y-2">
            {dossier.documents.map((piece) => (
              <li key={piece.id} className="rounded bg-gray-700/40 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      {piece.libelle}
                      {!exigees.has(piece.type) && <span className="ml-2 text-xs text-gray-400">{t('optional')}</span>}
                      {piece.renouvellement && <span className="ml-2 text-xs text-blue-300">{t('renewal')}</span>}
                      {dossier.documents.some((autre) => autre.renouvellement && autre.type === piece.type) && (
                        <span className="ml-2 text-xs text-gray-400">{t('currentVersion')}</span>
                      )}
                      <span className={`ml-2 text-xs ${COULEURS_PIECE[piece.statut] || 'text-gray-400'}`}>
                        {t(`documentStatus.${piece.statut}`)}
                      </span>
                    </p>
                    {piece.dateExpiration && (
                      <p className="text-xs text-gray-500">{t('expiresOn', { date: date(piece.dateExpiration) })}</p>
                    )}
                    {piece.noteExamen && <p className="text-xs text-red-300">{piece.noteExamen}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Aperçu dans la page ; l'adresse signée est redemandée à l'ouverture. */}
                    <button
                      type="button"
                      onClick={() => setApercu(piece)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
                    >
                      <Eye size={12} />
                      {t('view')}
                    </button>
                    {/* Une version expirée ne se valide pas : il faut la version à jour. */}
                    {piece.statut !== 'APPROVED' && piece.statut !== 'EXPIRED' && (
                      <button
                        onClick={() => examiner(piece, true)}
                        disabled={envoi}
                        className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500 disabled:opacity-50"
                      >
                        <Check size={12} />
                        {t('approveDocument')}
                      </button>
                    )}
                  </div>
                </div>
                {piece.statut !== 'REJECTED' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={notes[piece.id] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [piece.id]: e.target.value })}
                      placeholder={t('documentReasonPlaceholder')}
                      aria-label={`${t('documentReasonPlaceholder')} — ${piece.libelle}`}
                      className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-white"
                    />
                    <button
                      onClick={() => examiner(piece, false)}
                      disabled={envoi}
                      className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      <X size={12} />
                      {t('rejectDocument')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {manquantes.length > 0 && (
            <p className="mt-2 text-xs text-amber-300">
              {t('missingDocuments', { liste: manquantes.map((p) => p.libelle).join(', ') })}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-gray-700 p-4">
          <h4 className="font-semibold text-white">{t('decision')}</h4>
          {dossier.statut === 'SOUMIS' && !dossier.dossierValidable && (
            <p className="text-xs text-gray-400">{t('approveHint')}</p>
          )}
          {(dossier.statut === 'SOUMIS' || dossier.statut === 'VALIDE') && (
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={dossier.statut === 'SOUMIS' ? t('rejectReasonPlaceholder') : t('suspendReasonPlaceholder')}
              aria-label={t('reasonLabel')}
              rows={2}
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {dossier.statut === 'SOUMIS' && (
              <>
                <button
                  onClick={() => decider('approve')}
                  disabled={envoi || !dossier.dossierValidable}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                >
                  {t('approve')}
                </button>
                <button
                  onClick={() => decider('reject')}
                  disabled={envoi}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {t('reject')}
                </button>
              </>
            )}
            {dossier.statut === 'VALIDE' && (
              <button
                onClick={() => decider('suspend')}
                disabled={envoi}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {t('suspend')}
              </button>
            )}
            {dossier.statut === 'SUSPENDU' && (
              <button
                onClick={() => decider('reactivate')}
                disabled={envoi}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {t('reactivate')}
              </button>
            )}
            {(dossier.statut === 'BROUILLON' || dossier.statut === 'REFUSE') && (
              <p className="text-sm text-gray-400">{t(`waiting.${dossier.statut}`)}</p>
            )}
          </div>
        </div>

        {idInitial && (
          <Link href="/superowner/zupdrive/chauffeurs" className="text-sm text-blue-400 hover:underline">
            {t('backToQueue')}
          </Link>
        )}
      </div>
    );
  }
}
