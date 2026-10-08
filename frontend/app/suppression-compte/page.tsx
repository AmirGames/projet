'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

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
const jour = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Brussels' });

/**
 * Supprimer son compte livreur depuis le site.
 *
 * L'application le permet (Paramètres › Vos données) ; Google Play exige en
 * plus une page web, pour qui ne l'a plus. Le livreur s'identifie, voit ce
 * que la suppression implique — en particulier le dernier versement de ses
 * courses, qui n'est pas perdu — puis confirme.
 */
export default function SuppressionCompte() {
  const t = useTranslations('suppressionCompte');
  const locale = useLocale();
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
        setErreur(compte.error || t('identifiantsIncorrects'));
        return;
      }
      const reponse = await fetch(`${API_URL}/api/drivers/me/suppression`, {
        headers: { Authorization: `Bearer ${compte.accessToken}` },
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (reponse.status === 404) {
        setErreur(t('pasLivreur', { dpo: DPO }));
        return;
      }
      if (!reponse.ok) {
        setErreur(donnees.error || t('lectureImpossible'));
        return;
      }
      setJeton(compte.accessToken);
      setMotDePasse('');
      setApercu(donnees.data);
    } catch {
      setErreur(t('injoignable'));
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
        setErreur(donnees.error || t('demandeEchouee'));
        return;
      }
      setFait(donnees.message || t('desactiveOk'));
      setJeton('');
    } catch {
      setErreur(t('injoignable'));
    } finally {
      setEnCours(false);
    }
  };

  const bloque = apercu ? apercu.coursesEnCours > 0 || (apercu.montantDu > 0 && !apercu.ibanValide) : false;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-lg w-full max-w-lg">
        <Trash2 size={40} className="mx-auto text-primary mb-3" />
        <h1 className="text-3xl font-bold text-slate-900 mb-2 text-center">{t('titre')}</h1>

        {fait ? (
          <div className="space-y-4 text-slate-700">
            <div className="bg-green-50 border border-green-200 text-green-900 p-4 rounded-lg">{fait}</div>
            <p className="text-sm text-slate-500">
              {t('suivreVersement', { dpo: DPO })}
            </p>
          </div>
        ) : (
          <>
            <div className="text-slate-600 text-sm space-y-3 mb-6">
              <p>
                {t.rich('intro', { b: (c) => <strong>{c}</strong>, i: (c) => <em>{c}</em> })}
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>{t('desactive')}</li>
                <li>
                  {t.rich('duNonPerdu', { b: (c) => <strong>{c}</strong> })}
                </li>
                <li>
                  {t('donnees')}
                </li>
              </ul>
            </div>

            {erreur && <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">{erreur}</div>}

            {!apercu ? (
              <form onSubmit={identifier} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    {t('emailCompte')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="mot-de-passe" className="block text-sm font-medium text-slate-700 mb-1">
                    {t('motDePasse')}
                  </label>
                  <input
                    id="mot-de-passe"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={enCours}
                  className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-lg transition disabled:opacity-60"
                >
                  {enCours ? t('verification') : t('continuer')}
                </button>
                <p className="text-sm text-slate-500 text-center">
                  {t('motDePassePerdu')}{' '}
                  <Link href="/mot-de-passe-oublie" className="text-primary font-medium">
                    {t('reinitialiser')}
                  </Link>{' '}
                  {t('ouEcrivez', { dpo: DPO })}
                </p>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-sm text-slate-700 space-y-1">
                  {apercu.coursesEnCours > 0 ? (
                    <p className="text-red-800">
                      {t('courseEnCours')}
                    </p>
                  ) : apercu.montantDu > 0 ? (
                    apercu.ibanValide ? (
                      <p>
                        {t.rich('resteAVerser', {
                          montant: euros(apercu.montantDu),
                          jour: apercu.versementLe ? jour(apercu.versementLe, locale) : t('lundi'),
                          iban: apercu.ibanFin ?? '',
                          b: (c) => <strong>{c}</strong>,
                        })}
                      </p>
                    ) : (
                      <p className="text-red-800">
                        {t.rich('resteSansIban', { montant: euros(apercu.montantDu), b: (c) => <strong>{c}</strong> })}
                      </p>
                    )
                  ) : (
                    <p>{t('aucunVersement')}</p>
                  )}
                  <p className="text-green-800">
                    {apercu.restent?.commercant
                      ? t('restentDeux')
                      : t('resteClient')}
                  </p>
                </div>

                <div>
                  <label htmlFor="motif" className="block text-sm font-medium text-slate-700 mb-1">
                    {t('pourquoi')}
                  </label>
                  <textarea
                    id="motif"
                    maxLength={500}
                    rows={3}
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-primary"
                  />
                </div>

                <button
                  type="button"
                  onClick={supprimer}
                  disabled={enCours || bloque}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                >
                  {enCours ? t('envoi') : t('titre')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
