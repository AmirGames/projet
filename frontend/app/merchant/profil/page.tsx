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

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Piece {
  id: string;
  type: string;
  libelle: string;
  documentUrl: string;
  fileName: string | null;
  expiryDate: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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
}

const MARQUES: Record<string, { icone: typeof Check; classe: string; libelle: string }> = {
  APPROVED: { icone: Check, classe: 'text-green-400', libelle: 'Validé' },
  REJECTED: { icone: X, classe: 'text-red-400', libelle: 'Refusé' },
  PENDING: { icone: Clock, classe: 'text-gray-400', libelle: "En attente d'examen" },
};

/** Une date ISO ramenée à ce qu'un champ `date` attend, sans décalage d'heure. */
const pourChamp = (date: string | null) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

const CHAMP =
  'w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500';

export default function ProfilCommercantPage() {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [orgId, setOrgId] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);

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

  const [piece, setPiece] = useState({ type: '', documentUrl: '', fileName: '', expiryDate: '' });
  const [erreurPiece, setErreurPiece] = useState('');
  const [envoiPiece, setEnvoiPiece] = useState(false);

  const remplir = (lu: Profil) => {
    setProfil(lu);
    setForm({
      legalName: lu.legalName || '',
      registrationNumber: lu.registrationNumber || '',
      vatNumber: lu.vatNumber || '',
      billingAddress: lu.billingAddress || '',
      billingPostalCode: lu.billingPostalCode || '',
      billingCity: lu.billingCity || '',
      billingCountry: lu.billingCountry || 'France',
      ownerFirstName: lu.ownerFirstName || '',
      ownerLastName: lu.ownerLastName || '',
      ownerEmail: lu.ownerEmail || '',
      ownerPhone: lu.ownerPhone || '',
      ownerBirthDate: pourChamp(lu.ownerBirthDate),
      // Jamais réaffiché : le champ reste vide, et seul un IBAN saisi part.
      iban: '',
      bic: lu.bic || '',
      accountHolder: lu.accountHolder || '',
    });
  };

  const charger = useCallback(async () => {
    const jeton = localStorage.getItem('accessToken');
    const org = localStorage.getItem('currentOrgId');

    if (!jeton || !org) {
      setErreur('Reconnectez-vous pour voir votre profil');
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
        setErreur(lu.error || 'Impossible de charger votre profil');
        return;
      }

      remplir(lu.data);
      setErreur('');
    } catch {
      setErreur('Le serveur ne répond pas');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
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
        setErreur(lu.error || 'Enregistrement impossible');
        return;
      }

      remplir(lu.data);
      setMessage('Profil enregistré');
    } catch {
      setErreur('Le serveur ne répond pas');
    } finally {
      setEnvoi(false);
    }
  };

  const deposer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreurPiece('');

    if (!piece.type || !piece.documentUrl) {
      setErreurPiece('Choisissez une pièce et donnez son lien');
      return;
    }

    setEnvoiPiece(true);

    try {
      const jeton = localStorage.getItem('accessToken');
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
        setErreurPiece(lu?.error || 'Dépôt impossible');
        return;
      }

      setPiece({ type: '', documentUrl: '', fileName: '', expiryDate: '' });
      await charger();
    } catch {
      setErreurPiece('Le serveur ne répond pas');
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
      setErreurPiece('Le serveur ne répond pas');
    }
  };

  if (chargement) {
    return <div className="p-8 text-gray-400">Chargement…</div>;
  }

  if (!profil) {
    return (
      <div className="p-8">
        <p role="status" className="text-red-400">
          {erreur || 'Profil introuvable'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <Link
          href="/merchant"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-3"
        >
          <ArrowLeft size={16} />
          Mes commerces
        </Link>
        <h1 className="text-2xl font-bold text-white">Mon profil</h1>
        <p className="text-gray-400 text-sm mt-1">
          Ce qui figure sur vos factures, et le compte sur lequel vous êtes payé.
        </p>
      </div>

      {/* Une suspension tient le plus souvent à ce qui manque ici. Le dire, et
          laisser la page utilisable, est toute la différence entre une
          consigne et une impasse. */}
      {profil.status === 'SUSPENDED' && (
        <div
          role="status"
          className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-red-200 text-sm space-y-1"
        >
          <p className="font-semibold">Votre compte est suspendu</p>
          {profil.suspensionReason && <p>Motif : {profil.suspensionReason}</p>}
          <p>
            Votre espace est fermé, mais ce dossier reste ouvert : complétez ce qui manque
            ci-dessous, puis{' '}
            <Link href={`/merchant/${orgId}/support`} className="underline hover:text-red-100">
              prévenez le support
            </Link>
            . C&apos;est la plateforme qui lève la suspension.
          </p>
        </div>
      )}

      {/* Ce qui manque se découvrait le jour où la facture était fausse, ou le
          virement impossible. */}
      {(profil.manquePourFacturer.length > 0 || profil.manquePourEtrePaye.length > 0) && (
        <div
          role="status"
          className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-4 py-3 text-amber-200 text-sm space-y-1"
        >
          {profil.manquePourFacturer.length > 0 && (
            <p>
              <strong>Pour être facturé</strong>, il manque {profil.manquePourFacturer.join(', ')}.
            </p>
          )}
          {profil.manquePourEtrePaye.length > 0 && (
            <p>
              <strong>Pour être payé</strong>, il manque {profil.manquePourEtrePaye.join(', ')}.
            </p>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="text-sm text-green-400">
          {message}
        </p>
      )}
      {erreur && (
        <p role="status" className="text-sm text-red-400">
          {erreur}
        </p>
      )}

      <form onSubmit={enregistrer} className="space-y-6">
        <section className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 size={20} className="text-orange-500" />
            Identité de facturation
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="legalName" className="block text-sm text-gray-400 mb-1">
                Raison sociale
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
              <label htmlFor="registrationNumber" className="block text-sm text-gray-400 mb-1">
                Numéro d&apos;immatriculation
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
              <label htmlFor="billingCountry" className="block text-sm text-gray-400 mb-1">
                Pays
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
              <label htmlFor="vatNumber" className="block text-sm text-gray-400 mb-1">
                Numéro de TVA
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
              <label htmlFor="billingAddress" className="block text-sm text-gray-400 mb-1">
                Adresse de facturation
              </label>
              <AddressAutocomplete
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
              <label htmlFor="billingPostalCode" className="block text-sm text-gray-400 mb-1">
                Code postal
              </label>
              <input
                id="billingPostalCode"
                value={form.billingPostalCode}
                onChange={(e) => setForm({ ...form, billingPostalCode: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="billingCity" className="block text-sm text-gray-400 mb-1">
                Ville
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

        <section className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <User size={20} className="text-orange-500" />
            Le propriétaire du commerce
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ownerFirstName" className="block text-sm text-gray-400 mb-1">
                Prénom
              </label>
              <input
                id="ownerFirstName"
                value={form.ownerFirstName}
                onChange={(e) => setForm({ ...form, ownerFirstName: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="ownerLastName" className="block text-sm text-gray-400 mb-1">
                Nom
              </label>
              <input
                id="ownerLastName"
                value={form.ownerLastName}
                onChange={(e) => setForm({ ...form, ownerLastName: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="ownerEmail" className="block text-sm text-gray-400 mb-1">
                E-mail
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
              <label htmlFor="ownerPhone" className="block text-sm text-gray-400 mb-1">
                Téléphone
              </label>
              <input
                id="ownerPhone"
                value={form.ownerPhone}
                onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="ownerBirthDate" className="block text-sm text-gray-400 mb-1">
                Date de naissance
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

        <section className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Landmark size={20} className="text-orange-500" />
            Compte bancaire
          </h2>

          <p className="text-sm text-gray-400">
            C&apos;est sur ce compte que vos versements sont virés, et il figure sur vos factures.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="iban" className="block text-sm text-gray-400 mb-1">
                IBAN
              </label>
              <input
                id="iban"
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: e.target.value })}
                placeholder={profil.ibanRenseigne ? 'Laissez vide pour ne pas le changer' : 'FR76…'}
                className={CHAMP}
              />
              {/* Il n'est jamais réaffiché : quatre caractères suffisent à
                  reconnaître son compte, et n'en permettent aucun usage. */}
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <CreditCard size={12} />
                {profil.ibanRenseigne
                  ? `Compte enregistré : ${profil.ibanMasque}. Par sécurité, il n'est jamais réaffiché en entier.`
                  : 'Aucun compte enregistré.'}
              </p>
            </div>

            <div>
              <label htmlFor="bic" className="block text-sm text-gray-400 mb-1">
                BIC
              </label>
              <input
                id="bic"
                value={form.bic}
                onChange={(e) => setForm({ ...form, bic: e.target.value })}
                className={CHAMP}
              />
            </div>

            <div>
              <label htmlFor="accountHolder" className="block text-sm text-gray-400 mb-1">
                Titulaire du compte
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
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <section className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          Vos justificatifs
        </h2>

        {profil.documents.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune pièce déposée.</p>
        ) : (
          <ul className="space-y-2">
            {profil.documents.map((document) => {
              const marque = MARQUES[document.status] || MARQUES.PENDING;
              const Icone = marque.icone;

              return (
                <li
                  key={document.id}
                  className="flex items-start justify-between gap-3 rounded bg-gray-700/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{document.libelle}</p>
                    <p className={`text-xs ${marque.classe}`}>{marque.libelle}</p>
                    {document.reviewNote && (
                      <p className="text-xs text-red-300 mt-1">{document.reviewNote}</p>
                    )}
                    <a
                      href={document.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-orange-400 hover:underline break-all"
                    >
                      {document.fileName || document.documentUrl}
                    </a>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Icone size={18} className={marque.classe} />
                    <button
                      type="button"
                      onClick={() => retirer(document.id)}
                      title={`Retirer ${document.libelle}`}
                      className="text-gray-400 hover:text-red-400 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={deposer} className="space-y-3 border-t border-gray-700 pt-4">
          {erreurPiece && (
            <p role="status" className="text-sm text-red-400">
              {erreurPiece}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="piece-type" className="block text-sm text-gray-400 mb-1">
                Pièce à déposer
              </label>
              <select
                id="piece-type"
                value={piece.type}
                onChange={(e) => setPiece({ ...piece, type: e.target.value })}
                className={CHAMP}
              >
                <option value="">Choisir…</option>
                {profil.typesDocument.map((attendue) => (
                  <option key={attendue.type} value={attendue.type}>
                    {attendue.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="piece-expiration" className="block text-sm text-gray-400 mb-1">
                Date d&apos;expiration (si la pièce en a une)
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
              <label htmlFor="piece-lien" className="block text-sm text-gray-400 mb-1">
                Lien vers le document
              </label>
              <input
                id="piece-lien"
                type="url"
                value={piece.documentUrl}
                onChange={(e) => setPiece({ ...piece, documentUrl: e.target.value })}
                placeholder="https://…"
                className={CHAMP}
              />
              {/* L'hébergement de fichiers n'est pas branché : le dire plutôt
                  que de laisser croire à un envoi. */}
              <p className="text-xs text-gray-500 mt-1">
                L&apos;envoi de fichiers n&apos;est pas encore disponible : déposez un lien vers
                votre document.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={envoiPiece}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            <Upload size={16} />
            {envoiPiece ? 'Dépôt…' : 'Déposer la pièce'}
          </button>
        </form>
      </section>
    </div>
  );
}
