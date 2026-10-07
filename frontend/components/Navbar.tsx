'use client';

import Link from '@/components/LienRegional';
import { accueilDe } from '@/lib/domaines';
import { usePathname, useRouter } from 'next/navigation';
import { MARQUES } from '@/lib/marques';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = useTranslations('nav');
  // Le dossier et les trajets du chauffeur sont ZupDrive, pas ZupEat.
  const estZupDrive = /^(\/[a-z]{2}-[a-z]{2})?\/(chauffeur|trajet)(\/|$)/i.test(pathname ?? '');
  const marque = MARQUES[estZupDrive ? 'zupdrive' : 'zupeat'];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-100 text-gray-900 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-gray-900 hover:no-underline">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-sm ${marque.logo}`}>
              Z
            </div>
            <span className="font-extrabold tracking-tight text-xl hidden sm:inline">{marque.nom}</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {!user ? (
              <>
                <Link href={accueilDe('public')} className="font-semibold text-gray-700 hover:text-gray-900 transition">
                  {t('restaurants')}
                </Link>
                <Link href="/login" className="px-4 py-2 rounded-full text-sm font-semibold text-gray-900 hover:bg-gray-100 transition">
                  {t('login')}
                </Link>
                <Link href="/signup" className="px-5 py-2 rounded-full text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition">
                  {t('signup')}
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="font-semibold text-gray-700 hover:text-gray-900 transition">
                  {t('dashboard')}
                </Link>
                {user.isSuperOwner && (
                  <Link href="/superowner" className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition font-medium text-sm">
                    👑 {t('superOwner')}
                  </Link>
                )}
                <NotificationBell clair />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
                >
                  <LogOut size={18} />
                  {t('logout')}
                </button>
              </>
            )}
            <LanguageSwitcher clair />
          </div>

          {/* Mobile : langue toujours visible, à côté du bouton menu */}
          <div className="md:hidden flex items-center gap-2">
            <LanguageSwitcher clair />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-2">
            {!user ? (
              <>
                <Link
                  href={accueilDe('public')}
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  {t('restaurants')}
                </Link>
                <Link
                  href="/login"
                  className="block px-4 py-2 rounded-lg font-semibold text-gray-900 hover:bg-gray-100"
                >
                  {t('login')}
                </Link>
                <Link
                  href="/signup"
                  className="block px-4 py-2 rounded-lg font-semibold text-white bg-gray-900 hover:bg-gray-800"
                >
                  {t('signup')}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
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
                  className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-red-600 hover:bg-red-50"
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
