'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useProtectedRoute } from '@/lib/use-protected-route';
import { NotificationBell } from '@/components/NotificationBell';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import {
  Scale,
  Flag,
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
  Layers,
  Activity,
  Radio,
  FileText,
  LifeBuoy,
  Users,
  Webhook,
  Banknote,
  Store,
  Truck,
  Download,
  Megaphone,
  LogIn,
  ChevronDown,
  Users2,
  UserCheck,
  ShoppingCart,
  Briefcase,
  MessageCircle,
} from 'lucide-react';

export default function SuperOwnerLayout({ children }: { children: React.ReactNode }) {
  // Sur grand écran, la barre se replie en icônes. Sur téléphone, elle ne
  // tient pas à côté du contenu : c'est un tiroir, fermé par défaut, qui
  // s'ouvre par-dessus la page.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuMobile, setMenuMobile] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['categories', 'members']));
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  const { isReady } = useProtectedRoute(true);
  const t = useTranslations('superowner');

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  // Échap referme le tiroir, comme toute fenêtre posée sur la page.
  useEffect(() => {
    if (!menuMobile) return;
    const fermer = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setMenuMobile(false);
    };
    window.addEventListener('keydown', fermer);
    return () => window.removeEventListener('keydown', fermer);
  }, [menuMobile]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  const navSections = [
    {
      title: null,
      items: [{ label: t('nav.dashboard'), icon: Home, href: '/superowner' }],
    },
    {
      title: t('nav.sectionActivity'),
      items: [
        { label: t('nav.organizations'), icon: Building2, href: '/superowner/organizations' },
        { label: t('nav.stores'), icon: Store, href: '/superowner/stores' },
        { label: t('nav.drivers'), icon: Truck, href: '/superowner/drivers' },
        { label: t('nav.payouts'), icon: Banknote, href: '/superowner/payouts' },
        { label: t('nav.analytics'), icon: TrendingUp, href: '/superowner/analytics' },
        { label: t('nav.billing'), icon: CreditCard, href: '/superowner/billing' },
        { label: t('nav.formules'), icon: Layers, href: '/superowner/formules' },
        { label: t('nav.financialReports'), icon: BarChart3, href: '/superowner/financial-reports' },
        { label: t('nav.exports'), icon: Download, href: '/superowner/exports' },
      ],
    },
    {
      id: 'members',
      title: t('nav.members'),
      icon: Users2,
      items: [
        { label: t('nav.clients'), icon: UserCheck, href: '/superowner/members/clients' },
        { label: t('nav.merchants'), icon: ShoppingCart, href: '/superowner/members/merchants' },
        { label: t('nav.deliveries'), icon: Briefcase, href: '/superowner/members/deliveries' },
      ],
    },
    {
      title: t('nav.sectionSupport'),
      items: [
        { label: t('nav.supportTickets'), icon: LifeBuoy, href: '/superowner/support-tickets' },
        { label: t('nav.driverSupport'), icon: MessageCircle, href: '/superowner/driver-support' },
        { label: t('nav.reviews'), icon: Flag, href: '/superowner/reviews' },
        { label: t('nav.notifications'), icon: Megaphone, href: '/superowner/notifications' },
        { label: t('nav.userManagement'), icon: Users, href: '/superowner/user-management' },
      ],
    },
    {
      title: t('nav.sectionPlatform'),
      items: [
        { label: t('nav.apiKeys'), icon: Key, href: '/superowner/api-keys' },
        { label: t('nav.webhooks'), icon: Webhook, href: '/superowner/webhooks' },
        { label: t('nav.systemConfig'), icon: Settings, href: '/superowner/system-config' },
        { label: t('nav.legalPages'), icon: Scale, href: '/superowner/pages-legales' },
        { label: t('nav.advancedSettings'), icon: Sliders, href: '/superowner/advanced-settings' },
      ],
    },
    {
      title: t('nav.sectionSupervision'),
      items: [
        { label: t('nav.health'), icon: Activity, href: '/superowner/health' },
        { label: t('nav.monitoring'), icon: Radio, href: '/superowner/monitoring' },
        { label: t('nav.dataManagement'), icon: Database, href: '/superowner/data-management' },
        { label: t('nav.securityAudit'), icon: Shield, href: '/superowner/security-audit' },
        { label: t('nav.auditLogs'), icon: FileText, href: '/superowner/audit-logs' },
        { label: t('nav.accessLogs'), icon: LogIn, href: '/superowner/access-logs' },
      ],
    },
  ];

  // Libellés visibles : barre dépliée sur grand écran, ou tiroir ouvert.
  const etendu = sidebarOpen || menuMobile;

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      {/* Voile derrière le tiroir : un toucher à côté le referme. */}
      {menuMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMenuMobile(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform ${
          menuMobile ? 'translate-x-0' : '-translate-x-full'
        } lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? 'lg:w-64' : 'lg:w-20'
        } flex-shrink-0 bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <SelecteurEspace actuel="superowner" href="/superowner" className="gap-3 -m-2 p-2 w-full min-w-0" chevron={etendu}>
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center font-bold">
              <Lock size={20} />
            </div>
            {etendu && <span className="font-bold text-lg">{t('brand')}</span>}
          </SelecteurEspace>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto no-scrollbar">
          {navSections.map((section, index) => {
            const isCollapsible = section.id;
            const isExpanded = isCollapsible ? expandedSections.has(section.id) : true;

            return (
              <div key={section.title ?? `section-${index}`} className="space-y-1">
                {etendu && section.title && (
                  isCollapsible ? (
                    <button
                      onClick={() => isCollapsible && toggleSection(section.id)}
                      className="w-full flex items-center justify-between px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-400 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        {section.icon && <section.icon size={16} />}
                        {section.title}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                      />
                    </button>
                  ) : (
                    <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {section.title}
                    </p>
                  )
                )}
                {isExpanded && section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={etendu ? undefined : item.label}
                      onClick={() => setMenuMobile(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-red-600/20 text-red-400 font-medium'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      <item.icon size={20} className="flex-shrink-0" />
                      {etendu && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}

        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-900/20 transition-colors text-red-400"
          >
            <LogOut size={20} />
            {etendu && <span>{t('logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      {/* min-w-0 : sans lui, un tableau large élargit toute la page au lieu
          de défiler dans son cadre. */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-gray-800 border-b border-gray-700 px-4 lg:px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={() => setMenuMobile(!menuMobile)}
            aria-label={t('openMenu')}
            aria-expanded={menuMobile}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors lg:hidden"
          >
            {menuMobile ? <X size={24} /> : <Menu size={24} />}
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={t('toggleSidebar')}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors hidden lg:inline-flex"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-4 min-w-0">
            <div className="text-sm text-gray-400 hidden sm:flex items-center gap-2">
              <Lock size={16} className="text-red-600" />
              {t('headerTitle')}
            </div>
            {/* La cloche suit la plateforme partout : un ticket ouvert pendant
                qu'on consulte les journaux doit se voir sans changer de page. */}
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
