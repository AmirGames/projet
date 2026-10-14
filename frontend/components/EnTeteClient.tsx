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

  const liensPublics = [
    { href: '/restaurants', label: t('nav.restaurants') },
    { href: '/client#comment-ca-marche', label: t('nav.commentCaMarche') },
    { href: '/devenir-commercant', label: t('nav.devenirPartenaire') },
    { href: '/devenir-livreur', label: t('nav.devenirLivreur') },
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
            <div className="my-2 border-t border-gray-100 pt-2">
              {liensPublics.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-orange-50 hover:text-[#D94B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF5A00]">
                  {item.label}
                </Link>
              ))}
            </div>
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
      <nav className="sticky top-0 z-40 hidden border-b border-neutral-200/80 bg-white/95 backdrop-blur-xl md:block">
        <div className="mx-auto flex min-h-[4.25rem] max-w-7xl items-center justify-between gap-5 px-6">
          <SelecteurEspace actuel="client" href="/client" clair className="shrink-0 gap-2 -ml-2 px-2 py-1">
            <LogoClient />
          </SelecteurEspace>

          <div className="flex min-w-0 items-center justify-center gap-1.5">
            {liensPublics.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A00] focus-visible:ring-offset-2 ${isActive(item.href) ? 'bg-orange-50 text-[#D94B00]' : 'text-neutral-700 hover:bg-neutral-100 hover:text-black'}`}>
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <PaniersAccueil />
            {!isLoading && user && (
              <button
                onClick={seDeconnecter}
                className="rounded-full px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
              >
                {t('deconnexion')}
              </button>
            )}
            {!isLoading && !user && (
              <Link
                href="/login"
                className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-800 transition hover:border-neutral-500 hover:bg-neutral-50"
              >
                {t('connexion')}
              </Link>
            )}
            <LanguageSwitcher clair />
            <Link href="/restaurants" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#FF5A00] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#E64D00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A00] focus-visible:ring-offset-2">
              {t('nav.commander')}<span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}

