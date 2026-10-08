'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle, Clock, FileUp, Loader, XCircle } from 'lucide-react';

import { LienPiece } from '@/components/LienPiece';
import { useAuth } from '@/lib/auth-context';
import { signalerErreur } from '@/lib/erreurs';
import { TAILLE_MAX_IMAGE, TAILLE_MAX_PDF, reduireImage } from '@/lib/reduire-image';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Le dossier chauffeur ZupDrive (licence LVC) du compte connecté.
 *
 * Tout se décide côté API (/api/zupdrive/chauffeur/me) : pièces exigées selon
 * la région, contrôle du numéro BCE, états du dossier. La page ne fait
 * qu'afficher ce que l'API répond. Voir docs/zupdrive.md.
 */

const REGIONS = ['BRUXELLES', 'WALLONIE', 'FLANDRE'] as const;
const CHAMPS = [
  'nomComplet',
  'telephone',
  'numeroEntreprise',
  'raisonSociale',
  'numeroLicence',
  'vehiculeMarque',
  'vehiculeModele',
  'vehiculePlaque',
] as const;
/**
 * Chauffeur d'une société : l'entreprise, la licence, la région et le
 * véhicule sont ceux de la société. Il ne renseigne que ce qui le concerne.
 */
const CHAMPS_EN_SOCIETE = ['nomComplet', 'telephone'] as const;

type Champ = (typeof CHAMPS)[number];
type Profil = Record<Champ, string> & { region: string };

interface Piece {
  id: string;
  type: string;
  libelle: string;
  url: string;
  statut: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  noteExamen: string | null;
  dateExpiration: string | null;
}

/** La société pour laquelle il roule (une à la fois). */
interface Societe {
  id: string;
  raisonSociale: string;
  region: string | null;
  statut: string;
}

/** Une société qui l'invite à rouler pour elle. */
interface Invitation {
  id: string;
  createdAt: string;
  societe: Societe;
}

interface Dossier extends Profil {
  statut: 'BROUILLON' | 'SOUMIS' | 'VALIDE' | 'REFUSE' | 'SUSPENDU';
  societe: Societe | null;
  vehicule: { marque: string; modele: string; plaque: string; conforme: boolean } | null;
  motifStatut: string | null;
  /** Suspendu parce qu'une pièce exigée a expiré : il peut la redéposer. */
  suspenduPourExpirationLe: string | null;
  numeroTva: string | null;
  piecesExigees: { type: string; libelle: string }[];
  piecesManquantes: string[];
  champsManquants: string[];
  peutSoumettre: boolean;
  documents: Piece[];
}

const PROFIL_VIDE: Profil = {
  nomComplet: '',
  telephone: '',
  numeroEntreprise: '',
  raisonSociale: '',
  numeroLicence: '',
  vehiculeMarque: '',
  vehiculeModele: '',
  vehiculePlaque: '',
  region: '',
};

const entetes = (): Record<string, string> => {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Appelle l'API du dossier ; lève le message d'erreur de l'API. */
async function appeler<T = Dossier>(chemin: string, init: RequestInit = {}): Promise<T | null> {
  const reponse = await fetch(`${API_URL}/api/zupdrive/chauffeur${chemin}`, {
    ...init,
    headers: { ...entetes(), ...(init.headers || {}) },
  });
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok) throw new Error(corps?.error || corps?.message || `HTTP ${reponse.status}`);
  return corps?.data ?? null;
}

const versProfil = (dossier: Dossier): Profil =>
  Object.fromEntries(
    [...CHAMPS, 'region'].map((champ) => [champ, (dossier as any)[champ] ?? ''])
  ) as Profil;

export default function DossierChauffeurPage() {
  const t = useTranslations('chauffeurDrive');
  const { user, isLoading } = useAuth();

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [profil, setProfil] = useState<Profil>(PROFIL_VIDE);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [erreursPieces, setErreursPieces] = useState<Record<string, string>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const recevoir = (lu: Dossier | null) => {
    setDossier(lu);
    if (lu) setProfil(versProfil(lu));
  };

  const charger = useCallback(async () => {
    try {
      const [lu, recues] = await Promise.all([appeler('/me'), appeler<Invitation[]>('/me/invitations')]);
      recevoir(lu);
      setInvitations(recues || []);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreurConnexion'));
      signalerErreur(err);
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffectChargement(() => {
    if (isLoading || !user) return;
    charger();
  }, [user, isLoading, charger]);

  /** Lance une action, affiche son erreur ou son message de réussite. */
  const agir = async (cle: string, action: () => Promise<Dossier | null | void>, reussite?: string) => {
    setEnvoi(cle);
    setErreur('');
    setMessage('');
    try {
      const lu = await action();
      if (lu) recevoir(lu);
      if (reussite) setMessage(reussite);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreurConnexion'));
    } finally {
      setEnvoi(null);
    }
  };

  /** Accepter rattache à la société ; refuser la retire de la liste. */
  const repondreInvitation = (invitation: Invitation, accepter: boolean) =>
    agir(
      `invitation-${invitation.id}`,
      async () => {
        const lu = accepter
          ? await appeler(`/me/invitations/${invitation.id}/accepter`, { method: 'POST' })
          : null;
        if (!accepter) await appeler(`/me/invitations/${invitation.id}/refuser`, { method: 'POST' });
        setInvitations((await appeler<Invitation[]>('/me/invitations')) || []);
        return lu;
      },
      accepter ? t('societe.rejointe', { societe: invitation.societe.raisonSociale }) : t('societe.invitationRefusee')
    );

  const quitterSociete = () => {
    if (!dossier?.societe || !window.confirm(t('societe.confirmerDepart', { societe: dossier.societe.raisonSociale }))) return;
    agir('quitter', () => appeler('/me/quitter-societe', { method: 'POST' }), t('societe.quittee'));
  };

  const enregistrerProfil = (e: React.FormEvent) => {
    e.preventDefault();
    // Chauffeur de société : seuls ses propres champs partent, le reste est
    // celui de la société.
    const champsEnvoyes: string[] = dossier?.societe ? [...CHAMPS_EN_SOCIETE] : [...CHAMPS, 'region'];
    const corps = Object.fromEntries(
      Object.entries(profil)
        .filter(([champ]) => champsEnvoyes.includes(champ))
        .map(([champ, valeur]) => [champ, valeur.trim() ? valeur.trim() : null])
    );
    if (!corps.nomComplet) delete corps.nomComplet;
    agir(
      'profil',
      () =>
        appeler('/me', {
          method: dossier ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        }),
      t('profilEnregistre')
    );
  };

  /**
   * Dépose une pièce. Une photo de téléphone dépasse souvent la limite du
   * serveur (2 Mo) : elle est réduite avant l'envoi. L'erreur s'affiche sous
   * la pièce concernée, là où le chauffeur regarde, et pas en haut de page.
   */
  const deposer = async (type: string, fichier: File, dateExpiration: string) => {
    const cle = `piece-${type}`;
    setEnvoi(cle);
    setErreur('');
    setMessage('');
    setErreursPieces(({ [type]: _ancienne, ...autres }) => autres);
    const echouer = (texte: string) => setErreursPieces((avant) => ({ ...avant, [type]: texte }));
    try {
      const aEnvoyer = await reduireImage(fichier);
      const limite = aEnvoyer.type === 'application/pdf' ? TAILLE_MAX_PDF : TAILLE_MAX_IMAGE;
      if (aEnvoyer.size > limite) {
        echouer(t('fichierTropLourd', { mo: limite / (1024 * 1024) }));
        return;
      }
      const donnees = new FormData();
      donnees.append('type', type);
      donnees.append(
        'file',
        aEnvoyer,
        aEnvoyer === fichier ? fichier.name : `${fichier.name.replace(/\.[^.]+$/, '')}.jpg`
      );
      if (dateExpiration) donnees.append('dateExpiration', dateExpiration);
      const reponse = await fetch(`${API_URL}/api/zupdrive/chauffeur/me/documents`, {
        method: 'POST',
        headers: entetes(),
        body: donnees,
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        echouer(corps?.error || corps?.message || `HTTP ${reponse.status}`);
        return;
      }
      const lu = await appeler('/me');
      if (lu) recevoir(lu);
      setMessage(t('pieceDeposee'));
    } catch (err) {
      echouer(err instanceof Error ? err.message : t('erreurConnexion'));
    } finally {
      setEnvoi(null);
    }
  };

  if (!isLoading && !user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-white">{t('titre')}</h1>
        <p className="mt-3 text-slate-300">{t('connexionRequise')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login" className="rounded-full bg-accent px-5 py-2 text-white hover:bg-accent-hover">
            {t('seConnecter')}
          </Link>
          <Link href="/signup" className="rounded-full border border-slate-300 px-5 py-2 text-white hover:border-slate-400">
            {t('creerCompte')}
          </Link>
        </div>
      </main>
    );
  }

  if (isLoading || chargement) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }

  const modifiable = !dossier || dossier.statut === 'BROUILLON' || dossier.statut === 'REFUSE';
  const depotPossible =
    !!dossier &&
    (modifiable || dossier.statut === 'VALIDE' || (dossier.statut === 'SUSPENDU' && !!dossier.suspenduPourExpirationLe));
  // La version la plus récente de chaque pièce (les documents arrivent du plus
  // ancien au plus récent), et celle encore en vigueur pendant un renouvellement.
  const pieces = new Map((dossier?.documents || []).map((piece) => [piece.type, piece]));
  const enVigueur = new Map(
    (dossier?.documents || [])
      .filter((piece) => piece.statut === 'APPROVED' || piece.statut === 'EXPIRED')
      .map((piece) => [piece.type, piece]),
  );
  // Les pièces exigées, puis les facultatives déjà déposées ou proposées
  // (l'identité des associés est une pièce de la société, pas la sienne).
  const aDeposer = [
    ...(dossier?.piecesExigees || []),
    ...(dossier && !dossier.societe && !dossier.piecesExigees.some((p) => p.type === 'actionnaires')
      ? [{ type: 'actionnaires', libelle: pieces.get('actionnaires')?.libelle || t('pieceActionnaires') }]
      : []),
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {/* Sur le fond sombre du site : en clair, sinon le titre ne se lit pas. */}
      <h1 className="text-3xl font-bold text-white">{t('titre')}</h1>
      <p className="mt-2 text-slate-300">{t('intro')}</p>

      {dossier && <BandeauStatut dossier={dossier} />}
      {dossier?.statut === 'VALIDE' && (
        <Link
          href="/chauffeur/courses"
          className="mt-4 inline-block rounded-full bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-hover"
        >
          {t('versCourses')}
        </Link>
      )}

      {erreur && (
        <div role="alert" className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle size={20} className="shrink-0" />
          <p>{erreur}</p>
        </div>
      )}
      {message && (
        <div role="status" className="mt-6 flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
          <CheckCircle size={20} className="shrink-0" />
          <p>{message}</p>
        </div>
      )}

      {invitations.length > 0 && (
        <section className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-6" aria-labelledby="titre-invitations">
          <h2 id="titre-invitations" className="text-lg font-semibold text-slate-900">
            {t('societe.invitations')}
          </h2>
          <ul className="mt-3 space-y-3">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-800">
                  {t('societe.invite', { societe: invitation.societe.raisonSociale })}
                  {invitation.societe.region && (
                    <span className="ml-1 text-slate-500">({t(`region.${invitation.societe.region}`)})</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={envoi !== null || !!dossier?.societe}
                    onClick={() => repondreInvitation(invitation, true)}
                    className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    {t('societe.accepter')}
                  </button>
                  <button
                    type="button"
                    disabled={envoi !== null}
                    onClick={() => repondreInvitation(invitation, false)}
                    className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-800 hover:border-slate-400 disabled:opacity-60"
                  >
                    {t('societe.refuser')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {dossier?.societe && <p className="mt-3 text-xs text-slate-600">{t('societe.uneALaFois')}</p>}
        </section>
      )}

      {dossier?.societe && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6" aria-labelledby="titre-societe">
          <h2 id="titre-societe" className="text-lg font-semibold text-slate-900">
            {t('societe.titre', { societe: dossier.societe.raisonSociale })}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t('societe.explication')}</p>
          {dossier.societe.statut !== 'VALIDE' && (
            <p className="mt-2 text-sm text-amber-700">
              {dossier.societe.statut === 'SUSPENDU' ? t('societe.suspendue') : t('societe.enAttente')}
            </p>
          )}
          <p className="mt-3 text-sm text-slate-800">
            {dossier.vehicule
              ? t('societe.vehicule', {
                  vehicule: `${dossier.vehicule.marque} ${dossier.vehicule.modele}`,
                  plaque: dossier.vehicule.plaque,
                })
              : t('societe.sansVehicule')}
            {dossier.vehicule && !dossier.vehicule.conforme && (
              <span className="ml-1 text-amber-700">{t('societe.vehiculeNonConforme')}</span>
            )}
          </p>
          <button
            type="button"
            disabled={envoi !== null}
            onClick={quitterSociete}
            className="mt-4 rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-800 hover:border-slate-400 disabled:opacity-60"
          >
            {t('societe.quitter')}
          </button>
        </section>
      )}

      <form onSubmit={enregistrerProfil} className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {dossier?.societe ? t('sectionProfilSociete') : t('sectionProfil')}
        </h2>
        <fieldset disabled={!modifiable} className="grid gap-4 sm:grid-cols-2">
          {(dossier?.societe ? CHAMPS_EN_SOCIETE : CHAMPS).map((champ) => (
            <label key={champ} className="block text-sm">
              <span className="font-medium text-slate-700">{t(`champ.${champ}`)}</span>
              <input
                name={champ}
                value={profil[champ]}
                onChange={(e) => setProfil({ ...profil, [champ]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
          ))}
          {!dossier?.societe && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t('champ.region')}</span>
            <select
              name="region"
              value={profil.region}
              onChange={(e) => setProfil({ ...profil, region: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="">{t('choisirRegion')}</option>
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {t(`region.${region}`)}
                </option>
              ))}
            </select>
          </label>
          )}
        </fieldset>
        {dossier?.numeroTva && !dossier.societe && (
          <p className="text-sm text-slate-600">{t('numeroTva', { tva: dossier.numeroTva })}</p>
        )}
        {modifiable && (
          <button
            type="submit"
            disabled={envoi !== null}
            className="rounded-full bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {envoi === 'profil' ? t('enregistrement') : dossier ? t('enregistrer') : t('commencer')}
          </button>
        )}
      </form>

      {dossier && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">{t('sectionPieces')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('formatsAcceptes')}</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {aDeposer.map(({ type, libelle }) => (
              <LignePiece
                key={type}
                libelle={libelle}
                facultative={!dossier.piecesExigees.some((p) => p.type === type)}
                piece={pieces.get(type)}
                versionEnVigueur={pieces.get(type) !== enVigueur.get(type) ? enVigueur.get(type) : undefined}
                depotPossible={depotPossible}
                enCours={envoi === `piece-${type}`}
                erreur={erreursPieces[type]}
                onDeposer={(fichier, date) => deposer(type, fichier, date)}
              />
            ))}
          </ul>
        </section>
      )}

      {dossier && modifiable && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          {!dossier.peutSoumettre && (
            <p className="mb-4 text-sm text-slate-600">
              {t('resteAFaire', {
                liste: [
                  ...dossier.champsManquants,
                  ...dossier.piecesManquantes.map(
                    (type) => dossier.piecesExigees.find((p) => p.type === type)?.libelle || type
                  ),
                ].join(', '),
              })}
            </p>
          )}
          <button
            type="button"
            disabled={!dossier.peutSoumettre || envoi !== null}
            onClick={() =>
              agir('soumettre', () => appeler('/me/submit', { method: 'POST' }), t('dossierSoumis'))
            }
            className="rounded-full bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {envoi === 'soumettre' ? t('envoi') : t('soumettre')}
          </button>
        </section>
      )}
    </main>
  );
}

function BandeauStatut({ dossier }: { dossier: Dossier }) {
  const t = useTranslations('chauffeurDrive');
  const styles: Record<Dossier['statut'], string> = {
    BROUILLON: 'border-slate-200 bg-slate-50 text-slate-700',
    SOUMIS: 'border-blue-200 bg-blue-50 text-blue-800',
    VALIDE: 'border-green-200 bg-green-50 text-green-800',
    REFUSE: 'border-amber-200 bg-amber-50 text-amber-800',
    SUSPENDU: 'border-red-200 bg-red-50 text-red-800',
  };
  return (
    <div className={`mt-6 rounded-lg border p-4 ${styles[dossier.statut]}`}>
      <p className="font-semibold">{t(`statut.${dossier.statut}`)}</p>
      <p className="mt-1 text-sm">
        {dossier.statut === 'SUSPENDU' && dossier.suspenduPourExpirationLe
          ? t('statutAide.SUSPENDU_EXPIRATION')
          : t(`statutAide.${dossier.statut}`)}
      </p>
      {dossier.motifStatut && <p className="mt-2 text-sm">{t('motif', { motif: dossier.motifStatut })}</p>}
    </div>
  );
}

function LignePiece({
  libelle,
  facultative,
  piece,
  versionEnVigueur,
  depotPossible,
  enCours,
  erreur,
  onDeposer,
}: {
  libelle: string;
  facultative: boolean;
  piece?: Piece;
  /** Pendant un renouvellement : l'ancienne version, toujours valable jusqu'à sa date. */
  versionEnVigueur?: Piece;
  depotPossible: boolean;
  enCours: boolean;
  /** Échec du dernier dépôt de cette pièce. */
  erreur?: string;
  onDeposer: (fichier: File, dateExpiration: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('chauffeurDrive');
  const [dateExpiration, setDateExpiration] = useState('');
  const icones = {
    PENDING: <Clock size={18} className="text-blue-600" />,
    APPROVED: <CheckCircle size={18} className="text-green-600" />,
    REJECTED: <XCircle size={18} className="text-red-600" />,
    EXPIRED: <XCircle size={18} className="text-red-600" />,
  };

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">
          {libelle}
          {facultative && <span className="ml-2 text-xs text-slate-500">{t('facultative')}</span>}
        </p>
        {versionEnVigueur && (
          <p className="mt-1 text-sm text-slate-600">
            {versionEnVigueur.statut === 'EXPIRED'
              ? t('versionEnVigueurExpiree')
              : versionEnVigueur.dateExpiration
                ? t('versionEnVigueurJusquau', {
                    date: new Date(versionEnVigueur.dateExpiration).toLocaleDateString(locale),
                  })
                : t('versionEnVigueur')}
          </p>
        )}
        {piece && versionEnVigueur && <p className="mt-1 text-xs font-medium text-slate-500">{t('nouvelleVersion')}</p>}
        {piece ? (
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            {icones[piece.statut]}
            {t(`statutPiece.${piece.statut}`)}
            <LienPiece adresse={piece.url} className="underline">
              {t('voir')}
            </LienPiece>
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">{t('aDeposer')}</p>
        )}
        {piece?.noteExamen && piece.statut === 'REJECTED' && (
          <p className="mt-1 text-sm text-red-700">{t('motif', { motif: piece.noteExamen })}</p>
        )}
        {erreur && (
          <p role="alert" className="mt-1 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" />
            {erreur}
          </p>
        )}
      </div>
      {depotPossible && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-600">
            {t('dateExpiration')}
            <input
              type="date"
              value={dateExpiration}
              onChange={(e) => setDateExpiration(e.target.value)}
              className="ml-2 rounded-sm border border-slate-300 bg-white px-2 py-1 text-slate-900"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:border-slate-400">
            {enCours ? <Loader size={16} className="animate-spin" /> : <FileUp size={16} />}
            {piece ? t('remplacer') : t('deposer')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              disabled={enCours}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) onDeposer(fichier, dateExpiration);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
    </li>
  );
}
