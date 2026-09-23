'use client';

import { useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';
import { StoreSwitcher } from '@/components/StoreSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { CurrentStoreProvider } from '@/lib/current-store';
import { useStatutCompte } from '@/lib/use-statut-compte';
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
  LayoutGrid,
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

// Chaque formule a sa couleur, pour être identifiable d'un coup d'œil.
const FORMULES: Record<string, { libelle: string; classe: string }> = {
  FREE: { libelle: 'Gratuit', classe: 'bg-gray-600/40 text-gray-300 border-gray-500/40' },
  PREMIUM: { libelle: 'Premium', classe: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  PRO: { libelle: 'Pro', classe: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
};

export default function MerchantStoreLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const orgId = params?.orgId as string;

  // L'état du compte est tenu à jour en direct : une suspension prise en
  // compte au prochain rechargement laissait le commerçant travailler dans une
  // interface qui ne répond plus.
  const { statut: orgStatus, chargement: loadingStatus, restreint } = useStatutCompte(orgId);

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

  /**
   * Ce que voit un compte suspendu ou fermé.
   *
   * Laisser la navigation entière afficherait une trentaine de liens dont
   * chacun répondrait « accès refusé » : le commerçant croirait à une panne.
   * Il ne reste que ce qui fonctionne.
   */
  const sectionsRestreintes = [
    {
      title: null,
      items: [{ label: 'Support', icon: MessageCircle, href: `/merchant/${orgId}/support` }],
    },
  ];

  const sections = restreint ? sectionsRestreintes : navSections;

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
          <SelecteurEspace actuel="merchant" href="/merchant" className="gap-3 -m-2 p-2 w-full min-w-0" chevron={sidebarOpen}>
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center font-bold flex-shrink-0">
              {orgStatus?.name?.charAt(0).toUpperCase() || 'M'}
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{orgStatus?.name || 'Ma Boutique'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">Commerçant</span>
                  {orgStatus?.tier && (
                    <span
                      title={`Formule ${FORMULES[orgStatus.tier]?.libelle || orgStatus.tier}`}
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${
                        FORMULES[orgStatus.tier]?.classe || FORMULES.FREE.classe
                      }`}
                    >
                      {FORMULES[orgStatus.tier]?.libelle || orgStatus.tier}
                    </span>
                  )}
                </div>
              </div>
            )}
          </SelecteurEspace>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto no-scrollbar">
          {sections.map((section, index) => (
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

          {/* Retour au choix du commerce, d'où l'on peut aussi en créer un. */}
          <div className="pt-3 mt-3 border-t border-gray-700">
            <Link
              href="/merchant"
              title={sidebarOpen ? undefined : 'Mes commerces'}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              <LayoutGrid size={20} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">Mes commerces</span>}
            </Link>
          </div>
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
            <LanguageSwitcher />
          </div>
        </header>

        {/* Un commerce pas encore validé prépare sa boutique mais ne peut pas
            l'ouvrir : le bandeau le dit sur chaque page, pas seulement au
            moment où le bouton d'ouverture refuse. */}
        {!loadingStatus && orgStatus?.validation && !orgStatus.validation.valide && (
          <div className="bg-blue-500/10 border-b border-blue-500/50 px-6 py-4">
            <div className="flex items-start gap-3">
              <Clock size={20} className="text-blue-300 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <h3 className="font-bold text-blue-300">Commerce en attente de validation</h3>
                <p className="text-gray-300 mt-1">
                  Préparez votre boutique : produits, catégories, horaires. Vous pourrez l&apos;ouvrir
                  dès que la plateforme aura validé vos documents.
                  {orgStatus.validation.piecesManquantes.length > 0 &&
                    ` Reste à valider : ${orgStatus.validation.piecesManquantes
                      .map((piece) => piece.libelle)
                      .join(', ')}.`}
                </p>
                <Link
                  href="/merchant/profil"
                  className="inline-block mt-2 text-blue-300 underline hover:text-blue-200"
                >
                  Compléter mon dossier
                </Link>
              </div>
            </div>
          </div>
        )}

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
          {/* Un compte restreint ne voit plus que le support. Afficher la page
              demandée l'aurait laissé devant des tableaux vides et des
              enregistrements qui échouent, sans lui dire pourquoi. */}
          {restreint && !pathname?.endsWith('/support') ? (
            <div className="max-w-xl mx-auto mt-10 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                <MessageCircle size={26} className="text-gray-400" />
              </div>

              <h2 className="text-2xl font-bold">
                {orgStatus?.status === 'CLOSED' ? 'Compte fermé' : 'Compte suspendu'}
              </h2>

              <p className="text-gray-400">
                Votre espace est en accès restreint.{' '}
                {orgStatus?.status === 'CLOSED'
                  ? 'Seul le support reste joignable.'
                  : 'Vous pouvez échanger avec le support, qui vous indiquera la marche à suivre.'}
              </p>

              <Link
                href={`/merchant/${orgId}/support`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold transition"
              >
                <MessageCircle size={18} />
                Écrire au support
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
    </CurrentStoreProvider>
  );
}
