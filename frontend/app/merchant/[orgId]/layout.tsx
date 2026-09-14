'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';
import { StoreSwitcher } from '@/components/StoreSwitcher';
import { CurrentStoreProvider } from '@/lib/current-store';
import {
  Package,
  ShoppingCart,
  Users,
  MessageCircle,
  Zap,
  CreditCard,
  Users2,
  FileText,
  MapPin,
  Settings,
  Tags,
  Image as ImageIcon,
  Search,
  Bell,
  LogOut,
  Menu,
  X,
  Home,
  Star,
  AlertCircle,
  Clock,
  Percent,
  Megaphone,
  Receipt,
  BarChart3,
  Timer,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OrgStatus {
  id: string;
  name?: string;
  status: string;
  suspensionReason?: string;
  suspensionDate?: string;
  closureReason?: string;
  closureDate?: string;
  closedUntil?: string;
}

export default function MerchantStoreLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [orgStatus, setOrgStatus] = useState<OrgStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const orgId = params?.orgId as string;

  useEffect(() => {
    fetchOrgStatus();
  }, [orgId]);

  const fetchOrgStatus = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;
      const data = await response.json();
      setOrgStatus(data);
    } catch (error) {
      console.error('Error fetching org status:', error);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentOrgId');
    router.push('/login');
  };

  const getDaysUntilDelete = () => {
    if (!orgStatus?.closedUntil) return null;
    const now = new Date();
    const deadline = new Date(orgStatus.closedUntil);
    const days = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  const navSections = [
    {
      title: null,
      items: [{ label: 'Dashboard', icon: Home, href: `/merchant/${orgId}/dashboard` }],
    },
    {
      title: 'Ventes',
      items: [
        { label: 'Commandes', icon: ShoppingCart, href: `/merchant/${orgId}/orders` },
        { label: 'Clients', icon: Users, href: `/merchant/${orgId}/customers` },
        { label: 'Avis', icon: Star, href: `/merchant/${orgId}/reviews` },
      ],
    },
    {
      title: 'Catalogue',
      items: [
        { label: 'Produits', icon: Package, href: `/merchant/${orgId}/products` },
        { label: 'Catégories', icon: Zap, href: `/merchant/${orgId}/categories` },
        { label: 'Promotions', icon: Percent, href: `/merchant/${orgId}/promotions` },
        { label: 'Étiquettes', icon: Tags, href: `/merchant/${orgId}/product-tags` },
        { label: 'Photos produits', icon: ImageIcon, href: `/merchant/${orgId}/product-media` },
        { label: 'Référencement', icon: Search, href: `/merchant/${orgId}/product-seo` },
      ],
    },
    {
      title: 'Boutique',
      items: [
        { label: 'Horaires', icon: Timer, href: `/merchant/${orgId}/store-hours` },
        { label: 'Zones de livraison', icon: MapPin, href: `/merchant/${orgId}/delivery-zones` },
        { label: 'Méthodes de paiement', icon: CreditCard, href: `/merchant/${orgId}/payment-methods` },
        { label: 'Taxes', icon: Receipt, href: `/merchant/${orgId}/tax-settings` },
      ],
    },
    {
      title: 'Gestion',
      items: [
        { label: 'Analytics', icon: BarChart3, href: `/merchant/${orgId}/analytics` },
        { label: 'Rapports', icon: FileText, href: `/merchant/${orgId}/reports` },
        { label: 'Marketing', icon: Megaphone, href: `/merchant/${orgId}/marketing` },
        { label: 'Staff', icon: Users2, href: `/merchant/${orgId}/staff` },
        { label: 'Factures', icon: FileText, href: `/merchant/${orgId}/invoices` },
        { label: 'Notifications', icon: Bell, href: `/merchant/${orgId}/notifications` },
        { label: 'Support', icon: MessageCircle, href: `/merchant/${orgId}/support` },
        { label: 'Paramètres', icon: Settings, href: `/merchant/${orgId}/settings` },
      ],
    },
  ];

  return (
    <CurrentStoreProvider orgId={orgId}>
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col fixed left-0 top-0 bottom-0 z-40`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center font-bold flex-shrink-0">
              {orgStatus?.name?.charAt(0).toUpperCase() || 'M'}
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{orgStatus?.name || 'Ma Boutique'}</p>
                <p className="text-xs text-gray-400">Commerçant</p>
              </div>
            )}
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
                        ? 'bg-orange-600/20 text-orange-400 font-medium'
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
            <LogOut size={20} className="flex-shrink-0" />
            {sidebarOpen && <span className="truncate">Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Top Bar */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-4">
            <StoreSwitcher />
            <NotificationBell />
          </div>
        </header>

        {/* Status Banner */}
        {!loadingStatus && orgStatus && orgStatus.status !== 'ACTIVE' && (
          <div className={`${
            orgStatus.status === 'SUSPENDED'
              ? 'bg-yellow-500/10 border-yellow-500/50'
              : 'bg-red-500/10 border-red-500/50'
          } border-b px-6 py-4`}>
            <div className="flex items-start gap-3">
              <AlertCircle
                size={20}
                className={orgStatus.status === 'SUSPENDED' ? 'text-yellow-400' : 'text-red-400 mt-1'}
              />
              <div className="flex-1">
                <h3 className={`font-bold ${orgStatus.status === 'SUSPENDED' ? 'text-yellow-400' : 'text-red-400'}`}>
                  {orgStatus.status === 'SUSPENDED'
                    ? 'Compte temporairement suspendu'
                    : 'Compte fermé'}
                </h3>
                <p className="text-sm text-gray-300 mt-1">
                  {orgStatus.status === 'SUSPENDED'
                    ? `Raison: ${orgStatus.suspensionReason || 'Non spécifiée'}`
                    : `Raison: ${orgStatus.closureReason || 'Non spécifiée'}`}
                </p>

                {orgStatus.status === 'CLOSED' && orgStatus.closedUntil && (
                  <div className="text-sm text-gray-300 mt-2 flex items-center gap-2">
                    <Clock size={16} />
                    <span>
                      Données supprimées dans {getDaysUntilDelete()} jours. Contactez le support pour restaurer votre compte.
                    </span>
                  </div>
                )}

                {orgStatus.status === 'SUSPENDED' && (
                  <p className="text-sm text-gray-300 mt-2">
                    Veuillez contacter le support pour réactiver votre compte.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
    </CurrentStoreProvider>
  );
}
