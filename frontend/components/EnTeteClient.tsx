'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, ShoppingCart, Heart, User, Menu, X, LogOut, LogIn } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PaniersAccueil } from '@/components/PaniersAccueil';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { useAuth } from '@/lib/auth-context';

/**
 * L'en-tête blanc du parcours client : logo, onglets (accueil, favoris,
 * commandes, profil), paniers, connexion et langue.
 *
 * Partagé par l'espace /client, la vitrine d'un commerce, le tunnel de
 * commande et le suivi : le client garde les mêmes repères d'un écran à
 * l'autre.
 */
export function EnTeteClient() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { logout, user, isLoading } = useAuth();

  // Un simple lien vers /login laissait la session ouverte : on revenait
  // connecté au premier clic sur « Accueil ».
  //
  // Retour direct à /client : « / » y menait aussi, mais après deux
  // redirections (région, puis réécriture), d'où une déconnexion qui
  // semblait lente.
  const seDeconnecter = () => {
    setMobileMenuOpen(false);
    logout();
    router.replace('/client');
  };

  const navItems = [
    { href: '/client', label: 'Accueil', icon: Home },
    { href: '/client/favorites', label: 'Favoris', icon: Heart },
    { href: '/client/orders', label: 'Commandes', icon: ShoppingCart },
    { href: '/client/profile', label: 'Profil', icon: User },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile Navigation */}
      <nav className="md:hidden bg-white/95 backdrop-blur border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between p-4">
          <SelecteurEspace actuel="client" href="/client" clair className="gap-2 -ml-2 px-2 py-1">
            <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center font-extrabold text-sm text-white">
              Z
            </div>
            <span className="font-extrabold tracking-tight text-gray-900">ZupEat</span>
          </SelecteurEspace>

          <div className="flex items-center gap-2">
            <PaniersAccueil clair />
            <LanguageSwitcher clair />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-gray-100 pb-4 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 transition ${
                    isActive(item.href)
                      ? 'bg-gray-100 text-gray-900 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={20} />
                  {item.label}
                </Link>
              );
            })}
            {/* Le bouton suit la session : toujours affiché, il laissait
                croire, une fois déconnecté, qu'on l'était encore. */}
            {!isLoading && user && (
              <button
                onClick={seDeconnecter}
                className="flex w-full items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition"
              >
                <LogOut size={20} />
                Déconnexion
              </button>
            )}
            {!isLoading && !user && (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center gap-3 px-4 py-3 font-semibold text-orange-600 hover:bg-orange-50 transition"
              >
                <LogIn size={20} />
                Connexion
              </Link>
            )}
          </div>
        )}
      </nav>

      {/* Desktop Navigation */}
      <nav className="hidden md:block bg-white/95 backdrop-blur border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <SelecteurEspace actuel="client" href="/client" clair className="gap-2 -ml-2 px-2 py-1">
            <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center font-extrabold text-sm text-white">
              Z
            </div>
            <span className="font-extrabold tracking-tight text-gray-900 text-xl">ZupEat</span>
          </SelecteurEspace>

          <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                    isActive(item.href)
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <PaniersAccueil clair />
            {!isLoading && user && (
              <button
                onClick={seDeconnecter}
                className="px-4 py-2 rounded-full text-sm text-gray-700 font-semibold hover:bg-gray-100 transition"
              >
                Déconnexion
              </button>
            )}
            {!isLoading && !user && (
              <Link
                href="/login"
                className="px-5 py-2 bg-gray-900 hover:bg-gray-800 rounded-full text-sm text-white font-semibold transition"
              >
                Connexion
              </Link>
            )}
            <LanguageSwitcher clair />
          </div>
        </div>
      </nav>
    </>
  );
}
