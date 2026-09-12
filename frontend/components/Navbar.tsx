'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X, LogOut, User, Home, BarChart3, Shield } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UserInfo {
  id: string;
  email: string;
  name?: string;
  isSystemAdmin?: boolean;
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        return;
      }

      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('storeId');
    router.push('/login');
  };

  const isActive = (path: string) => pathname === path;

  // Ne pas montrer la navbar sur les pages login/signup
  if (pathname.includes('/login') || pathname.includes('/signup')) {
    return null;
  }

  return (
    <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                🚀
              </div>
              <span className="hidden sm:inline">SaaS Shop</span>
            </Link>

            {/* Desktop Menu */}
            {user && (
              <div className="hidden md:flex items-center gap-4">
                <Link
                  href="/"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive('/')
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <Home size={18} />
                  <span>Accueil</span>
                </Link>

                <Link
                  href="/dashboard"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive('/dashboard')
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <BarChart3 size={18} />
                  <span>Dashboard</span>
                </Link>

                {/* Admin Panel */}
                <Link
                  href="/admin"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    pathname.includes('/admin') && !pathname.includes('/super-admin')
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <Shield size={18} />
                  <span>Admin</span>
                </Link>

                {/* Super Admin */}
                {user.isSystemAdmin && (
                  <Link
                    href="/super-admin"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      pathname.includes('/super-admin')
                        ? 'bg-red-600 text-white'
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <Shield size={18} />
                    <span className="font-bold">Super Admin</span>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {/* User Info */}
            {user && (
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-sm text-right">
                  <p className="font-medium">{user.name || user.email}</p>
                  {user.isSystemAdmin && (
                    <p className="text-xs text-red-400 font-bold">Super Admin</p>
                  )}
                </div>
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <User size={16} />
                </div>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Logout */}
            {user && (
              <button
                onClick={handleLogout}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
              >
                <LogOut size={18} />
                <span>Déco</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && user && (
          <div className="md:hidden pb-4 space-y-2 border-t border-gray-700 pt-4">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isActive('/')
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Home size={18} />
              <span>Accueil</span>
            </Link>

            <Link
              href="/dashboard"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isActive('/dashboard')
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <BarChart3 size={18} />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/admin"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                pathname.includes('/admin') && !pathname.includes('/super-admin')
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Shield size={18} />
              <span>Admin</span>
            </Link>

            {user.isSystemAdmin && (
              <Link
                href="/super-admin"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  pathname.includes('/super-admin')
                    ? 'bg-red-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Shield size={18} />
                <span className="font-bold">Super Admin</span>
              </Link>
            )}

            <button
              onClick={() => {
                handleLogout();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
            >
              <LogOut size={18} />
              <span>Déconnexion</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
