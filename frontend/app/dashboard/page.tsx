'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { Store, Bike, Crown, ShoppingCart } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Page d'accueil des utilisateurs connectés.
 *
 * Gère les redirections intelligentes :
 * - Si un seul rôle (commerçant OU livreur) et pas superowner → redirection auto
 * - Si multiple rôles OU superowner → affiche un sélecteur visuel
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [roles, setRoles] = useState<any>(null);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

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
        if (!user?.isSuperOwner && activeRoles === 1) {
          if (isMerchant) {
            router.push('/merchant');
          } else if (isDriver) {
            router.push('/driver');
          }
        }
        // Sinon, on affiche le choix
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setRolesLoading(false);
    }
  }, [router, user?.isSuperOwner]);

  useEffect(() => {
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }

  if (!hasAnyRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Aucun rôle trouvé</h1>
          <p className="text-slate-400 mb-8">Aucun rôle n'est actif pour votre compte.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  // Redirection automatique si un seul rôle actif (sauf si superowner)
  if (!isSuperOwner && activeRolesCount === 1 && !isCustomer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Redirection vers votre espace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-white mb-3">Bienvenue, {user?.email}</h1>
          <p className="text-slate-400">Sélectionnez l'espace que vous souhaitez gérer</p>
        </div>

        <div className={`grid gap-8 ${activeRolesCount >= 3 ? 'grid-cols-1 md:grid-cols-3' : activeRolesCount === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {isMerchant && (
            <Link
              href="/merchant"
              className="group bg-slate-800 border-2 border-slate-700 hover:border-blue-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-blue-600 group-hover:bg-blue-700 rounded-lg mb-6 mx-auto transition">
                <Store size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center mb-2">Mes commerces</h2>
              <p className="text-slate-400 text-center mb-6 text-sm">
                Gérez vos boutiques, produits, commandes et livreurs
              </p>
              <div className="flex items-center justify-center gap-2 text-blue-400 group-hover:text-blue-300 font-semibold transition">
                Accéder aux commerces →
              </div>
            </Link>
          )}

          {isDriver && (
            <Link
              href="/driver"
              className="group bg-slate-800 border-2 border-slate-700 hover:border-orange-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-orange-600 group-hover:bg-orange-700 rounded-lg mb-6 mx-auto transition">
                <Bike size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center mb-2">Mes livraisons</h2>
              <p className="text-slate-400 text-center mb-6 text-sm">
                Consultez vos courses, revenus et votre historique
              </p>
              <div className="flex items-center justify-center gap-2 text-orange-400 group-hover:text-orange-300 font-semibold transition">
                Voir mes courses →
              </div>
            </Link>
          )}

          {isCustomer && (
            <Link
              href="/client/orders"
              className="group bg-slate-800 border-2 border-slate-700 hover:border-green-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-green-600 group-hover:bg-green-700 rounded-lg mb-6 mx-auto transition">
                <ShoppingCart size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center mb-2">Mes commandes</h2>
              <p className="text-slate-400 text-center mb-6 text-sm">
                Consultez vos commandes, favoris et votre profil
              </p>
              <div className="flex items-center justify-center gap-2 text-green-400 group-hover:text-green-300 font-semibold transition">
                Voir mes commandes →
              </div>
            </Link>
          )}

          {isSuperOwner && (
            <Link
              href="/superowner"
              className="group bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-8 transition transform hover:scale-105 cursor-pointer"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-purple-600 group-hover:bg-purple-700 rounded-lg mb-6 mx-auto transition">
                <Crown size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center mb-2">Administration</h2>
              <p className="text-slate-400 text-center mb-6 text-sm">
                Gérez l'ensemble de la plateforme, utilisateurs et paramètres
              </p>
              <div className="flex items-center justify-center gap-2 text-purple-400 group-hover:text-purple-300 font-semibold transition">
                Accéder à l'admin →
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
