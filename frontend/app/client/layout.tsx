'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingCart, Heart, User, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/client', label: 'Accueil', icon: Home },
    { href: '/client/favorites', label: 'Favoris', icon: Heart },
    { href: '/client/orders', label: 'Commandes', icon: ShoppingCart },
    { href: '/client/profile', label: 'Profil', icon: User },
  ];

  const isActive = (href: string) => pathname === href;

  /**
   * Le panier global a disparu avec l'ancien tunnel.
   *
   * Le site tient un panier **par commerce** (`lib/paniers.ts`) : un
   * fournisseur de panier unique enveloppait ces pages sans que personne ne le
   * lise, et laissait croire à deux systèmes de panier concurrents.
   */
  return (
    <>
      <div className="min-h-screen bg-gray-900">
        {/* Mobile Navigation */}
        <nav className="md:hidden bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
          <div className="flex items-center justify-between p-4">
            <Link href="/client" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                UE
              </div>
              <span className="font-bold text-white">UberEats</span>
            </Link>

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
            </div>
          )}
        </nav>

        {/* Desktop Navigation */}
        <nav className="hidden md:block bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/client" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                UE
              </div>
              <span className="font-bold text-white text-lg">UberEats Like</span>
            </Link>

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
              <Link
                href="/login"
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition"
              >
                Logout
              </Link>
              <LanguageSwitcher />
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main>{children}</main>

        {/* Footer */}
        <footer className="bg-gray-800 border-t border-gray-700 mt-20">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
              <div>
                <h3 className="text-white font-bold mb-4">Entreprise</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><a href="#" className="hover:text-white">À propos</a></li>
                  <li><a href="#" className="hover:text-white">Carrière</a></li>
                  <li><a href="#" className="hover:text-white">Blog</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-bold mb-4">Support</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><a href="#" className="hover:text-white">FAQ</a></li>
                  <li><a href="#" className="hover:text-white">Contact</a></li>
                  <li><a href="#" className="hover:text-white">Signaler un problème</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-bold mb-4">Légal</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><a href="#" className="hover:text-white">CGU</a></li>
                  <li><a href="#" className="hover:text-white">Confidentialité</a></li>
                  <li><a href="#" className="hover:text-white">Cookies</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-bold mb-4">Nous suivre</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><a href="#" className="hover:text-white">Facebook</a></li>
                  <li><a href="#" className="hover:text-white">Twitter</a></li>
                  <li><a href="#" className="hover:text-white">Instagram</a></li>
                </ul>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-8 text-center text-gray-400 text-sm">
              <p>&copy; 2024 UberEats Like. Tous droits réservés.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
