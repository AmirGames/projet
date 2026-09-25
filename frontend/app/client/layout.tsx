'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, ShoppingCart, Heart, User, Menu, X, LogOut } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PaniersAccueil } from '@/components/PaniersAccueil';
import { BandeauCommandeEnCours } from '@/components/BandeauCommandeEnCours';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { useAuth } from '@/lib/auth-context';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { logout } = useAuth();

  // Un simple lien vers /login laissait la session ouverte : on revenait
  // connecté au premier clic sur « Accueil ».
  const seDeconnecter = () => {
    setMobileMenuOpen(false);
    logout();
    router.push('/');
  };

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
            <SelecteurEspace actuel="client" href="/client" className="gap-2 -ml-2 px-2 py-1">
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                Z
              </div>
              <span className="font-bold text-white">Zupone</span>
            </SelecteurEspace>

            <div className="flex items-center gap-2">
              <PaniersAccueil />
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
                onClick={seDeconnecter}
                className="flex w-full items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 transition"
              >
                <LogOut size={20} />
                Déconnexion
              </button>
            </div>
          )}
        </nav>

        {/* Desktop Navigation */}
        <nav className="hidden md:block bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <SelecteurEspace actuel="client" href="/client" className="gap-2 -ml-2 px-2 py-1">
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
                Z
              </div>
              <span className="font-bold text-white text-lg">Zupone</span>
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
              <PaniersAccueil />
              <button
                onClick={seDeconnecter}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition"
              >
                Déconnexion
              </button>
              <LanguageSwitcher />
            </div>
          </div>
        </nav>

        <BandeauCommandeEnCours />

        {/* Main Content */}
        <main>{children}</main>

        {/* Footer : seulement des pages qui existent. */}
        <footer className="bg-gray-800 border-t border-gray-700 mt-20">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-8">
              <div>
                <h3 className="text-white font-bold mb-4">Zupone</h3>
                <p className="text-gray-400 text-sm">
                  La plateforme qui relie commerçants, clients et livreurs de proximité.
                </p>
              </div>
              <div>
                <h3 className="text-white font-bold mb-4">Commander</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><Link href="/restaurants" className="text-gray-400 hover:text-white">Commerces</Link></li>
                  <li><Link href="/client/orders" className="text-gray-400 hover:text-white">Mes commandes</Link></li>
                  <li><Link href="/track" className="text-gray-400 hover:text-white">Suivre une commande</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-bold mb-4">Rejoindre</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><Link href="/merchant/register" className="text-gray-400 hover:text-white">Devenir commerçant</Link></li>
                  <li><Link href="/driver/signup" className="text-gray-400 hover:text-white">Devenir livreur</Link></li>
                </ul>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-8 text-center text-gray-400 text-sm">
              <p>&copy; {new Date().getFullYear()} Zupone. Tous droits réservés.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
