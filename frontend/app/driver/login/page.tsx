'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, AlertCircle, Bike } from 'lucide-react';
import { confierSessionCentrale, demanderSessionCentrale } from '@/lib/sso';
import { ENTETE_TRANSPORT } from '@/lib/jeton-session';

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
    const token = localStorage.getItem('driverToken');
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
      localStorage.setItem('driverToken', data.accessToken);
      localStorage.setItem('accessToken', data.accessToken);
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
    <div className="min-h-screen bg-linear-to-b from-white to-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white border border-gray-200 rounded-3xl shadow-lg p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-12 h-12 bg-orange-600 text-white rounded-xl flex items-center justify-center">
              <Bike size={24} aria-hidden="true" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">{t('connexion.titre')}</h1>
          <p className="text-gray-400 text-center mb-8">{t('connexion.sousTitre')}</p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
              <AlertCircle size={20} className="text-red-600 shrink-0" />
              <p className="text-red-900 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-gray-700 text-sm font-semibold mb-2">{t('connexion.email')}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-3 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('connexion.exempleEmail')}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-gray-700 text-sm font-semibold mb-2">{t('connexion.motDePasse')}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-3 text-gray-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-full transition"
            >
              {loading ? t('connexion.encours') : t('connexion.seConnecter')}
            </button>
          </form>

          {/* Footer */}
          <p className="text-gray-400 text-center text-sm mt-8">
            {t('connexion.pasInscrit')}{' '}
            <Link href="/driver/signup" className="text-primary hover:text-primary-hover font-medium transition">
              {t('connexion.inscrire')}
            </Link>
          </p>

          <p className="text-gray-500 text-center text-xs mt-6 border-t border-gray-200 pt-6">
            {t('connexion.besoinAide')}{' '}
            <Link href="/" className="text-primary hover:text-primary-hover font-medium transition">
              {t('connexion.contacter')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
