'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X, Home, DollarSign, FileText, BarChart3, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { AlertesCourseLivreur } from '@/components/AlertesCourseLivreur';
import { useStockageLocal } from '@/lib/navigateur';
import { fermerSessionPartout } from '@/lib/sso';
import { useTranslations } from 'next-intl';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('espaceLivreur');
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Relu à chaque rendu, donc à chaque changement de page : le layout reste
  // monté d'une page à l'autre, et une déconnexion doit faire disparaître la
  // barre livreur. `undefined` tant que le navigateur n'a pas été lu.
  const token = useStockageLocal('driverToken');
  const isAuthenticated = !!token;
  const isLoading = token === undefined;

  // Connexion et inscription portent la navbar globale : la barre livreur
  // s'y ajouterait par-dessus (ancien jeton encore en mémoire).
  const pageSansSession = pathname === '/driver/login' || pathname === '/driver/signup';
  const afficherBarre = isAuthenticated && !pageSansSession;

  const navItems = [
    { href: '/driver', label: t('tableau'), icon: Home },
    { href: '/driver/earnings', label: t('revenus'), icon: DollarSign },
    { href: '/driver/analytics', label: t('statistiques'), icon: BarChart3 },
    { href: '/driver/deliveries', label: t('historique'), icon: FileText },
    { href: '/driver/support', label: t('support'), icon: MessageCircle },
  ];

  // L'accueil /driver préfixe toutes les pages : il ne s'allume que sur lui-même.
  const isActive = (href: string) =>
    href === '/driver' ? pathname === href : pathname === href || pathname?.startsWith(href + '/');

  const handleLogout = () => {
    // Ferme la session sur tous les domaines, puis l'efface d'ici — jeton de
    // compte compris : laissé en place, il gardait l'espace ouvert ailleurs.
    fermerSessionPartout();
    localStorage.removeItem('driverToken');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    router.push('/driver/login');
  };

  if (isLoading) {
    return <div className="min-h-screen bg-[#F7F7F6]" />;
  }

  return (
    <>
      <div className="min-h-screen bg-[#F7F7F6] text-gray-900">
        {/* Mobile Navigation - Afficher uniquement si authentifié */}
        {afficherBarre && (
          <nav className="md:hidden bg-white border-b border-[#ECECEA] sticky top-0 z-40">
            <div className="flex items-center justify-between p-4">
              <SelecteurEspace actuel="driver" href="/driver" clair className="gap-2 -ml-2 px-2 py-1">
                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                  DR
                </div>
                <span className="font-bold text-gray-900">{t('livreur')}</span>
              </SelecteurEspace>

              <div className="flex items-center gap-2">
                <LanguageSwitcher clair />
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
              <div className="border-t border-[#ECECEA] px-2 pb-4 pt-2 space-y-1">
                {navItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-[10px] px-4 py-3 transition ${
                        isActive(item.href)
                          ? 'bg-orange-50 font-bold text-orange-700'
                          : 'font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon size={20} />
                      {item.label}
                    </Link>
                  );
                })}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 rounded-[10px] px-4 py-3 font-semibold text-red-700 transition hover:bg-red-50"
                >
                  <LogOut size={20} />
                  Déconnexion
                </button>
              </div>
            )}
          </nav>
        )}

        {/* Desktop Navigation - Afficher uniquement si authentifié */}
        {afficherBarre && (
          <nav className="hidden md:block bg-white border-b border-[#ECECEA] sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
              <SelecteurEspace actuel="driver" href="/driver" clair className="gap-2 -ml-2 px-2 py-1">
                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                  DR
                </div>
                <span className="font-bold text-gray-900 text-lg">{t('espace')}</span>
              </SelecteurEspace>

              <div className="flex items-center gap-4">
                {navItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-full transition ${
                        isActive(item.href)
                          ? 'bg-orange-50 font-bold text-orange-700'
                          : 'font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="hidden lg:inline">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-red-700 transition hover:bg-red-50"
                >
                  <LogOut size={18} />
                  Déconnexion
                </button>
                <LanguageSwitcher clair />
              </div>
            </div>
          </nav>
        )}

        {/* Main Content */}
        {afficherBarre && <AlertesCourseLivreur />}
        <main>{children}</main>
      </div>
    </>
  );
}
