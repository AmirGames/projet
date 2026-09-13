'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { NotificationBell } from './NotificationBell';

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            {!user ? (
              <>
                <Link href="/restaurants" className="text-gray-300 hover:text-white transition">
                  Restaurants
                </Link>
                <Link href="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium">
                  Connexion
                </Link>
                <Link href="/signup" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition font-medium">
                  S'inscrire
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="text-gray-300 hover:text-white transition">
                  Dashboard
                </Link>
                {user.isSuperOwner && (
                  <Link href="/superowner" className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition font-medium text-sm">
                    👑 Super Owner
                  </Link>
                )}
                <NotificationBell />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition text-white"
                >
                  <LogOut size={18} />
                  Logout
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
            {!user ? (
              <>
                <Link
                  href="/restaurants"
                  className="block px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg"
                >
                  Restaurants
                </Link>
                <Link
                  href="/login"
                  className="block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
                >
                  Connexion
                </Link>
                <Link
                  href="/signup"
                  className="block px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
                >
                  S'inscrire
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg"
                >
                  Dashboard
                </Link>
                {user.isSuperOwner && (
                  <Link
                    href="/superowner"
                    className="block px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium text-white"
                  >
                    👑 Super Owner
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
