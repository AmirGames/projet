'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useProtectedRoute } from '@/lib/use-protected-route';
import {
  Home,
  Building2,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  BarChart3,
  Database,
  Shield,
  Lock,
  Sliders,
  TrendingUp,
  Key,
  FileText,
  LifeBuoy,
  Users,
  Webhook,
  Store,
  Download,
  Megaphone,
  LogIn,
} from 'lucide-react';

export default function SuperOwnerLayout({ children }: { children: React.ReactNode }) {
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

  const navSections = [
    {
      title: null,
      items: [{ label: 'Dashboard', icon: Home, href: '/superowner' }],
    },
    {
      title: 'Activité',
      items: [
        { label: 'Organisations', icon: Building2, href: '/superowner/organizations' },
        { label: 'Boutiques', icon: Store, href: '/superowner/stores' },
        { label: 'Analytics', icon: TrendingUp, href: '/superowner/analytics' },
        { label: 'Facturation', icon: CreditCard, href: '/superowner/billing' },
        { label: 'Rapports', icon: BarChart3, href: '/superowner/financial-reports' },
        { label: 'Exports', icon: Download, href: '/superowner/exports' },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Tickets', icon: LifeBuoy, href: '/superowner/support-tickets' },
        { label: 'Annonces', icon: Megaphone, href: '/superowner/notifications' },
        { label: 'Administrateurs', icon: Users, href: '/superowner/user-management' },
      ],
    },
    {
      title: 'Plateforme',
      items: [
        { label: 'Clés API', icon: Key, href: '/superowner/api-keys' },
        { label: 'Webhooks', icon: Webhook, href: '/superowner/webhooks' },
        { label: 'Configuration', icon: Settings, href: '/superowner/system-config' },
        { label: 'Avancé', icon: Sliders, href: '/superowner/advanced-settings' },
      ],
    },
    {
      title: 'Supervision',
      items: [
        { label: 'Données', icon: Database, href: '/superowner/data-management' },
        { label: 'Sécurité', icon: Shield, href: '/superowner/security-audit' },
        { label: 'Journal', icon: FileText, href: '/superowner/audit-logs' },
        { label: 'Connexions', icon: LogIn, href: '/superowner/access-logs' },
      ],
    },
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
              <Lock size={20} />
            </div>
            {sidebarOpen && <span className="font-bold text-lg">SuperOwner</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto no-scrollbar">
          {navSections.map((section, index) => (
            <div key={section.title ?? `section-${index}`} className="space-y-1">
              {sidebarOpen && section.title && (
                <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
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
            </div>
          ))}

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
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <Lock size={16} className="text-red-600" />
            SuperOwner - Gestion Complète
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
