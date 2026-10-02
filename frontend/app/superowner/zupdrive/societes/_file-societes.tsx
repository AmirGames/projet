'use client';

/**
 * ZupDrive — la file de validation des sociétés (taxi, VTC) : leur dossier,
 * leurs véhicules et leurs pièces, leurs chauffeurs.
 *
 * Tout se décide côté API (/api/zupdrive/admin/societes), gardée par la
 * section « chauffeurs » de la plateforme ZupDrive et journalisée : l'écran
 * relit l'état réel après chaque geste. La conformité d'un véhicule est
 * calculée par le serveur, jamais cochée ici.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { useDerniereValeur } from '@/lib/use-derniere-valeur';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { LignePieceAExaminer, type PieceAExaminer } from '../_ligne-piece';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const BASE = `${API_URL}/api/zupdrive/admin/societes`;

const STATUTS = ['SOUMIS', 'VALIDE', 'REFUSE', 'SUSPENDU', 'BROUILLON', 'ALL'] as const;

interface LigneSociete {
  id: string;
  raisonSociale: string;
  numeroEntreprise: string | null;
  region: string | null;
  telephone: string | null;
  email: string;
  statut: string;
  motifStatut: string | null;
  soumisLe: string | null;
  chauffeurs: number;
  vehicules: number;
  vehiculesConformes: number;
}

interface Vehicule {
  id: string;
  marque: string;
  modele: string;
  plaque: string;
  numeroLicence: string | null;
  conforme: boolean;
  chauffeur: { id: string; nomComplet: string } | null;
  documents: PieceAExaminer[];
  piecesExigees: { type: string; libelle: string }[];
  piecesManquantes: string[];
}

interface Dossier {
  id: string;
  raisonSociale: string;
  numeroEntreprise: string | null;
  numeroTva: string | null;
  region: string | null;
  telephone: string | null;
  gerant: { email: string; name: string | null };
  statut: string;
  motifStatut: string | null;
  soumisLe: string | null;
  valideLe: string | null;
  piecesExigees: { type: string; libelle: string }[];
  piecesManquantes: string[];
  dossierValidable: boolean;
  documents: PieceAExaminer[];
  vehicules: Vehicule[];
  chauffeurs: { id: string; nomComplet: string; email: string; statut: string; enLigne: boolean; vehiculeId: string | null }[];
  invitations: { id: string; email: string; createdAt: string }[];
}

const COULEURS: Record<string, string> = {
  BROUILLON: 'bg-gray-100 text-gray-700',
  SOUMIS: 'bg-amber-100 text-amber-700',
  VALIDE: 'bg-green-100 text-green-700',
  REFUSE: 'bg-red-100 text-red-700',
  SUSPENDU: 'bg-red-100 text-red-700',
};

const jeton = () => localStorage.getItem('accessToken');
const date = (valeur: string | null) => (valeur ? new Date(valeur).toLocaleDateString('fr-FR') : '—');

/** Une nouvelle version de ce type attend l'examen : celle-ci reste en vigueur d'ici là. */
const enVigueur = (pieces: PieceAExaminer[], piece: PieceAExaminer) =>
  pieces.some((autre) => autre.renouvellement && autre.type === piece.type);

export function FileSocietes({ idInitial }: { idInitial?: string }) {
  const t = useTranslations('superownerSocietes');
  const tC = useTranslations('superownerChauffeurs');

  const [societes, setSocietes] = useState<LigneSociete[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});
  const [filtre, setFiltre] = useState<string>(idInitial ? 'ALL' : 'SOUMIS');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [motif, setMotif] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [apercu, setApercu] = useState<PieceAExaminer | null>(null);

  const lireDossier = useCallback(
    async (id: string) => {
      const reponse = await fetch(`${BASE}/${id}`, { headers: { Authorization: `Bearer ${jeton()}` } });
      if (!reponse.ok) throw new Error(t('loadError'));
      return (await reponse.json()).data as Dossier;
    },
    [t]
  );

  const charger = useCallback(
    async (silencieux = false) => {
      if (!silencieux) {
        setChargement(true);
        setErreur('');
      }
      try {
        const reponse = await fetch(`${BASE}?statut=${filtre}&limit=100`, { headers: { Authorization: `Bearer ${jeton()}` } });
        if (!reponse.ok) throw new Error(t('loadError'));
        const lu = await reponse.json();
        setSocietes(lu.data || []);
        setComptes(lu.counts || {});
      } catch (err) {
        setErreur(err instanceof Error ? err.message : t('loadError'));
      } finally {
        setChargement(false);
      }
    },
    [filtre, t]
  );

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Arrivé depuis une notification (« Nouvelle société ZupDrive ») : le
  // dossier s'ouvre directement.
  useEffectChargement(() => {
    if (!idInitial) return;
    lireDossier(idInitial)
      .then(setDossier)
      .catch((err) => setErreur(err instanceof Error ? err.message : t('loadError')));
  }, [idInitial, lireDossier, t]);

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
        setErreur(lu?.error || tC('actionFailed'));
        return false;
      }
      setDossier(await lireDossier(dossier.id));
      await charger(true);
      return true;
    } catch {
      setErreur(tC('connectionError'));
      return false;
    } finally {
      setEnvoi(false);
    }
  };

  const examiner = async (piece: PieceAExaminer, approuve: boolean) => {
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

  const lignePiece = (piece: PieceAExaminer, pieces: PieceAExaminer[], exigees: Set<string>) => (
    <LignePieceAExaminer
      key={piece.id}
      piece={piece}
      facultative={!exigees.has(piece.type)}
      versionEnVigueur={enVigueur(pieces, piece)}
      note={notes[piece.id] ?? ''}
      envoi={envoi}
      onNote={(note) => setNotes({ ...notes, [piece.id]: note })}
      onExaminer={(approuve) => examiner(piece, approuve)}
      onVoir={() => setApercu(piece)}
    />
  );

  return (
    <div className="space-y-6">
      {apercu && <DocumentPreviewModal documentUrl={apercu.url} libelle={apercu.libelle} onClose={() => setApercu(null)} />}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Building2 className="h-8 w-8" />
          {t('title')}
        </h1>
        <p className="mt-2 text-gray-500">{t('subtitle')}</p>
      </div>

      {erreur && (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-50 p-4 text-red-600">
          {erreur}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filter')}>
        {STATUTS.map((statut) => (
          <button
            key={statut}
            onClick={() => setFiltre(statut)}
            className={`rounded px-4 py-2 text-sm font-medium transition ${
              filtre === statut ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tC(`status.${statut}`)}
            {comptes[statut] !== undefined && <span className="ml-2 text-xs opacity-75">{comptes[statut]}</span>}
          </button>
        ))}
      </div>

      {chargement ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
        </div>
      ) : societes.length === 0 && !dossier ? (
        <div className="rounded-lg bg-gray-50 py-12 text-center">
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dossier && !societes.some((s) => s.id === dossier.id) && fiche()}
          {societes.map((societe) => (
            <div key={societe.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => ouvrir(societe.id)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{societe.raisonSociale}</h3>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${COULEURS[societe.statut] || COULEURS.BROUILLON}`}>
                      {tC(`status.${societe.statut}`)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {societe.email}
                    {societe.telephone ? ` · ${societe.telephone}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    {societe.region && <span>{tC(`region.${societe.region}`)}</span>}
                    <span>{t('vehiclesCount', { conformes: societe.vehiculesConformes, total: societe.vehicules })}</span>
                    <span>{t('driversCount', { n: societe.chauffeurs })}</span>
                    {societe.soumisLe && <span>{tC('submittedOn', { date: date(societe.soumisLe) })}</span>}
                  </div>
                  {societe.motifStatut && <p className="mt-2 text-xs text-red-700">{societe.motifStatut}</p>}
                </div>
                <span className="shrink-0 text-sm text-gray-500">{dossier?.id === societe.id ? tC('collapse') : tC('open')}</span>
              </button>
              {dossier?.id === societe.id && fiche()}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  function fiche() {
    if (!dossier) return null;
    const exigeesSociete = new Set(dossier.piecesExigees.map((p) => p.type));
    const champs: [string, string | null][] = [
      ['gerant', dossier.gerant.name ? `${dossier.gerant.name} · ${dossier.gerant.email}` : dossier.gerant.email],
      ['telephone', dossier.telephone],
      ['region', dossier.region ? tC(`region.${dossier.region}`) : null],
      ['numeroEntreprise', dossier.numeroEntreprise],
      ['numeroTva', dossier.numeroTva],
      ['soumisLe', dossier.soumisLe ? date(dossier.soumisLe) : null],
      ['valideLe', dossier.valideLe ? date(dossier.valideLe) : null],
    ];
    const manquantes = dossier.piecesExigees.filter((p) => dossier.piecesManquantes.includes(p.type));

    return (
      <div className="space-y-5 border-t border-gray-200 p-5" data-societe={dossier.id}>
        <div>
          <h4 className="mb-2 font-semibold text-gray-900">{dossier.raisonSociale}</h4>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {champs.map(([cle, valeur]) => (
              <div key={cle} className="flex gap-2">
                <dt className="text-gray-500">{t(`field.${cle}`)}</dt>
                <dd className="text-gray-900">{valeur || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h4 className="mb-2 font-semibold text-gray-900">{t('companyDocuments')}</h4>
          <ul className="space-y-2">{dossier.documents.map((piece) => lignePiece(piece, dossier.documents, exigeesSociete))}</ul>
          {manquantes.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">{tC('missingDocuments', { liste: manquantes.map((p) => p.libelle).join(', ') })}</p>
          )}
        </div>

        <div>
          <h4 className="mb-2 font-semibold text-gray-900">{t('vehicles')}</h4>
          {dossier.vehicules.length === 0 ? (
            <p className="text-sm text-gray-500">{t('noVehicle')}</p>
          ) : (
            <div className="space-y-3">
              {dossier.vehicules.map((vehicule) => {
                const exigees = new Set(vehicule.piecesExigees.map((p) => p.type));
                const manque = vehicule.piecesExigees.filter((p) => vehicule.piecesManquantes.includes(p.type));
                return (
                  <div key={vehicule.id} className="rounded-lg border border-gray-200 p-3" data-vehicule={vehicule.plaque}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {vehicule.marque} {vehicule.modele} · {vehicule.plaque}
                        {vehicule.numeroLicence && <span className="ml-2 text-xs text-gray-500">{t('licence', { numero: vehicule.numeroLicence })}</span>}
                      </p>
                      <span
                        className={`flex items-center gap-1 text-xs font-semibold ${vehicule.conforme ? 'text-green-600' : 'text-amber-700'}`}
                      >
                        {vehicule.conforme ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {vehicule.conforme ? t('conforme') : t('nonConforme')}
                      </span>
                    </div>
                    {vehicule.chauffeur && <p className="mb-2 text-xs text-gray-500">{t('drivenBy', { nom: vehicule.chauffeur.nomComplet })}</p>}
                    <ul className="space-y-2">{vehicule.documents.map((piece) => lignePiece(piece, vehicule.documents, exigees))}</ul>
                    {manque.length > 0 && (
                      <p className="mt-2 text-xs text-amber-700">{tC('missingDocuments', { liste: manque.map((p) => p.libelle).join(', ') })}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 font-semibold text-gray-900">{t('drivers')}</h4>
          {dossier.chauffeurs.length === 0 ? (
            <p className="text-sm text-gray-500">{t('noDriver')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {dossier.chauffeurs.map((chauffeur) => (
                <li key={chauffeur.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/superowner/zupdrive/chauffeurs/${chauffeur.id}`} className="text-blue-600 hover:underline">
                    {chauffeur.nomComplet}
                  </Link>
                  <span className="text-gray-500">{chauffeur.email}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${COULEURS[chauffeur.statut] || COULEURS.BROUILLON}`}>
                    {tC(`status.${chauffeur.statut}`)}
                  </span>
                  {chauffeur.enLigne && <span className="text-xs text-green-600">{t('online')}</span>}
                </li>
              ))}
            </ul>
          )}
          {dossier.invitations.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {t('pendingInvitations', { liste: dossier.invitations.map((i) => i.email).join(', ') })}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-900">{tC('decision')}</h4>
          {dossier.statut === 'SOUMIS' && !dossier.dossierValidable && <p className="text-xs text-gray-500">{tC('approveHint')}</p>}
          {(dossier.statut === 'SOUMIS' || dossier.statut === 'VALIDE') && (
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={dossier.statut === 'SOUMIS' ? t('rejectReasonPlaceholder') : t('suspendReasonPlaceholder')}
              aria-label={tC('reasonLabel')}
              rows={2}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
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
                className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {t('reactivate')}
              </button>
            )}
            {(dossier.statut === 'BROUILLON' || dossier.statut === 'REFUSE') && (
              <p className="text-sm text-gray-500">{t(`waiting.${dossier.statut}`)}</p>
            )}
          </div>
        </div>

        {idInitial && (
          <Link href="/superowner/zupdrive/societes" className="text-sm text-blue-600 hover:underline">
            {tC('backToQueue')}
          </Link>
        )}
      </div>
    );
  }
}
