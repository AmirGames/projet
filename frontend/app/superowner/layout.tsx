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
import { AccesPlateforme, chargerAcces, sectionDuChemin } from '@/lib/acces-plateforme';
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
  ShieldCheck,
  UserCircle,
  Terminal,
  Car,
  Navigation,
  Euro,
  UtensilsCrossed,
  AlertTriangle,
} from 'lucide-react';

/** Les plateformes que l'espace administre ; les sections sans plateforme sont communes. */
type Plateforme = 'EAT' | 'DRIVE';
const PLATEFORMES: Plateforme[] = ['EAT', 'DRIVE'];
const CLE_PLATEFORME = 'superowner.plateforme';

interface EntreeMenu {
  label: string;
  icon: typeof Home;
  href: string;
  section: string | null;
}

interface SectionMenu {
  id?: string;
  title: string | null;
  icon?: typeof Home;
  /** Absente : section commune à ZupEat et ZupDrive (équipe, technique, supervision). */
  plateforme?: Plateforme;
  items: EntreeMenu[];
}

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
  const tRoles = useTranslations('superownerRoles');
  const [acces, setAcces] = useState<AccesPlateforme | null>(null);
  // La plateforme choisie à l'onglet, gardée pour les pages communes (profil,
  // supervision…), qui n'appartiennent à aucune des deux.
  // Lu dès le départ : le premier rendu, serveur comme client, n'est que
  // l'écran de chargement (accès pas encore connus), donc sans écart
  // d'hydratation.
  const [choix, setChoix] = useState<Plateforme | null>(() => {
    try {
      const lu = typeof window === 'undefined' ? null : localStorage.getItem(CLE_PLATEFORME);
      return lu === 'EAT' || lu === 'DRIVE' ? lu : null;
    } catch {
      // Stockage indisponible : on retombe sur la page affichée.
      return null;
    }
  });
  useEffect(() => {
    if (!choix) return;
    try {
      localStorage.setItem(CLE_PLATEFORME, choix);
    } catch {
      // Sans stockage, le choix vaut pour cette visite.
    }
  }, [choix]);

  // Ce que le rôle du compte ouvre : le menu n'affiche que cela, et une page
  // hors de son périmètre est remplacée par un refus. Le serveur, lui,
  // refuse de toute façon.
  useEffect(() => {
    if (!isReady) return;
    let actif = true;
    chargerAcces()
      .then((a) => actif && setAcces(a))
      .catch(() => actif && setAcces({ isSuperOwner: false, role: '', permissions: {} }));
    return () => {
      actif = false;
    };
  }, [isReady]);

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

  if (!isReady || !acces) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Chaque section appartient à ZupEat, à ZupDrive, ou aux deux (commune) :
  // l'onglet de plateforme n'affiche que la sienne, suivie des communes.
  const navSections: SectionMenu[] = [
    {
      title: null,
      plateforme: 'EAT',
      items: [{ label: t('nav.dashboard'), icon: Home, href: '/superowner', section: 'dashboard' }],
    },
    {
      title: t('nav.sectionActivity'),
      plateforme: 'EAT',
      items: [
        { label: t('nav.organizations'), icon: Building2, href: '/superowner/organizations', section: 'organizations' },
        { label: t('nav.stores'), icon: Store, href: '/superowner/stores', section: 'stores' },
        { label: t('nav.drivers'), icon: Truck, href: '/superowner/drivers', section: 'drivers' },
        { label: t('nav.payouts'), icon: Banknote, href: '/superowner/payouts', section: 'payouts' },
        { label: t('nav.sepaPayouts'), icon: Banknote, href: '/superowner/versements', section: 'payouts' },
        { label: t('nav.analytics'), icon: TrendingUp, href: '/superowner/analytics', section: 'analytics' },
        { label: t('nav.billing'), icon: CreditCard, href: '/superowner/billing', section: 'billing' },
        { label: t('nav.formules'), icon: Layers, href: '/superowner/formules', section: 'formules' },
        { label: t('nav.financialReports'), icon: BarChart3, href: '/superowner/financial-reports', section: 'financial-reports' },
        { label: t('nav.exports'), icon: Download, href: '/superowner/exports', section: 'exports' },
      ],
    },
    {
      id: 'members',
      plateforme: 'EAT',
      title: t('nav.members'),
      icon: Users2,
      items: [
        { label: t('nav.clients'), icon: UserCheck, href: '/superowner/members/clients', section: 'members' },
        { label: t('nav.merchants'), icon: ShoppingCart, href: '/superowner/members/merchants', section: 'members' },
        { label: t('nav.deliveries'), icon: Briefcase, href: '/superowner/members/deliveries', section: 'members' },
      ],
    },
    {
      // ZupDrive : les chauffeurs (transport de personnes, licence LVC). Rien
      // à voir avec les livreurs ZupEat ci-dessus.
      title: t('nav.sectionZupDrive'),
      plateforme: 'DRIVE',
      items: [
        { label: t('nav.chauffeurs'), icon: Car, href: '/superowner/zupdrive/chauffeurs', section: 'chauffeurs' },
        { label: t('nav.coursesDrive'), icon: Navigation, href: '/superowner/zupdrive/courses', section: 'courses-drive' },
        { label: t('nav.tarifsDrive'), icon: Euro, href: '/superowner/zupdrive/tarifs', section: 'courses-drive' },
      ],
    },
    {
      title: t('nav.sectionSupport'),
      plateforme: 'EAT',
      items: [
        { label: t('nav.supportTickets'), icon: LifeBuoy, href: '/superowner/support-tickets', section: 'support-tickets' },
        { label: t('nav.driverSupport'), icon: MessageCircle, href: '/superowner/driver-support', section: 'driver-support' },
        { label: t('nav.deliveryIncidents'), icon: AlertTriangle, href: '/superowner/incidents-livraison', section: 'driver-support' },
        { label: t('nav.reviews'), icon: Flag, href: '/superowner/reviews', section: 'reviews' },
        { label: t('nav.notifications'), icon: Megaphone, href: '/superowner/notifications', section: 'notifications' },
      ],
    },
    {
      // Commune : l'équipe et ses rôles valent pour toutes les plateformes.
      title: t('nav.sectionTeam'),
      items: [
        { label: t('nav.profile'), icon: UserCircle, href: '/superowner/profil', section: 'profil' },
        { label: t('nav.userManagement'), icon: Users, href: '/superowner/user-management', section: null },
        { label: t('nav.roles'), icon: ShieldCheck, href: '/superowner/roles', section: null },
      ],
    },
    {
      title: t('nav.sectionPlatform'),
      items: [
        { label: t('nav.apiKeys'), icon: Key, href: '/superowner/api-keys', section: 'api-keys' },
        { label: t('nav.webhooks'), icon: Webhook, href: '/superowner/webhooks', section: 'webhooks' },
        { label: t('nav.systemConfig'), icon: Settings, href: '/superowner/system-config', section: 'system-config' },
        { label: t('nav.legalPages'), icon: Scale, href: '/superowner/pages-legales', section: 'pages-legales' },
        { label: t('nav.advancedSettings'), icon: Sliders, href: '/superowner/advanced-settings', section: 'advanced-settings' },
      ],
    },
    {
      title: t('nav.sectionSupervision'),
      items: [
        { label: t('nav.health'), icon: Activity, href: '/superowner/health', section: 'health' },
        { label: t('nav.monitoring'), icon: Radio, href: '/superowner/monitoring', section: 'monitoring' },
        { label: t('nav.console'), icon: Terminal, href: '/superowner/console', section: null },
        { label: t('nav.dataManagement'), icon: Database, href: '/superowner/data-management', section: 'data-management' },
        { label: t('nav.securityAudit'), icon: Shield, href: '/superowner/security-audit', section: 'security-audit' },
        { label: t('nav.auditLogs'), icon: FileText, href: '/superowner/audit-logs', section: 'audit-logs' },
        { label: t('nav.accessLogs'), icon: LogIn, href: '/superowner/access-logs', section: 'access-logs' },
      ],
    },
  ];

  // Chaque membre de l'équipe gère son propre compte, quelles que soient ses
  // permissions.
  const autorise = (section: string | null) =>
    acces.isSuperOwner ||
    section === 'profil' || (section !== null && !!acces.permissions[section]);
  const sectionsAutorisees = navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => autorise(item.section)) }))
    .filter((section) => section.items.length > 0);
  const pageAutorisee = autorise(sectionDuChemin(pathname));

  // Les plateformes que le compte peut administrer : celles dont il voit au
  // moins une entrée. Un seul choix possible : pas d'onglets.
  const accueilDe = (plateforme: Plateforme) =>
    sectionsAutorisees.find((section) => section.plateforme === plateforme)?.items[0]?.href;
  const plateformesOuvertes = PLATEFORMES.filter((plateforme) => accueilDe(plateforme));

  // La page affichée décide de l'onglet ; une page commune garde le dernier choix.
  const plateformeDuChemin = navSections.find(
    (section) =>
      section.plateforme &&
      section.items.some((item) =>
        item.href === '/superowner' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
      )
  )?.plateforme;
  // Arrivé sur une page d'une plateforme (lien, notification) : elle devient
  // le choix, que les pages communes gardent ensuite.
  if (plateformeDuChemin && plateformeDuChemin !== choix) setChoix(plateformeDuChemin);
  const candidate = plateformeDuChemin ?? choix;
  const plateforme =
    candidate && plateformesOuvertes.includes(candidate) ? candidate : plateformesOuvertes[0];

  const sectionsVisibles = [
    ...sectionsAutorisees.filter((section) => section.plateforme && section.plateforme === plateforme),
    ...sectionsAutorisees.filter((section) => !section.plateforme),
  ];
  const ONGLETS: Record<Plateforme, { label: string; icon: typeof Home }> = {
    EAT: { label: t('nav.platformEat'), icon: UtensilsCrossed },
    DRIVE: { label: t('nav.platformDrive'), icon: Car },
  };

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
            {etendu && (
              <span className="font-bold text-lg truncate">
                {!acces.isSuperOwner && acces.roleLabel ? acces.roleLabel : t('brand')}
              </span>
            )}
          </SelecteurEspace>
        </div>

        {/* Plateforme administrée : ZupEat ou ZupDrive, chacune son menu. */}
        {plateformesOuvertes.length > 1 && (
          <div
            role="tablist"
            aria-label={t('nav.platformChoice')}
            className={`mx-4 mt-4 flex gap-1 rounded-lg bg-gray-900 p-1 ${etendu ? '' : 'flex-col'}`}
          >
            {plateformesOuvertes.map((code) => {
              const { label, icon: Icone } = ONGLETS[code];
              const actif = code === plateforme;
              return (
                <Link
                  key={code}
                  href={accueilDe(code) ?? '/superowner'}
                  role="tab"
                  aria-selected={actif}
                  title={etendu ? undefined : label}
                  onClick={() => {
                    setChoix(code);
                    setMenuMobile(false);
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors hover:no-underline ${
                    actif ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <Icone size={16} className="flex-shrink-0" />
                  {etendu && <span className="truncate">{label}</span>}
                </Link>
              );
            })}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto no-scrollbar">
          {sectionsVisibles.map((section, index) => {
            const isCollapsible = section.id;
            const isExpanded = isCollapsible ? expandedSections.has(isCollapsible) : true;

            return (
              <div key={section.title ?? `section-${index}`} className="space-y-1">
                {etendu && section.title && (
                  isCollapsible ? (
                    <button
                      onClick={() => isCollapsible && toggleSection(isCollapsible)}
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
              {!acces.isSuperOwner && acces.roleLabel && (
                <span className="ml-2 px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">
                  {tRoles('yourRole', { role: acces.roleLabel })}
                </span>
              )}
            </div>
            {/* La cloche suit la plateforme partout : un ticket ouvert pendant
                qu'on consulte les journaux doit se voir sans changer de page. */}
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {pageAutorisee ? (
            children
          ) : (
            <div className="max-w-lg mx-auto mt-16 text-center bg-gray-800 border border-gray-700 rounded-lg p-8">
              <Lock size={32} className="mx-auto mb-4 text-red-500" />
              <h1 className="text-xl font-bold mb-2">{tRoles('deniedTitle')}</h1>
              <p className="text-gray-400">{tRoles('deniedText')}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
