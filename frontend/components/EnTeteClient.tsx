'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, ShoppingCart, Heart, User, Menu, X, LogOut, LogIn, Store } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PaniersAccueil } from '@/components/PaniersAccueil';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { useAuth } from '@/lib/auth-context';
import { useTranslations } from 'next-intl';
import { LogoClient } from '@/components/client/LogoClient';

/**
 * L'en-tête blanc du parcours client : logo, onglets (accueil, favoris,
 * commandes, profil), paniers, connexion et langue.
 *
 * Partagé par l'espace /client, la vitrine d'un commerce, le tunnel de
 * commande et le suivi : le client garde les mêmes repères d'un écran à
 * l'autre.
 */
export function EnTeteClient() {
  const t = useTranslations('enTeteClient');
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
    { href: '/client', label: t('nav.accueil'), icon: Home },
    { href: '/restaurants', label: t('nav.boutiques'), icon: Store },
    { href: '/client/favorites', label: t('nav.favoris'), icon: Heart },
    { href: '/client/orders', label: t('nav.commandes'), icon: ShoppingCart },
    { href: '/client/profile', label: t('nav.profil'), icon: User },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile Navigation */}
      <nav className="md:hidden bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between p-4">
          <SelecteurEspace actuel="client" href="/client" clair className="gap-2 -ml-2 px-2 py-1">
            <LogoClient />
          </SelecteurEspace>

          <div className="flex items-center gap-2">
            <PaniersAccueil />
            <LanguageSwitcher clair />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? t('fermerMenu') : t('ouvrirMenu')}
              aria-expanded={mobileMenuOpen}
              className="rounded-xl p-2 text-gray-900 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
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
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF7A00] ${
                    isActive(item.href)
                      ? 'bg-[#FFF0E0] text-[#7C3500] font-bold'
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
                {t('deconnexion')}
              </button>
            )}
            {!isLoading && !user && (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center gap-3 px-4 py-3 font-semibold text-[#A94F00] transition hover:bg-[#FFF6EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF7A00]"
              >
                <LogIn size={20} />
                {t('connexion')}
              </Link>
            )}
          </div>
        )}
      </nav>

      {/* Desktop Navigation */}
      <nav className="hidden md:block bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <SelecteurEspace actuel="client" href="/client" clair className="gap-2 -ml-2 px-2 py-1">
            <LogoClient />
          </SelecteurEspace>

          <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2 ${
                    isActive(item.href)
                      ? 'bg-[#FF7A00] text-black shadow-xs'
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
            <PaniersAccueil />
            {!isLoading && user && (
              <button
                onClick={seDeconnecter}
                className="px-4 py-2 rounded-full text-sm text-gray-700 font-semibold hover:bg-gray-100 transition"
              >
                {t('deconnexion')}
              </button>
            )}
            {!isLoading && !user && (
              <Link
                href="/login"
                className="px-5 py-2 bg-gray-900 hover:bg-gray-800 rounded-full text-sm text-white font-semibold transition"
              >
                {t('connexion')}
              </Link>
            )}
            <LanguageSwitcher clair />
          </div>
        </div>
      </nav>
    </>
  );
}

