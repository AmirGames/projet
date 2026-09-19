'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';
import { espaceDAccueil } from '@/lib/espace-utilisateur';

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = useTranslations('nav');

  // Un seul lien « Dashboard », qui mène à l'espace correspondant au compte :
  // /dashboard renvoyait vers l'ancienne interface commerçant.
  const lienEspace = espaceDAccueil({
    isSuperOwner: user?.isSuperOwner,
    orgId: (user as any)?.organizationId || (typeof window !== 'undefined' ? localStorage.getItem('currentOrgId') : null),
  });

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">
              ST
            </div>
            <span className="font-bold text-lg hidden sm:inline">SaaS</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <LanguageSwitcher />
            {!user ? (
              <>
                <Link href="/restaurants" className="text-gray-300 hover:text-white transition">
                  {t('restaurants')}
                </Link>
                <Link href="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium">
                  {t('login')}
                </Link>
                <Link href="/signup" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition font-medium">
                  {t('signup')}
                </Link>
              </>
            ) : (
              <>
                <Link href={lienEspace} className="text-gray-300 hover:text-white transition">
                  {t('dashboard')}
                </Link>
                {user.isSuperOwner && (
                  <Link href="/superowner" className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition font-medium text-sm">
                    👑 {t('superOwner')}
                  </Link>
                )}
                <NotificationBell />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition text-white"
                >
                  <LogOut size={18} />
                  {t('logout')}
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-gray-700 rounded-lg"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <div className="px-4 py-2">
              <LanguageSwitcher />
            </div>
            {!user ? (
              <>
                <Link
                  href="/restaurants"
                  className="block px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg"
                >
                  {t('restaurants')}
                </Link>
                <Link
                  href="/login"
                  className="block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
                >
                  {t('login')}
                </Link>
                <Link
                  href="/signup"
                  className="block px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
                >
                  {t('signup')}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={lienEspace}
                  className="block px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg"
                >
                  {t('dashboard')}
                </Link>
                {user.isSuperOwner && (
                  <Link
                    href="/superowner"
                    className="block px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium text-white"
                  >
                    👑 {t('superOwner')}
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white"
                >
                  <LogOut size={18} />
                  {t('logout')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
