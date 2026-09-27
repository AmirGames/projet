'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const DPO = 'dpo@zupeat.com';

interface Apercu {
  coursesEnCours: number;
  montantDu: number;
  versementLe: string | null;
  ibanValide: boolean;
  ibanFin: string | null;
  demandeeLe: string | null;
  /** Le compte ZupOne reste : client ZupEat toujours, commerçant s'il en a un. */
  restent?: { client: boolean; commercant: boolean };
}

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const jour = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Brussels' });

/**
 * Supprimer son compte livreur depuis le site.
 *
 * L'application le permet (Paramètres › Vos données) ; Google Play exige en
 * plus une page web, pour qui ne l'a plus. Le livreur s'identifie, voit ce
 * que la suppression implique — en particulier le dernier versement de ses
 * courses, qui n'est pas perdu — puis confirme.
 */
export default function SuppressionCompte() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [jeton, setJeton] = useState('');
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState('');

  const identifier = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const connexion = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: motDePasse }),
      });
      const compte = await connexion.json().catch(() => ({}));
      if (!connexion.ok || !compte.accessToken) {
        setErreur(compte.error || 'E-mail ou mot de passe incorrect.');
        return;
      }
      const reponse = await fetch(`${API_URL}/api/drivers/me/suppression`, {
        headers: { Authorization: `Bearer ${compte.accessToken}` },
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (reponse.status === 404) {
        setErreur(`Ce compte n’est pas un compte livreur. Pour supprimer un autre compte, écrivez à ${DPO}.`);
        return;
      }
      if (!reponse.ok) {
        setErreur(donnees.error || 'Impossible de lire votre compte. Réessayez dans un instant.');
        return;
      }
      setJeton(compte.accessToken);
      setMotDePasse('');
      setApercu(donnees.data);
    } catch {
      setErreur('Impossible de joindre le serveur. Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    setErreur('');
    setEnCours(true);
    try {
      const reponse = await fetch(`${API_URL}/api/drivers/me/suppression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ motif: motif.trim() || undefined }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.error || 'La demande n’a pas abouti. Réessayez dans un instant.');
        return;
      }
      setFait(donnees.message || 'Votre compte est désactivé.');
      setJeton('');
    } catch {
      setErreur('Impossible de joindre le serveur. Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  };

  const bloque = apercu ? apercu.coursesEnCours > 0 || (apercu.montantDu > 0 && !apercu.ibanValide) : false;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-lg w-full max-w-lg">
        <Trash2 size={40} className="mx-auto text-primary mb-3" />
        <h1 className="text-3xl font-bold text-slate-900 mb-2 text-center">Supprimer mon compte livreur</h1>

        {fait ? (
          <div className="space-y-4 text-slate-700">
            <div className="bg-green-50 border border-green-200 text-green-900 p-4 rounded-lg">{fait}</div>
            <p className="text-sm text-slate-500">
              Vous pouvez encore vous connecter pour suivre ce versement. Une question : {DPO}.
            </p>
          </div>
        ) : (
          <>
            <div className="text-slate-600 text-sm space-y-3 mb-6">
              <p>
                Vous supprimez uniquement votre <strong>compte livreur</strong>.{' '}
                <strong>Votre compte client ZupEat reste actif</strong> : vous pourrez toujours commander avec la même
                adresse e-mail et le même mot de passe. Vous pouvez aussi faire la demande depuis l’application :{' '}
                <em>Paramètres › Vos données › Supprimer mon compte livreur</em>.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Votre compte livreur est désactivé aussitôt : plus de courses, plus de notifications livreur.</li>
                <li>
                  <strong>Ce qui vous est dû n’est pas perdu.</strong> Les courses de la semaine (du lundi 00 h 00 au
                  dimanche 23 h 59) sont versées avec les paiements du lundi suivant, sur votre IBAN.
                </li>
                <li>
                  Vos données de livreur (pièces, véhicule, IBAN, position) sont ensuite supprimées sous 30 jours.
                  Seules restent celles que la loi nous oblige à garder : courses payées et pièces comptables (10 ans).
                </li>
              </ul>
            </div>

            {erreur && <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">{erreur}</div>}

            {!apercu ? (
              <form onSubmit={identifier} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    Adresse e-mail du compte
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="mot-de-passe" className="block text-sm font-medium text-slate-700 mb-1">
                    Mot de passe
                  </label>
                  <input
                    id="mot-de-passe"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={enCours}
                  className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-lg transition disabled:opacity-60"
                >
                  {enCours ? 'Vérification…' : 'Continuer'}
                </button>
                <p className="text-sm text-slate-500 text-center">
                  Mot de passe perdu ?{' '}
                  <Link href="/mot-de-passe-oublie" className="text-primary font-medium">
                    Le réinitialiser
                  </Link>{' '}
                  ou écrivez à {DPO}.
                </p>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-sm text-slate-700 space-y-1">
                  {apercu.coursesEnCours > 0 ? (
                    <p className="text-red-800">
                      Vous avez une course en cours : terminez-la ou annulez-la dans l’application, puis revenez ici.
                    </p>
                  ) : apercu.montantDu > 0 ? (
                    apercu.ibanValide ? (
                      <p>
                        Il vous reste <strong>{euros(apercu.montantDu)}</strong> à recevoir. Ils vous seront versés avec
                        les paiements du <strong>{apercu.versementLe ? jour(apercu.versementLe) : 'lundi'}</strong>, sur
                        votre compte •••{apercu.ibanFin}.
                      </p>
                    ) : (
                      <p className="text-red-800">
                        Il vous reste <strong>{euros(apercu.montantDu)}</strong> à recevoir, mais aucun IBAN valide
                        n’est enregistré : ajoutez-le dans l’application (Mon compte › Mes versements) ou dans
                        votre espace livreur, puis revenez ici.
                      </p>
                    )
                  ) : (
                    <p>Aucun versement en attente.</p>
                  )}
                  <p className="text-green-800">
                    {apercu.restent?.commercant
                      ? 'Votre compte client ZupEat et votre espace commerçant restent actifs.'
                      : 'Votre compte client ZupEat reste actif.'}
                  </p>
                </div>

                <div>
                  <label htmlFor="motif" className="block text-sm font-medium text-slate-700 mb-1">
                    Pourquoi partez-vous ? (facultatif)
                  </label>
                  <textarea
                    id="motif"
                    maxLength={500}
                    rows={3}
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="button"
                  onClick={supprimer}
                  disabled={enCours || bloque}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                >
                  {enCours ? 'Envoi…' : 'Supprimer mon compte livreur'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
