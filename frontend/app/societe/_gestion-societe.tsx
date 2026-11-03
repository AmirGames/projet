'use client';

import Link from 'next/link';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import AcceptationConditions from '@/components/AcceptationConditions';
import { useAuth } from '@/lib/auth-context';
import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { erreurDeTaille, reduireImage } from '@/lib/reduire-image';
import { LienPiece } from '@/components/LienPiece';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Statut = 'BROUILLON' | 'SOUMIS' | 'VALIDE' | 'REFUSE' | 'SUSPENDU';
type Piece = {
  id: string;
  type: string;
  libelle: string;
  url: string;
  statut: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  noteExamen: string | null;
  dateExpiration: string | null;
};
type DocumentAttendu = { type: string; libelle: string };
type Vehicule = {
  id: string;
  marque: string;
  modele: string;
  plaque: string;
  numeroLicence: string | null;
  placesPassagers: number;
  conforme: boolean;
  documents: Piece[];
  piecesExigees: DocumentAttendu[];
  piecesManquantes: string[];
  piecesAValider: string[];
  chauffeur: { id: string; nomComplet: string } | null;
};
type Chauffeur = {
  id: string;
  nomComplet: string;
  email: string;
  statut: string;
  enLigne: boolean;
  vehiculeId: string | null;
};
type Invitation = { id: string; email: string; createdAt: string };
type Dossier = {
  id: string;
  raisonSociale: string;
  numeroEntreprise: string | null;
  numeroTva: string | null;
  region: string | null;
  telephone: string | null;
  statut: Statut;
  motifStatut: string | null;
  documents: Piece[];
  piecesExigees: DocumentAttendu[];
  piecesManquantes: string[];
  piecesAValider: string[];
  champsManquants: string[];
  peutSoumettre: boolean;
  dossierValidable: boolean;
  vehicules: Vehicule[];
  chauffeurs: Chauffeur[];
  invitations: Invitation[];
};
type Course = {
  id: string;
  statut: string;
  departAdresse: string;
  arriveeAdresse: string;
  prixCentimes: number;
  devise: string;
  createdAt: string;
  chauffeur: { nomComplet: string } | null;
  vehicule: { plaque: string } | null;
};

async function appeler<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const token = jetonAcces();
  const reponse = await fetch(`${API_URL}/api/zupdrive/societe${chemin}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const erreur = typeof corps?.error === 'string' ? corps.error : corps?.error?.message;
    throw new Error(erreur || corps?.message || `Erreur HTTP ${reponse.status}`);
  }
  return corps?.data as T;
}

const ETIQUETTES_PIECES: Record<string, string> = {
  tva: 'Attestation TVA / BCE',
  certificat_acces_profession: "Certificat d’accès à la profession",
  actionnaires: 'Identité des actionnaires (facultatif)',
  licence: 'Licence d’exploitation du véhicule',
  assurance: 'Assurance transport rémunéré',
  controle_technique: 'Contrôle technique taxi',
  immatriculation: 'Certificat d’immatriculation',
  identification_police: 'Attestation police + photos des plaques communales avant-droit et intérieure',
};

function etiquetteStatut(statut: string) {
  return ({
    BROUILLON: 'À compléter',
    SOUMIS: 'En cours de vérification',
    VALIDE: 'Validé',
    REFUSE: 'À corriger',
    SUSPENDU: 'Suspendu',
    PENDING: 'En vérification',
    APPROVED: 'Validé',
    REJECTED: 'Refusé',
    EXPIRED: 'Expiré',
  } as Record<string, string>)[statut] || statut;
}

function couleurStatut(statut: string) {
  return statut === 'VALIDE' || statut === 'APPROVED'
    ? 'bg-emerald-50 text-emerald-700'
    : statut === 'REFUSE' || statut === 'REJECTED' || statut === 'SUSPENDU' || statut === 'EXPIRED'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-800';
}

export default function GestionSocieteDrive() {
  const tConditions = useTranslations('acceptationConditions');
  const { user, isLoading: sessionCharge } = useAuth();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(false);
  const [envoi, setEnvoi] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [raisonSociale, setRaisonSociale] = useState('');
  const [numeroEntreprise, setNumeroEntreprise] = useState('');
  const [telephone, setTelephone] = useState('');
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  const [region, setRegion] = useState('WALLONIE');
  const [nouveauVehicule, setNouveauVehicule] = useState({ marque: '', modele: '', plaque: '', placesPassagers: '4', numeroLicence: '' });
  const [emailChauffeur, setEmailChauffeur] = useState('');

  const charger = useCallback(async (): Promise<boolean> => {
    try {
      const lu = await appeler<Dossier | null>('/me');
      setDossier(lu);
      if (lu) {
        setRaisonSociale(lu.raisonSociale || '');
        setNumeroEntreprise(lu.numeroEntreprise || '');
        setTelephone(lu.telephone || '');
        setRegion(lu.region || 'WALLONIE');
        const historique = await appeler<Course[]>('/me/courses?limit=20');
        setCourses(historique || []);
      } else {
        setCourses([]);
      }
      setErreur('');
      setErreurChargement(false);
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de charger votre espace société.');
      setErreurChargement(true);
      signalerErreur(e);
      return false;
    } finally {
      setChargement(false);
    }
  }, []);

  useEffectChargement(() => {
    if (sessionCharge) return;
    if (!user) {
      setChargement(false);
      return;
    }
    void charger();
  }, [sessionCharge, user, charger]);

  const agir = async (cle: string, action: () => Promise<unknown>, succes: string): Promise<boolean> => {
    setEnvoi(cle);
    setErreur('');
    setMessage('');
    try {
      await action();
      const actualise = await charger();
      setMessage(actualise ? succes : `${succes} Rechargez la page pour vérifier les dernières données.`);
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'L’action a échoué. Réessayez.');
      signalerErreur(e);
      return false;
    } finally {
      setEnvoi('');
    }
  };

  const enregistrerProfil = async (event: FormEvent) => {
    event.preventDefault();
    const creation = !dossier;
    if (creation && !conditionsAcceptees) return;
    await agir('profil', () => appeler('/me', {
      method: creation ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raisonSociale,
        numeroEntreprise: numeroEntreprise || null,
        telephone: telephone || null,
        region: creation ? 'WALLONIE' : region,
        ...(creation ? { conditionsAcceptees } : {}),
      }),
    }), creation ? 'Dossier société ouvert.' : 'Coordonnées enregistrées.');
  };

  const deposerPiece = async (url: string, type: string, fichier: File, dateExpiration: string) => {
    if (type === 'licence' && !dateExpiration) {
      setErreur('La date de fin de validité de la licence est obligatoire.');
      return;
    }
    setEnvoi(`piece-${type}`);
    setErreur('');
    setMessage('');
    try {
      const aEnvoyer = await reduireImage(fichier);
      const tropGros = erreurDeTaille(aEnvoyer);
      if (tropGros) {
        throw new Error(tropGros === 'pdfTropLourd' ? 'Le PDF dépasse 5 Mo.' : 'L’image dépasse 2 Mo après réduction.');
      }
      const donnees = new FormData();
      donnees.append('type', type);
      if (dateExpiration) donnees.append('dateExpiration', dateExpiration);
      donnees.append('file', aEnvoyer, aEnvoyer === fichier ? fichier.name : `${fichier.name.replace(/\.[^.]+$/, '')}.jpg`);
      const token = jetonAcces();
      const reponse = await fetch(`${API_URL}/api/zupdrive${url}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: donnees,
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        const messageErreur = typeof corps?.error === 'string' ? corps.error : corps?.error?.message;
        throw new Error(messageErreur || corps?.message || `Erreur HTTP ${reponse.status}`);
      }
      const actualise = await charger();
      setMessage(actualise
        ? 'Document déposé. Il sera vérifié par l’équipe ZupDrive.'
        : 'Document envoyé. Rechargez la page pour vérifier son statut.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le document n’a pas pu être envoyé.');
      signalerErreur(e);
    } finally {
      setEnvoi('');
    }
  };

  const ajouterVehicule = async (event: FormEvent) => {
    event.preventDefault();
    const ajoute = await agir('vehicule', () => appeler('/me/vehicules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nouveauVehicule, placesPassagers: Number(nouveauVehicule.placesPassagers) }),
    }), 'Véhicule ajouté. Déposez maintenant ses justificatifs.');
    if (ajoute) setNouveauVehicule({ marque: '', modele: '', plaque: '', placesPassagers: '4', numeroLicence: '' });
  };

  const inviterChauffeur = async (event: FormEvent) => {
    event.preventDefault();
    if (!emailChauffeur.trim()) return;
    const invite = await agir('invitation', () => appeler('/me/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailChauffeur.trim() }),
    }), 'Invitation envoyée. Le chauffeur devra l’accepter depuis son espace.');
    if (invite) setEmailChauffeur('');
  };

  if (sessionCharge || chargement) {
    return <main className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-600">Chargement de votre espace société…</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-900">Espace société taxi ZupDrive</h1>
        <p className="mt-3 text-slate-600">Connectez-vous avec votre compte ZupOne pour gérer votre dossier d’exploitant taxi.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/login?next=%2Fsociete" className="inline-flex rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">Se connecter</Link><Link href="/signup?next=%2Fsociete" className="inline-flex rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">Créer un compte</Link></div>
      </main>
    );
  }

  const modifiable = !dossier || dossier.statut === 'BROUILLON' || dossier.statut === 'REFUSE';
  const nonSuspendue = dossier?.statut !== 'SUSPENDU';
  const depotSocietePossible = Boolean(dossier && ['BROUILLON', 'REFUSE', 'VALIDE'].includes(dossier.statut));

  return (
    <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl bg-gradient-to-r from-[#0754AB] to-[#087DFA] p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-100">Pilote fermé · Namur</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Espace société taxi</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">Déposez les pièces de l’entreprise et de ses véhicules, invitez vos chauffeurs et suivez les courses de votre société.</p>
        {dossier && <div className="mt-5 flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${couleurStatut(dossier.statut)}`}>{etiquetteStatut(dossier.statut)}</span><span className="text-sm text-blue-50">{dossier.raisonSociale}</span></div>}
      </header>

      {(erreur || message) && <div role={erreur ? 'alert' : 'status'} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${erreur ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><span>{erreur || message}</span>{erreurChargement && <button onClick={() => void charger()} className="font-semibold underline">Réessayer</button>}</div>}
      {!dossier && erreurChargement && <section className="rounded-xl border border-red-200 bg-white p-6 text-sm text-slate-700">Nous n’avons pas pu vérifier si ce compte possède déjà un dossier. Réessayez avant d’en ouvrir un nouveau.</section>}
      {dossier?.motifStatut && dossier.statut === 'REFUSE' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Corrections demandées par ZupDrive :</strong> {dossier.motifStatut}</div>}
      {dossier?.statut === 'SUSPENDU' && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Votre société est suspendue. Contactez l’équipe ZupDrive avant de modifier le dossier ou d’utiliser les véhicules.</div>}
      {dossier?.statut === 'SOUMIS' && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Votre dossier est en cours d’examen. Vous pourrez compléter les éléments demandés après le retour de l’équipe.</div>}

      {(!erreurChargement || dossier) && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4"><h2 className="text-xl font-bold text-slate-900">1. Dossier de l’entreprise</h2><p className="mt-1 text-sm text-slate-600">La région du pilote est fixée à la Wallonie. Le numéro BCE et le téléphone servent à vérifier l’exploitant.</p></div>
        <form onSubmit={enregistrerProfil} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Raison sociale<input required minLength={2} maxLength={160} value={raisonSociale} disabled={!modifiable} onChange={(e) => setRaisonSociale(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-100" /></label>
          <label className="text-sm font-medium text-slate-700">Numéro d’entreprise (BCE)<input required value={numeroEntreprise} disabled={!modifiable} onChange={(e) => setNumeroEntreprise(e.target.value)} placeholder="0123.456.789" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-100" /></label>
          <label className="text-sm font-medium text-slate-700">Téléphone<input required type="tel" value={telephone} disabled={!modifiable} onChange={(e) => setTelephone(e.target.value)} placeholder="+32 …" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-100" /></label>
          <label className="text-sm font-medium text-slate-700">Région de la licence<select value={region} disabled={!modifiable || Boolean(dossier)} onChange={(e) => setRegion(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100"><option value="WALLONIE">Wallonie — pilote Namur</option><option value="BRUXELLES" disabled={!dossier}>Bruxelles-Capitale</option><option value="FLANDRE" disabled={!dossier}>Flandre</option></select></label>
          {!dossier && <div className="sm:col-span-2"><AcceptationConditions clair coche={conditionsAcceptees} onChange={setConditionsAcceptees} documents={[{ href: '/cgu', libelle: tConditions('docs.cgu') }, { href: '/conditions-societes', libelle: tConditions('docs.societesTaxi') }]} /></div>}
          <div className="flex items-end"><button disabled={envoi === 'profil' || !modifiable || (!dossier && !conditionsAcceptees)} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{envoi === 'profil' ? 'Enregistrement…' : dossier ? 'Enregistrer les coordonnées' : 'Ouvrir le dossier société'}</button></div>
        </form>
        {dossier?.numeroTva && <p className="mt-3 text-xs text-slate-500">TVA reconnue : {dossier.numeroTva}</p>}
        {dossier && <PieceList titre="Justificatifs de l’entreprise" description="Téléversez les pièces exigées; l’équipe ZupDrive examine les titres et les rattache à la société." types={[{ type: 'tva', libelle: ETIQUETTES_PIECES.tva }, { type: 'certificat_acces_profession', libelle: ETIQUETTES_PIECES.certificat_acces_profession }, { type: 'actionnaires', libelle: ETIQUETTES_PIECES.actionnaires }]} pieces={dossier.documents} depotPossible={depotSocietePossible} prefixe="/societe/me/documents" envoi={envoi} onDeposer={deposerPiece} />}
        {dossier && (dossier.piecesManquantes.length > 0 || dossier.champsManquants.length > 0) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">À compléter : {[...dossier.champsManquants, ...dossier.piecesManquantes.map((t) => ETIQUETTES_PIECES[t] || t)].join(', ')}.</p>}
        {dossier && modifiable && <div className="mt-5 border-t border-slate-100 pt-4"><button onClick={() => void agir('soumission', () => appeler('/me/submit', { method: 'POST' }), 'Dossier envoyé à l’équipe ZupDrive.')} disabled={!dossier.peutSoumettre || Boolean(envoi)} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{envoi === 'soumission' ? 'Envoi…' : 'Soumettre le dossier pour validation'}</button>{!dossier.peutSoumettre && <p className="mt-2 text-xs text-slate-500">Complétez les coordonnées et déposez les justificatifs requis avant l’envoi.</p>}</div>}
      </section>}

      {dossier && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4"><h2 className="text-xl font-bold text-slate-900">2. Véhicules</h2><p className="mt-1 text-sm text-slate-600">Chaque véhicule doit avoir sa propre licence, son assurance, son contrôle technique et son immatriculation. Pour une licence de Wallonie, ajoutez l’attestation d’identification police et les photos de la plaque communale avant-droit et de son rappel intérieur (un PDF peut réunir les justificatifs). Indiquez les places passagers sans compter le chauffeur.</p>{dossier.region === 'WALLONIE' && <p className="mt-2 text-sm text-slate-600">Lorsqu’un véhicule remplace définitivement un autre après une nouvelle acquisition, le règlement de Namur prévoit un véhicule hybride ou électrique (pas mild-hybrid), quatre portes au minimum et blanc uni non métallisé, sous réserve des exceptions communales.</p>}</div>
        {nonSuspendue && <form onSubmit={ajouterVehicule} className="mb-6 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-slate-700">Marque<input required maxLength={60} value={nouveauVehicule.marque} onChange={(e) => setNouveauVehicule({ ...nouveauVehicule, marque: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs font-medium text-slate-700">Modèle<input required maxLength={60} value={nouveauVehicule.modele} onChange={(e) => setNouveauVehicule({ ...nouveauVehicule, modele: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs font-medium text-slate-700">Plaque<input required maxLength={20} value={nouveauVehicule.plaque} onChange={(e) => setNouveauVehicule({ ...nouveauVehicule, plaque: e.target.value })} placeholder="1-ABC-123" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs font-medium text-slate-700">Places passagers<input required type="number" min={1} max={6} value={nouveauVehicule.placesPassagers} onChange={(e) => setNouveauVehicule({ ...nouveauVehicule, placesPassagers: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          <div className="flex items-end"><button disabled={envoi === 'vehicule'} className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{envoi === 'vehicule' ? 'Ajout…' : 'Ajouter le véhicule'}</button></div>
          <label className="text-xs font-medium text-slate-700 sm:col-span-2 lg:col-span-2">Numéro de licence (si déjà attribué)<input maxLength={60} value={nouveauVehicule.numeroLicence} onChange={(e) => setNouveauVehicule({ ...nouveauVehicule, numeroLicence: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        </form>}
        {dossier.vehicules.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Aucun véhicule. Ajoutez-en un pour commencer son dossier de conformité.</p> : <div className="space-y-5">{dossier.vehicules.map((vehicule) => <article key={vehicule.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{vehicule.marque} {vehicule.modele} · {vehicule.plaque}</h3><p className="mt-1 text-sm text-slate-600">{vehicule.placesPassagers} places passagers · {vehicule.placesPassagers <= 4 ? 'Standard' : 'XL'}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${vehicule.conforme ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{vehicule.conforme ? 'Conforme' : 'Pièces à valider'}</span>{nonSuspendue && <button disabled={Boolean(envoi)} onClick={() => { if (window.confirm(`Retirer le véhicule ${vehicule.plaque} de votre flotte ? Il restera dans l’historique.`)) void agir(`retirer-${vehicule.id}`, () => appeler(`/me/vehicules/${vehicule.id}/retirer`, { method: 'POST' }), 'Véhicule retiré de la flotte.'); }} className="text-xs font-semibold text-red-700 underline disabled:opacity-50">Retirer</button>}</div></div>
          <PieceList titre="Documents du véhicule" description="La date de fin de validité de la licence est obligatoire." types={vehicule.piecesExigees} pieces={vehicule.documents} depotPossible={nonSuspendue} prefixe={`/societe/me/vehicules/${vehicule.id}/documents`} envoi={envoi} onDeposer={deposerPiece} />
        </article>)}</div>}
      </section>}

      {dossier && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4"><h2 className="text-xl font-bold text-slate-900">3. Équipe de chauffeurs</h2><p className="mt-1 text-sm text-slate-600">Envoyez une invitation à l’adresse du compte ZupOne du chauffeur. Il doit l’accepter; attribuez ensuite un véhicule conforme.</p></div>
        {nonSuspendue && <form onSubmit={inviterChauffeur} className="mb-5 flex flex-col gap-3 sm:flex-row"><label className="flex-1 text-sm font-medium text-slate-700">Adresse e-mail du chauffeur<input required type="email" maxLength={254} value={emailChauffeur} onChange={(e) => setEmailChauffeur(e.target.value)} placeholder="chauffeur@exemple.be" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label><button disabled={envoi === 'invitation'} className="self-end rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{envoi === 'invitation' ? 'Envoi…' : 'Inviter un chauffeur'}</button></form>}
        {dossier.invitations.length > 0 && <div className="mb-5 rounded-lg bg-amber-50 p-4"><h3 className="text-sm font-semibold text-amber-900">Invitations en attente</h3><ul className="mt-2 space-y-2">{dossier.invitations.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900"><span>{invitation.email} · envoyée le {new Date(invitation.createdAt).toLocaleDateString('fr-BE')}</span><button onClick={() => void agir(`annuler-${invitation.id}`, () => appeler(`/me/invitations/${invitation.id}/annuler`, { method: 'POST' }), 'Invitation annulée.')} className="text-xs font-semibold underline">Annuler</button></li>)}</ul></div>}
        {dossier.chauffeurs.length === 0 ? <p className="text-sm text-slate-500">Aucun chauffeur n’a encore accepté votre invitation.</p> : <div className="space-y-3">{dossier.chauffeurs.map((chauffeur) => <div key={chauffeur.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-semibold text-slate-900">{chauffeur.nomComplet}</p><p className="text-xs text-slate-500">{chauffeur.email} · {etiquetteStatut(chauffeur.statut)}{chauffeur.enLigne ? ' · en ligne' : ''}</p></div><label className="text-xs font-medium text-slate-600">Véhicule<select value={chauffeur.vehiculeId || ''} disabled={!nonSuspendue} onChange={(e) => void agir(`affectation-${chauffeur.id}`, () => appeler(`/me/chauffeurs/${chauffeur.id}/vehicule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehiculeId: e.target.value || null }) }), 'Affectation mise à jour.')} className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-900"><option value="">Non attribué</option>{dossier.vehicules.map((vehicule) => <option key={vehicule.id} value={vehicule.id}>{vehicule.marque} {vehicule.modele} · {vehicule.plaque}{vehicule.conforme ? '' : ' · pièces à valider'}</option>)}</select></label><button disabled={!nonSuspendue} onClick={() => { if (window.confirm(`Détacher ${chauffeur.nomComplet} de votre société ?`)) void agir(`detacher-${chauffeur.id}`, () => appeler(`/me/chauffeurs/${chauffeur.id}/detacher`, { method: 'POST' }), 'Chauffeur détaché.'); }} className="justify-self-start text-xs font-semibold text-red-700 underline disabled:opacity-50">Détacher</button></div>)}</div>}
      </section>}

      {dossier && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4"><h2 className="text-xl font-bold text-slate-900">4. Courses récentes</h2><p className="mt-1 text-sm text-slate-600">Historique des courses enregistrées pour cette société.</p></div>
        {courses.length === 0 ? <p className="text-sm text-slate-500">Aucune course enregistrée.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Trajet</th><th className="py-2 pr-3">Chauffeur / véhicule</th><th className="py-2 pr-3">Statut</th><th className="py-2 text-right">Prix</th></tr></thead><tbody>{courses.map((course) => <tr key={course.id} className="border-b border-slate-100 align-top"><td className="py-3 pr-3 whitespace-nowrap">{new Date(course.createdAt).toLocaleString('fr-BE')}</td><td className="py-3 pr-3"><span className="block max-w-64 truncate">{course.departAdresse}</span><span className="block max-w-64 truncate text-slate-500">→ {course.arriveeAdresse}</span></td><td className="py-3 pr-3">{course.chauffeur?.nomComplet || '—'}<span className="block text-xs text-slate-500">{course.vehicule?.plaque || '—'}</span></td><td className="py-3 pr-3">{etiquetteStatut(course.statut)}</td><td className="py-3 text-right whitespace-nowrap">{(course.prixCentimes / 100).toLocaleString('fr-BE', { style: 'currency', currency: course.devise || 'EUR' })}</td></tr>)}</tbody></table></div>}
      </section>}

      <footer className="pb-6 text-center text-sm text-slate-500">Pour toute question sur votre dossier, contactez l’équipe ZupDrive par le canal communiqué lors de votre inscription. <Link href="/zupdrive" className="font-semibold text-blue-700 underline">En savoir plus sur ZupDrive</Link>.</footer>
    </main>
  );
}

function PieceList({
  titre,
  description,
  types,
  pieces,
  depotPossible,
  prefixe,
  envoi,
  onDeposer,
}: {
  titre: string;
  description: string;
  types: DocumentAttendu[];
  pieces: Piece[];
  depotPossible: boolean;
  prefixe: string;
  envoi: string;
  onDeposer: (url: string, type: string, fichier: File, dateExpiration: string) => void;
}) {
  return <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="font-semibold text-slate-900">{titre}</h3><p className="mt-1 text-xs text-slate-500">{description} Formats : JPG, PNG, WebP (2 Mo après réduction), PDF (5 Mo).</p><div className="mt-3 space-y-3">{types.map(({ type, libelle }) => {
    const versions = pieces.filter((piece) => piece.type === type);
    const actuelle = versions[versions.length - 1];
    return <div key={type} className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="text-sm font-medium text-slate-800">{ETIQUETTES_PIECES[type] || libelle}</p>{actuelle ? <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className={`rounded-full px-2 py-0.5 font-semibold ${couleurStatut(actuelle.statut)}`}>{etiquetteStatut(actuelle.statut)}</span>{actuelle.dateExpiration && <span>Expire le {new Date(actuelle.dateExpiration).toLocaleDateString('fr-BE')}</span>}<LienPiece adresse={actuelle.url} className="font-semibold text-blue-700 underline">Voir le fichier</LienPiece></div> : <p className="mt-1 text-xs text-amber-700">À déposer</p>}{actuelle?.noteExamen && <p className="mt-1 text-xs text-red-700">Motif : {actuelle.noteExamen}</p>}</div>
      {depotPossible && <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-slate-600">Fin de validité{type === 'licence' ? ' *' : ''}<input aria-label={`Date de fin de validité — ${ETIQUETTES_PIECES[type] || libelle}`} type="date" required={type === 'licence'} id={`${prefixe}-${type}-date`} className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900" /></label><label className="cursor-pointer rounded-md border border-blue-700 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50">{actuelle ? 'Remplacer / renouveler' : 'Choisir un fichier'}<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="sr-only" disabled={envoi === `piece-${type}`} onChange={(event) => { const fichier = event.target.files?.[0]; const date = document.getElementById(`${prefixe}-${type}-date`) as HTMLInputElement | null; if (fichier) onDeposer(prefixe, type, fichier, date?.value || ''); event.currentTarget.value = ''; }} /></label></div>}
    </div>;
  })}</div></div>;
}
