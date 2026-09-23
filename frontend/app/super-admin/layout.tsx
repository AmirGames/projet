'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useProtectedRoute } from '@/lib/use-protected-route';
import { NotificationBell } from '@/components/NotificationBell';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import {
  BarChart3,
  Users,
  AlertCircle,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  FileText,
  Download,
  Shield,
  Bell,
  Eye,
  Lock,
} from 'lucide-react';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  const { isReady } = useProtectedRoute(true);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { label: 'Dashboard', icon: Home, href: '/super-admin' },
    { label: 'Commerçants', icon: Users, href: '/super-admin/merchants' },
    { label: 'Support', icon: AlertCircle, href: '/super-admin/tickets' },
    { label: 'Analytics', icon: BarChart3, href: '/super-admin/analytics' },
    { label: 'Commissions', icon: CreditCard, href: '/super-admin/commissions' },
    { label: 'Utilisateurs', icon: Shield, href: '/super-admin/user-management' },
    { label: 'Admins', icon: Users, href: '/super-admin/admin-management' },
    { label: 'Audit', icon: FileText, href: '/super-admin/audit-logs' },
    { label: 'Accès', icon: Eye, href: '/super-admin/access-logs' },
    { label: 'Export', icon: Download, href: '/super-admin/exports' },
    { label: 'Notifications', icon: Bell, href: '/super-admin/notifications' },
    { label: 'Paramètres', icon: Settings, href: '/super-admin/settings' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center font-bold">
              SA
            </div>
            {sidebarOpen && <span className="font-bold text-lg">SuperAdmin</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarOpen ? undefined : item.label}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-red-600/20 text-red-400 font-medium'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <item.icon size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}

          {/* Les deux espaces d'administration sont distincts : sans ce lien,
              les pages SuperOwner restent inatteignables depuis ici. */}
          <div className="pt-3 mt-3 border-t border-gray-700">
            <Link
              href="/superowner"
              title={sidebarOpen ? undefined : 'Espace SuperOwner'}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-red-400 hover:bg-red-900/20"
            >
              <Lock size={20} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">Espace SuperOwner</span>}
            </Link>
          </div>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-900/20 transition-colors text-red-400"
          >
            <LogOut size={20} />
            {sidebarOpen && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Super Admin - Gestion Système</span>
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
