'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X, Home, DollarSign, FileText, BarChart3, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SelecteurEspace } from '@/components/SelecteurEspace';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Relu à chaque changement de page : le layout reste monté d'une page à
  // l'autre, et une déconnexion doit faire disparaître la barre livreur.
  useEffect(() => {
    const token = localStorage.getItem('driverToken');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, [pathname]);

  // Connexion et inscription portent la navbar globale : la barre livreur
  // s'y ajouterait par-dessus (ancien jeton encore en mémoire).
  const pageSansSession = pathname === '/driver/login' || pathname === '/driver/signup';
  const afficherBarre = isAuthenticated && !pageSansSession;

  const navItems = [
    { href: '/driver', label: 'Tableau de bord', icon: Home },
    { href: '/driver/earnings', label: 'Revenus', icon: DollarSign },
    { href: '/driver/analytics', label: 'Statistiques', icon: BarChart3 },
    { href: '/driver/deliveries', label: 'Historique', icon: FileText },
    { href: '/driver/support', label: 'Support', icon: MessageCircle },
  ];

  // L'accueil /driver préfixe toutes les pages : il ne s'allume que sur lui-même.
  const isActive = (href: string) =>
    href === '/driver' ? pathname === href : pathname === href || pathname?.startsWith(href + '/');

  const handleLogout = () => {
    localStorage.removeItem('driverToken');
    router.push('/driver/login');
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-900" />;
  }

  return (
    <>
      <div className="min-h-screen bg-gray-900">
        {/* Mobile Navigation - Afficher uniquement si authentifié */}
        {afficherBarre && (
          <nav className="md:hidden bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
            <div className="flex items-center justify-between p-4">
              <SelecteurEspace actuel="driver" href="/driver" className="gap-2 -ml-2 px-2 py-1">
                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                  DR
                </div>
                <span className="font-bold text-white">Livreur</span>
              </SelecteurEspace>

              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 hover:bg-gray-700 rounded-lg"
                >
                  {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
              <div className="border-t border-gray-700 pb-4 space-y-2">
                {navItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 transition ${
                        isActive(item.href)
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Icon size={20} />
                      {item.label}
                    </Link>
                  );
                })}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 transition"
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
          <nav className="hidden md:block bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
              <SelecteurEspace actuel="driver" href="/driver" className="gap-2 -ml-2 px-2 py-1">
                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                  DR
                </div>
                <span className="font-bold text-white text-lg">Espace Livreur</span>
              </SelecteurEspace>

              <div className="flex items-center gap-4">
                {navItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                        isActive(item.href)
                          ? 'bg-orange-600 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
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
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition"
                >
                  <LogOut size={18} />
                  Déconnexion
                </button>
                <LanguageSwitcher />
              </div>
            </div>
          </nav>
        )}

        {/* Main Content */}
        <main>{children}</main>
      </div>
    </>
  );
}
