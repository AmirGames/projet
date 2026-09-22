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
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-sm text-white">
              Z
            </div>
            <span className="font-bold text-lg hidden sm:inline text-slate-900">Zupone</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <LanguageSwitcher />
            <Link href="/" className="text-slate-700 hover:text-primary font-medium transition">
              Accueil
            </Link>
            {!user ? (
              <>
                <Link href="/restaurants" className="text-slate-700 hover:text-primary font-medium transition">
                  {t('restaurants')}
                </Link>
                <Link href="/login" className="px-4 py-2 bg-white border border-slate-200 text-slate-900 hover:border-slate-300 rounded-full transition font-medium">
                  {t('login')}
                </Link>
                <Link href="/signup" className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-full transition font-medium">
                  {t('signup')}
                </Link>
              </>
            ) : (
              <>
                <Link href={lienEspace} className="text-slate-700 hover:text-primary font-medium transition">
                  {t('dashboard')}
                </Link>
                {user.isSuperOwner && (
                  <Link href="/superowner" className="px-3 py-1 bg-primary hover:bg-primary-hover text-white rounded-lg transition font-medium text-sm">
                    👑 {t('superOwner')}
                  </Link>
                )}
                <NotificationBell />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg transition font-medium"
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
            className="md:hidden p-2 hover:bg-slate-100 text-slate-900 rounded-lg"
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
            <Link
              href="/"
              className="block px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
            >
              Accueil
            </Link>
            {!user ? (
              <>
                <Link
                  href="/restaurants"
                  className="block px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                >
                  {t('restaurants')}
                </Link>
                <Link
                  href="/login"
                  className="block px-4 py-2 bg-white border border-slate-200 text-slate-900 hover:border-slate-300 rounded-lg font-medium"
                >
                  {t('login')}
                </Link>
                <Link
                  href="/signup"
                  className="block px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium"
                >
                  {t('signup')}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={lienEspace}
                  className="block px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                >
                  {t('dashboard')}
                </Link>
                {user.isSuperOwner && (
                  <Link
                    href="/superowner"
                    className="block px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium"
                  >
                    👑 {t('superOwner')}
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg font-medium"
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
