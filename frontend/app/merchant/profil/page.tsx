'use client';


/**
 * Le profil du commerçant.
 *
 * La plateforme lui facturait une commission et lui devait des versements sans
 * rien savoir de lui : ni raison sociale, ni adresse de facturation, ni numéro
 * de TVA, ni compte où virer. Aucun écran ne le lui demandait, et il n'avait
 * aucun moyen de le renseigner.
 *
 * L'IBAN n'est jamais réaffiché en entier : l'API n'en rend que les quatre
 * derniers caractères.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  Clock,
  CreditCard,
  FileText,
  Landmark,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';

import { AddressAutocomplete } from '@/components/AddressAutocomplete';

import { useLocale, useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import ChangerMotDePasse from '@/components/ChangerMotDePasse';
import { LienPiece } from '@/components/LienPiece';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Piece {
  id: string;
  type: string;
  libelle: string;
  documentUrl: string;
  fileName: string | null;
  expiryDate: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reviewNote: string | null;
}

interface Profil {
  id: string;
  name: string;
  status: string;
  suspensionReason: string | null;
  legalName: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  billingAddress: string | null;
  billingPostalCode: string | null;
  billingCity: string | null;
  billingCountry: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerBirthDate: string | null;
  bic: string | null;
  accountHolder: string | null;
  ibanMasque: string | null;
  ibanRenseigne: boolean;
  documents: Piece[];
  paysConnus: string[];
  typesDocument: { type: string; libelle: string }[];
  exempleTva: string | null;
  manquePourFacturer: string[];
  manquePourEtrePaye: string[];
  suggestions?: Partial<Record<ChampSuggere, string | null>>;
  validation: {
    valide: boolean;
    piecesExigees: { type: string; libelle: string }[];
    piecesManquantes: { type: string; libelle: string }[];
    piecesAFournir: { type: string; libelle: string }[];
    piecesEnExamen: { type: string; libelle: string }[];
  };
}

// Libellé de chaque état de pièce : `pieces.<statut>` des traductions.
const MARQUES: Record<string, { icone: typeof Check; classe: string }> = {
  APPROVED: { icone: Check, classe: 'text-green-600' },
  REJECTED: { icone: X, classe: 'text-red-600' },
  PENDING: { icone: Clock, classe: 'text-gray-500' },
  EXPIRED: { icone: AlertTriangle, classe: 'text-amber-600' },
};

/** Le délai de prévenance : c'est aussi celui du rappel envoyé par la plateforme. */
const JOURS_AVANT_EXPIRATION = 30;

const joursAvant = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);

/** Une date ISO ramenée à ce qu'un champ `date` attend, sans décalage d'heure. */
const pourChamp = (date: string | null) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

/** Les champs que l'API sait proposer, d'après l'inscription. */
type ChampSuggere =
  | 'legalName'
  | 'billingAddress'
  | 'billingPostalCode'
  | 'billingCity'
  | 'billingCountry'
  | 'ownerFirstName'
  | 'ownerLastName'
  | 'ownerEmail'
  | 'ownerPhone'
  | 'accountHolder';

/**
 * Un profil jamais rempli : rien de ce qui identifie le commerçant n'est
 * enregistré. Les propositions ne valent que pour lui — une fois le profil
 * enregistré, un champ laissé vide l'est volontairement.
 */
const jamaisRempli = (lu: Profil) =>
  !lu.legalName && !lu.billingAddress && !lu.ownerFirstName && !lu.ownerLastName;

const CHAMP =
  'w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-400';

export default function ProfilCommercantPage() {
  const t = useTranslations('merchantProfile');
  const locale = useLocale();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [orgId, setOrgId] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [preRempli, setPreRempli] = useState(false);

  const [form, setForm] = useState({
    legalName: '',
    registrationNumber: '',
    vatNumber: '',
    billingAddress: '',
    billingPostalCode: '',
    billingCity: '',
    billingCountry: 'France',
    ownerFirstName: '',
    ownerLastName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerBirthDate: '',
    iban: '',
    bic: '',
    accountHolder: '',
  });

  const [piece, setPiece] = useState({ type: '', documentUrl: '', fileName: '', expiryDate: '', file: null as File | null });
  const [erreurPiece, setErreurPiece] = useState('');
  const [envoiPiece, setEnvoiPiece] = useState(false);

  const remplir = (lu: Profil) => {
    setProfil(lu);

    // Ce que l'inscription a déjà appris, proposé dans les champs vides d'un
    // profil encore jamais rempli. Rien n'est enregistré sans le bouton.
    const proposer = jamaisRempli(lu);
    const valeur = (champ: ChampSuggere) =>
      lu[champ] || (proposer ? lu.suggestions?.[champ] : null) || '';
    setPreRempli(
      proposer && Object.values(lu.suggestions || {}).some(Boolean)
    );

    setForm({
      legalName: valeur('legalName'),
      registrationNumber: lu.registrationNumber || '',
      vatNumber: lu.vatNumber || '',
      billingAddress: valeur('billingAddress'),
      billingPostalCode: valeur('billingPostalCode'),
      billingCity: valeur('billingCity'),
      billingCountry: valeur('billingCountry') || 'France',
      ownerFirstName: valeur('ownerFirstName'),
      ownerLastName: valeur('ownerLastName'),
      ownerEmail: valeur('ownerEmail'),
      ownerPhone: valeur('ownerPhone'),
      ownerBirthDate: pourChamp(lu.ownerBirthDate),
      // Jamais réaffiché : le champ reste vide, et seul un IBAN saisi part.
      iban: '',
      bic: lu.bic || '',
      accountHolder: valeur('accountHolder'),
    });
  };

  const charger = useCallback(async () => {
    const jeton = localStorage.getItem('accessToken');
    const org = localStorage.getItem('currentOrgId');

    if (!jeton || !org) {
      setErreur(t('reconnectez'));
      setChargement(false);
      return;
    }

    setOrgId(org);

    try {
      const reponse = await fetch(`${API_URL}/api/merchant-profile/${org}`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });
      const lu = await reponse.json();

      if (!reponse.ok) {
        setErreur(lu.error || t('chargementImpossible'));
        return;
      }

      remplir(lu.data);
      setErreur('');
    } catch {
      setErreur(t('serverError'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setMessage('');
    setEnvoi(true);

    try {
      const jeton = localStorage.getItem('accessToken');
      // Un IBAN vide n'efface pas celui qui est enregistré : il n'est pas envoyé.
      const { iban, ...reste } = form;
      const corps: Record<string, string> = { ...reste };
      if (iban.trim()) corps.iban = iban.trim();

      const reponse = await fetch(`${API_URL}/api/merchant-profile/${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
        body: JSON.stringify(corps),
      });
      const lu = await reponse.json();

      if (!reponse.ok) {
        setErreur(lu.error || t('enregistrementImpossible'));
        return;
      }

      remplir(lu.data);
      setMessage(t('enregistre'));
    } catch {
      setErreur(t('serverError'));
    } finally {
      setEnvoi(false);
    }
  };

  const deposer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreurPiece('');

    if (!piece.type) {
      setErreurPiece(t('choisissezPiece'));
      return;
    }

    if (!piece.file && !piece.documentUrl) {
      setErreurPiece(t('fichierOuLien'));
      return;
    }

    setEnvoiPiece(true);

    try {
      const jeton = localStorage.getItem('accessToken');

      if (piece.file) {
        const formData = new FormData();
        formData.append('file', piece.file);
        formData.append('type', piece.type);
        if (piece.expiryDate) {
          formData.append('expiryDate', piece.expiryDate);
        }

        const reponse = await fetch(`${API_URL}/api/merchant-profile/${orgId}/documents/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jeton}` },
          body: formData,
        });
        const lu = await reponse.json().catch(() => null);

        if (!reponse.ok) {
          setErreurPiece(lu?.error || t('uploadImpossible'));
          return;
        }
      } else {
        const reponse = await fetch(`${API_URL}/api/merchant-profile/${orgId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
          body: JSON.stringify({
            type: piece.type,
            documentUrl: piece.documentUrl,
            fileName: piece.fileName || undefined,
            expiryDate: piece.expiryDate ? new Date(piece.expiryDate).toISOString() : undefined,
          }),
        });
        const lu = await reponse.json().catch(() => null);

        if (!reponse.ok) {
          setErreurPiece(lu?.error || t('depotImpossible'));
          return;
        }
      }

      setPiece({ type: '', documentUrl: '', fileName: '', expiryDate: '', file: null });
      await charger();
    } catch {
      setErreurPiece(t('serverError'));
    } finally {
      setEnvoiPiece(false);
    }
  };

  const retirer = async (documentId: string) => {
    try {
      const jeton = localStorage.getItem('accessToken');
      await fetch(`${API_URL}/api/merchant-profile/${orgId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jeton}` },
      });
      await charger();
    } catch {
      setErreurPiece(t('serverError'));
    }
  };

  if (chargement) {
    return <div className="p-8 text-gray-500">{t('chargement')}</div>;
  }

  if (!profil) {
    return (
      <div className="p-8">
        <p role="status" className="text-red-600">
          {erreur || t('introuvable')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <Link
          href="/merchant"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-3"
        >
          <ArrowLeft size={16} />
          {t('mesCommerces')}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{t('monProfil')}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {t('sousTitre')}
        </p>
      </div>

      {/* Une suspension tient le plus souvent à ce qui manque ici. Le dire, et
          laisser la page utilisable, est toute la différence entre une
          consigne et une impasse. */}
      {profil.status === 'SUSPENDED' && (
        <div
          role="status"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm space-y-1"
        >
          <p className="font-semibold">{t('suspendu')}</p>
          {profil.suspensionReason && <p>{t('motif', { motif: profil.suspensionReason })}</p>}
          <p>
            {t('suspenduAide')}{' '}
            <Link href={`/merchant/${orgId}/support`} className="underline hover:text-red-800">
              {t('prevenezSupport')}
            </Link>
            {t('suspenduFin')}
          </p>
        </div>
      )}

      {/* Tant que la plateforme n'a pas validé le commerce, il prépare sa
          boutique mais ne peut pas l'ouvrir : lui dire quoi fournir. */}
      {profil.validation && !profil.validation.valide && (
        <div
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 text-sm space-y-1"
        >
          <p className="font-semibold">{t('enAttente')}</p>
          <p>
            {t('enAttenteAide')}
          </p>
          {/* Ce qu'il reste à déposer d'un côté, ce qui attend la plateforme de
              l'autre : une pièce déposée ne doit plus apparaître « à fournir ». */}
          {profil.validation.piecesAFournir?.length > 0 && (
            <p>
              <strong>{t('aFournir')}</strong>{' '}
              {profil.validation.piecesAFournir.map((piece) => piece.libelle).join(', ')}.
            </p>
          )}
          {/* Tout est déposé : le dire franchement. La liste « en cours
              d'examen » seule laissait le commerçant se demander s'il lui
              manquait encore quelque chose. */}
          {profil.validation.piecesAFournir?.length === 0 &&
            profil.validation.piecesEnExamen?.length > 0 && (
              <p className="flex items-center gap-2 font-semibold text-green-700">
                <Check size={16} aria-hidden />
                {t('toutDepose')}
              </p>
            )}
          {profil.validation.piecesEnExamen?.length > 0 && (
            <p className="text-blue-800/80">
              {t('enExamen')}{' '}
              {profil.validation.piecesEnExamen.map((piece) => piece.libelle).join(', ')}.
            </p>
          )}
          {profil.validation.piecesManquantes.length === 0 && (
            <p>{t('piecesValidees')}</p>
          )}
        </div>
      )}

      {/* Ce qui manque se découvrait le jour où la facture était fausse, ou le
          virement impossible. */}
      {(profil.manquePourFacturer.length > 0 || profil.manquePourEtrePaye.length > 0) && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm space-y-1"
        >
          {profil.manquePourFacturer.length > 0 && (
            <p>
              {t.rich('manqueFacturer', { liste: profil.manquePourFacturer.join(', '), b: (c) => <strong>{c}</strong> })}
            </p>
          )}
          {profil.manquePourEtrePaye.length > 0 && (
            <p>
              {t.rich('manquePaye', { liste: profil.manquePourEtrePaye.join(', '), b: (c) => <strong>{c}</strong> })}
            </p>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="text-sm text-green-600">
          {message}
        </p>
      )}
      {erreur && (
        <p role="status" className="text-sm text-red-600">
          {erreur}
        </p>
      )}

      <form onSubmit={enregistrer} className="space-y-6">
        {preRempli && (
          <p className="text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg p-3">
            {t('preRempli')}
          </p>
        )}

        <section className="bg-white ring-1 ring-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={20} className="text-orange-500" />
            {t('identiteFacturation')}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="legalName" className="block text-sm text-gray-500 mb-1">
                {t('raisonSociale')}
              </label>
              <input
                id="legalName"
                value={form.legalName}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                placeholder={profil.name}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="registrationNumber" className="block text-sm text-gray-500 mb-1">
                {t('immatriculation')}
              </label>
              <input
                id="registrationNumber"
                value={form.registrationNumber}
                onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                placeholder={form.billingCountry === 'Belgique' ? 'BCE' : 'SIRET'}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="billingCountry" className="block text-sm text-gray-500 mb-1">
                {t('pays')}
              </label>
              <select
                id="billingCountry"
                value={form.billingCountry}
                onChange={(e) => setForm({ ...form, billingCountry: e.target.value })}
                className={CHAMP}
              >
                {profil.paysConnus.map((pays) => (
                  <option key={pays} value={pays}>
                    {pays}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="vatNumber" className="block text-sm text-gray-500 mb-1">
                {t('numeroTva')}
              </label>
              <input
                id="vatNumber"
                value={form.vatNumber}
                onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
                placeholder={form.billingCountry === 'Belgique' ? 'BE0123456789' : 'FR12345678901'}
                className={CHAMP}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="billingAddress" className="block text-sm text-gray-500 mb-1">
                {t('adresseFacturation')}
              </label>
              <AddressAutocomplete
                clair
                id="billingAddress"
                value={form.billingAddress}
                onChange={(valeur) => setForm({ ...form, billingAddress: valeur })}
                onSelect={(adresse) =>
                  setForm((actuel) => ({
                    ...actuel,
                    billingAddress: adresse.street || adresse.label,
                    billingPostalCode: adresse.postalCode || actuel.billingPostalCode,
                    billingCity: adresse.city || actuel.billingCity,
                    // La suggestion connaît le pays : la Belgique s'y trouve
                    // aussi, et l'écrire à la main est une source de fautes.
                    billingCountry:
                      adresse.country && profil.paysConnus.includes(adresse.country)
                        ? adresse.country
                        : actuel.billingCountry,
                  }))
                }
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="billingPostalCode" className="block text-sm text-gray-500 mb-1">
                {t('codePostal')}
              </label>
              <input
                id="billingPostalCode"
                value={form.billingPostalCode}
                onChange={(e) => setForm({ ...form, billingPostalCode: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="billingCity" className="block text-sm text-gray-500 mb-1">
                {t('ville')}
              </label>
              <input
                id="billingCity"
                value={form.billingCity}
                onChange={(e) => setForm({ ...form, billingCity: e.target.value })}
                className={CHAMP}
              />
            </div>
          </div>
        </section>

        <section className="bg-white ring-1 ring-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <User size={20} className="text-orange-500" />
            {t('proprietaire')}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ownerFirstName" className="block text-sm text-gray-500 mb-1">
                {t('prenom')}
              </label>
              <input
                id="ownerFirstName"
                value={form.ownerFirstName}
                onChange={(e) => setForm({ ...form, ownerFirstName: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="ownerLastName" className="block text-sm text-gray-500 mb-1">
                {t('nom')}
              </label>
              <input
                id="ownerLastName"
                value={form.ownerLastName}
                onChange={(e) => setForm({ ...form, ownerLastName: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="ownerEmail" className="block text-sm text-gray-500 mb-1">
                {t('email')}
              </label>
              <input
                id="ownerEmail"
                type="email"
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="ownerPhone" className="block text-sm text-gray-500 mb-1">
                {t('telephone')}
              </label>
              <input
                id="ownerPhone"
                value={form.ownerPhone}
                onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="ownerBirthDate" className="block text-sm text-gray-500 mb-1">
                {t('dateNaissance')}
              </label>
              <input
                id="ownerBirthDate"
                type="date"
                value={form.ownerBirthDate}
                onChange={(e) => setForm({ ...form, ownerBirthDate: e.target.value })}
                className={CHAMP}
              />
            </div>
          </div>
        </section>

        <section className="bg-white ring-1 ring-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Landmark size={20} className="text-orange-500" />
            {t('compteBancaire')}
          </h2>

          <p className="text-sm text-gray-500">
            {t('compteBancaireAide')}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="iban" className="block text-sm text-gray-500 mb-1">
                {t('iban')}
              </label>
              <input
                id="iban"
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: e.target.value })}
                placeholder={profil.ibanRenseigne ? t('ibanLaissezVide') : 'FR76…'}
                className={CHAMP}
              />
              {/* Il n'est jamais réaffiché : quatre caractères suffisent à
                  reconnaître son compte, et n'en permettent aucun usage. */}
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <CreditCard size={12} />
                {profil.ibanRenseigne
                  ? t('compteEnregistre', { iban: profil.ibanMasque ?? '' })
                  : t('aucunCompte')}
              </p>
            </div>

            <div>
              <label htmlFor="bic" className="block text-sm text-gray-500 mb-1">
                {t('bic')}
              </label>
              <input
                id="bic"
                value={form.bic}
                onChange={(e) => setForm({ ...form, bic: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="accountHolder" className="block text-sm text-gray-500 mb-1">
                {t('titulaire')}
              </label>
              <input
                id="accountHolder"
                value={form.accountHolder}
                onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
                className={CHAMP}
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={envoi}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 px-6 rounded-lg transition"
        >
          {envoi ? t('saving') : t('save')}
        </button>
      </form>

      <section className="bg-white ring-1 ring-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          {t('justificatifs')}
        </h2>

        {profil.documents.length === 0 ? (
          <p className="text-sm text-gray-500">{t('aucunePiece')}</p>
        ) : (
          <ul className="space-y-2">
            {profil.documents.map((document) => {
              const marque = MARQUES[document.status] || MARQUES.PENDING;
              const Icone = marque.icone;

              return (
                <li
                  key={document.id}
                  className="flex items-start justify-between gap-3 rounded bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-gray-900 text-sm font-medium">{document.libelle}</p>
                    <p className={`text-xs ${marque.classe}`}>{t(`pieces.${MARQUES[document.status] ? document.status : 'PENDING'}`)}</p>
                    {document.expiryDate && document.status !== 'EXPIRED' && (
                      <p
                        className={`text-xs ${
                          joursAvant(document.expiryDate) <= JOURS_AVANT_EXPIRATION
                            ? 'text-amber-700 font-medium'
                            : 'text-gray-500'
                        }`}
                      >
                        {t('expireLe', { date: new Date(document.expiryDate).toLocaleDateString(locale) })}
                        {joursAvant(document.expiryDate) <= JOURS_AVANT_EXPIRATION &&
                          t('expireDans', { n: joursAvant(document.expiryDate) })}
                      </p>
                    )}
                    {document.reviewNote && (
                      <p className="text-xs text-red-700 mt-1">{document.reviewNote}</p>
                    )}
                    <LienPiece
                      adresse={document.documentUrl}
                      className="text-xs text-orange-600 hover:underline break-all"
                    >
                      {document.fileName || document.documentUrl}
                    </LienPiece>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Icone size={18} className={marque.classe} />
                    <button
                      type="button"
                      onClick={() => retirer(document.id)}
                      title={t('retirer', { piece: document.libelle })}
                      className="text-gray-500 hover:text-red-600 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={deposer} className="space-y-3 border-t border-gray-200 pt-4">
          {erreurPiece && (
            <p role="status" className="text-sm text-red-600">
              {erreurPiece}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="piece-type" className="block text-sm text-gray-500 mb-1">
                {t('pieceADeposer')}
              </label>
              <select
                id="piece-type"
                value={piece.type}
                onChange={(e) => setPiece({ ...piece, type: e.target.value })}
                className={CHAMP}
              >
                <option value="">{t('choisir')}</option>
                {profil.typesDocument.map((attendue) => (
                  <option key={attendue.type} value={attendue.type}>
                    {attendue.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="piece-expiration" className="block text-sm text-gray-500 mb-1">
                {t('expiration')}
              </label>
              <input
                id="piece-expiration"
                type="date"
                value={piece.expiryDate}
                onChange={(e) => setPiece({ ...piece, expiryDate: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="piece-fichier" className="block text-sm text-gray-500 mb-1">
                {t('fichier')}
              </label>
              <input
                id="piece-fichier"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPiece({ ...piece, file, fileName: file?.name || '', documentUrl: '' });
                }}
                className={CHAMP}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('fichiersAcceptes')}
              </p>
            </div>

            <div className="sm:col-span-2">
              <p className="text-xs text-gray-500 mb-2">{t('ou')}</p>
              <label htmlFor="piece-lien" className="block text-sm text-gray-500 mb-1">
                {t('lien')}
              </label>
              <input
                id="piece-lien"
                type="url"
                value={piece.documentUrl}
                onChange={(e) => setPiece({ ...piece, documentUrl: e.target.value, file: null })}
                placeholder="https://…"
                className={CHAMP}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('lienAide')}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={envoiPiece}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            <Upload size={16} />
            {envoiPiece ? t('depot') : t('deposer')}
          </button>
        </form>
      </section>

      <ChangerMotDePasse clair />
    </div>
  );
}
