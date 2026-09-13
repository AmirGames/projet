'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
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
  LogOut,
  Menu,
  X,
  Home,
  Star,
} from 'lucide-react';

// Pages directes de /merchant ; tout autre segment est un orgId.
const STATIC_SEGMENTS = ['orders', 'register'];

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    // Get orgId from URL or localStorage
    const searchParams = new URLSearchParams(window.location.search);
    const id = searchParams.get('orgId') || localStorage.getItem('currentOrgId') || '';
    setOrgId(id);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentOrgId');
    router.push('/login');
  };

  // Les routes /merchant/[orgId]/* ont déjà leur propre navigation : sans cela,
  // les deux layouts s'empilent et affichent deux barres latérales.
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 1 && !STATIC_SEGMENTS.includes(segments[1])) {
    return <>{children}</>;
  }

  const navItems = [
    { label: 'Dashboard', icon: Home, href: '/merchant' },
    { label: 'Produits', icon: Package, href: `/merchant/${orgId}` },
    { label: 'Catégories', icon: Zap, href: `/merchant/${orgId}/categories` },
    { label: 'Commandes', icon: ShoppingCart, href: `/merchant/${orgId}/orders` },
    { label: 'Clients', icon: Users, href: `/merchant/${orgId}/customers` },
    { label: 'Avis', icon: Star, href: `/merchant/${orgId}/reviews` },
    { label: 'Zones de livraison', icon: MapPin, href: `/merchant/${orgId}/delivery-zones` },
    { label: 'Méthodes de paiement', icon: CreditCard, href: `/merchant/${orgId}/payment-methods` },
    { label: 'Staff', icon: Users2, href: `/merchant/${orgId}/staff` },
    { label: 'Factures', icon: FileText, href: `/merchant/${orgId}/invoices` },
    { label: 'Support', icon: MessageCircle, href: `/merchant/${orgId}/support` },
    { label: 'Paramètres', icon: Settings, href: `/merchant/${orgId}/settings` },
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
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center font-bold">
              M
            </div>
            {sidebarOpen && <span className="font-bold text-lg">Merchant</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
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
          <div className="text-sm text-gray-400">Gestion du Commerce</div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
