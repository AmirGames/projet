'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { Store, Bike, Crown, ShoppingCart } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Page d'accueil des utilisateurs connectés.
 *
 * Gère les redirections intelligentes :
 * - Si un seul rôle (commerçant OU livreur) et pas superowner → redirection auto
 * - Si multiple rôles OU superowner → affiche un sélecteur visuel
 */
export default function DashboardPage() {
  const t = useTranslations('tableauDeBord');
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [roles, setRoles] = useState<any>(null);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const estSuperOwner = user?.isSuperOwner;

  const fetchRoles = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/auth/me/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setRoles(data.roles);

        const isMerchant = data.roles?.merchant?.active;
        const isDriver = data.roles?.driver?.active;
        const isCustomer = data.roles?.customer?.active;

        // Compter les rôles actifs
        const activeRoles = [isMerchant, isDriver, isCustomer].filter(Boolean).length;

        // Redirection automatique si un seul rôle (et pas superowner)
        if (!estSuperOwner && activeRoles === 1) {
          if (isMerchant) {
            router.push('/merchant');
          } else if (isDriver) {
            router.push('/driver');
          } else if (isCustomer) {
            router.push('/client/orders');
          }
        }
        // Sinon, on affiche le choix
      }
    } catch (error) {
      signalerErreur('Failed to fetch roles:', error);
    } finally {
      setRolesLoading(false);
    }
  }, [router, estSuperOwner]);

  useEffectChargement(() => {
    if (user && !isLoading) {
      fetchRoles();
    }
  }, [user, isLoading, fetchRoles]);

  const isMerchant = roles?.merchant?.active ?? false;
  const isDriver = roles?.driver?.active ?? false;
  const isCustomer = roles?.customer?.active ?? false;
  const isSuperOwner = user?.isSuperOwner ?? false;

  // Vérifier si au moins un rôle est actif
  const hasAnyRole = isMerchant || isDriver || isCustomer || isSuperOwner;

  // Compter les rôles actifs (pour déterminer si on doit afficher le dashboard)
  const activeRolesCount = [isMerchant, isDriver, isCustomer, isSuperOwner].filter(Boolean).length;

  if (isLoading || rolesLoading) {
    return (
      <div className="min-h-screen bg-[#F7F7F6] text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">{t('chargement')}</p>
        </div>
      </div>
    );
  }

  if (!hasAnyRole) {
    return (
      <div className="min-h-screen bg-[#F7F7F6] text-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{t('aucunRole')}</h1>
          <p className="text-gray-500 mb-8">
            {t('aucunRoleTexte')}
          </p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition">
            {t('retour')}
          </Link>
        </div>
      </div>
    );
  }

  // Redirection automatique si un seul rôle actif (sauf si superowner)
  if (!isSuperOwner && activeRolesCount === 1) {
    return (
      <div className="min-h-screen bg-[#F7F7F6] text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">{t('redirection')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F6] text-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">{t('bienvenue', { email: user?.email ?? '' })}</h1>
          <p className="text-gray-500">{t('selection')}</p>
        </div>

        <div className={`grid gap-8 ${activeRolesCount >= 3 ? 'grid-cols-1 md:grid-cols-3' : activeRolesCount === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {isMerchant && (
            <Link
              href="/merchant"
              className="group bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-blue-600 group-hover:bg-blue-700 text-white rounded-lg mb-6 mx-auto transition">
                <Store size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">{t('commerces')}</h2>
              <p className="text-gray-500 text-center mb-6 text-sm">
                {t('commercesTexte')}
              </p>
              <div className="flex items-center justify-center gap-2 text-blue-600 group-hover:text-blue-700 font-semibold transition">
                {t('commercesLien')}
              </div>
            </Link>
          )}

          {isDriver && (
            <Link
              href="/driver"
              className="group bg-white border-2 border-gray-200 hover:border-orange-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-orange-600 group-hover:bg-orange-700 text-white rounded-lg mb-6 mx-auto transition">
                <Bike size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">{t('livraisons')}</h2>
              <p className="text-gray-500 text-center mb-6 text-sm">
                {t('livraisonsTexte')}
              </p>
              <div className="flex items-center justify-center gap-2 text-orange-600 group-hover:text-orange-700 font-semibold transition">
                {t('livraisonsLien')}
              </div>
            </Link>
          )}

          {isCustomer && (
            <Link
              href="/client/orders"
              className="group bg-white border-2 border-gray-200 hover:border-green-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-green-600 group-hover:bg-green-700 text-white rounded-lg mb-6 mx-auto transition">
                <ShoppingCart size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">{t('commandes')}</h2>
              <p className="text-gray-500 text-center mb-6 text-sm">
                {t('commandesTexte')}
              </p>
              <div className="flex items-center justify-center gap-2 text-green-600 group-hover:text-green-700 font-semibold transition">
                {t('commandesLien')}
              </div>
            </Link>
          )}

          {isSuperOwner && (
            <Link
              href="/superowner"
              className="group bg-white border-2 border-gray-200 hover:border-purple-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-purple-600 group-hover:bg-purple-700 text-white rounded-lg mb-6 mx-auto transition">
                <Crown size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">{t('admin')}</h2>
              <p className="text-gray-500 text-center mb-6 text-sm">
                {t('adminTexte')}
              </p>
              <div className="flex items-center justify-center gap-2 text-purple-600 group-hover:text-purple-700 font-semibold transition">
                {t('adminLien')}
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
