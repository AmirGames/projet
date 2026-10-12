'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, AlertCircle, Bike, ArrowLeft } from 'lucide-react';
import { confierSessionCentrale, demanderSessionCentrale } from '@/lib/sso';
import { ENTETE_TRANSPORT, jetonAcces, poserJeton } from '@/lib/jeton-session';
import { EnTeteMarque } from '@/components/EnTeteMarque';
import { EMAIL_CONTACT } from '@/lib/editeur';

import { useTranslations } from 'next-intl';

export default function DriverLoginPage() {
  const t = useTranslations('driverAuth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Si le livreur est déjà loggé, le rediriger vers son dashboard
    const token = jetonAcces();
    if (token) {
      router.push('/driver');
      return;
    }
    // Connecté sur un autre domaine du site : zupone.com transmet la session.
    demanderSessionCentrale('/driver');
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Par le site lui-même : le cookie de renouvellement doit être posé ici.
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ENTETE_TRANSPORT },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || 'Login failed');
      }

      const data = await response.json();
      poserJeton(data.accessToken);
      localStorage.setItem('driverUser', JSON.stringify(data.user));

      // En passant par zupone.com, qui garde la session pour les autres domaines.
      if (await confierSessionCentrale(data.accessToken, '/driver')) return;
      router.push('/driver');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('connexion.erreur'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <EnTeteMarque marque="zupeat" href="/devenir-livreur">
      <Link href="/devenir-livreur" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
        <ArrowLeft size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Devenir livreur</span>
        <span className="sm:hidden">Retour</span>
      </Link>
      <Link href="/driver/signup" className="rounded-full bg-[#FF7A00] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#E66E00] hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">
        Créer un compte
      </Link>
    </EnTeteMarque>
    <main className="flex min-h-[calc(100dvh-56px)] items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#fff0df_0,_#faf9f7_44%,_#f5f5f4_100%)] px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="rounded-[2rem] border border-black/5 bg-white p-7 shadow-[0_24px_80px_-36px_rgba(0,0,0,.28)] sm:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#FF7A00] text-black">
              <Bike size={24} aria-hidden="true" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">{t('connexion.titre')}</h1>
          <p className="mb-8 text-center text-gray-600">{t('connexion.sousTitre')}</p>

          {error && (
            <div role="alert" className="mb-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertCircle size={20} className="text-red-600 shrink-0" />
              <p className="text-red-900 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="driver-login-email" className="mb-2 block text-sm font-semibold text-gray-800">{t('connexion.email')}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-3 text-gray-500" />
                <input
                  id="driver-login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('connexion.exempleEmail')}
                  className="w-full rounded-2xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 transition focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="driver-login-password" className="mb-2 block text-sm font-semibold text-gray-800">{t('connexion.motDePasse')}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-3 text-gray-500" />
                <input
                  id="driver-login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 transition focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20"
                  required
                />
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#FF7A00] py-3.5 font-bold text-black transition hover:bg-[#E66E00] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            >
              {loading ? t('connexion.encours') : t('connexion.seConnecter')}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-sm text-gray-600">
            {t('connexion.pasInscrit')}{' '}
            <Link href="/driver/signup" className="font-semibold text-gray-900 underline underline-offset-4 transition hover:text-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
              {t('connexion.inscrire')}
            </Link>
          </p>

          <div className="mt-6 border-t border-gray-200 pt-5 text-center text-sm text-gray-600">
            <p>{t('connexion.besoinAide')}</p>
            <a
              href={`mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent('Aide à la connexion livreur ZupEat')}`}
              className="mt-1 inline-block font-semibold text-gray-900 underline underline-offset-4 transition hover:text-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
            >
              {t('connexion.contacter')} · {EMAIL_CONTACT}
            </a>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

