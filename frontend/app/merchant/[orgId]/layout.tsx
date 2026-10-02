'use client';

import { useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { fermerSessionPartout } from '@/lib/sso';
import Link from 'next/link';
import { NotificationBell } from '@/components/NotificationBell';
import { StoreSwitcher } from '@/components/StoreSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { CurrentStoreProvider } from '@/lib/current-store';
import { AlerteCommandes } from '@/components/AlerteCommandes';
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
  Home,
  Star,
  AlertCircle,
  Clock,
  Percent,
  Megaphone,
  Receipt,
  BarChart3,
  Timer,
  Wallet,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

// Chaque formule a sa couleur, pour être identifiable d'un coup d'œil.
const FORMULES: Record<string, { libelle: string; classe: string }> = {
  FREE: { libelle: 'Gratuit', classe: 'bg-gray-100 text-gray-600 border-gray-200' },
  PREMIUM: { libelle: 'Premium', classe: 'bg-sky-50 text-sky-800 border-sky-200' },
  PRO: { libelle: 'Pro', classe: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export default function MerchantStoreLayout({ children }: { children: React.ReactNode }) {
  // Sur grand écran, la barre se replie en icônes ; sur téléphone, c'est un
  // tiroir fermé par défaut, qui se referme à chaque page ouverte.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const orgId = params?.orgId as string;

  // L'état du compte est tenu à jour en direct : une suspension prise en
  // compte au prochain rechargement laissait le commerçant travailler dans une
  // interface qui ne répond plus.
  const { statut: orgStatus, chargement: loadingStatus, restreint } = useStatutCompte(orgId);

  const handleLogout = () => {
    // Ferme la session sur tous les domaines, puis l'efface d'ici.
    fermerSessionPartout();
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

  // Rangée par usage : le quotidien en haut, l'argent et les réglages ensuite.
  const navSections = [
    {
      title: null,
      items: [
        { label: 'Tableau de bord', icon: Home, href: `/merchant/${orgId}/dashboard` },
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
      title: 'Argent',
      items: [
        { label: 'Reversements', icon: Wallet, href: `/merchant/${orgId}/payouts` },
        { label: 'Factures', icon: FileText, href: `/merchant/${orgId}/invoices` },
        { label: 'Statistiques', icon: BarChart3, href: `/merchant/${orgId}/analytics` },
        { label: 'Rapports', icon: FileText, href: `/merchant/${orgId}/reports` },
      ],
    },
    {
      title: 'Gestion',
      items: [
        { label: 'Marketing', icon: Megaphone, href: `/merchant/${orgId}/marketing` },
        { label: 'Équipe', icon: Users2, href: `/merchant/${orgId}/staff` },
        { label: 'Notifications', icon: Bell, href: `/merchant/${orgId}/notifications` },
      ],
    },
    {
      title: 'Compte',
      items: [
        { label: 'Paramètres', icon: Settings, href: `/merchant/${orgId}/settings` },
        { label: 'Aide et support', icon: MessageCircle, href: `/merchant/${orgId}/support` },
        // Retour au choix du commerce, d'où l'on peut aussi en créer un.
        { label: 'Mes commerces', icon: LayoutGrid, href: '/merchant' },
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
      items: [
        { label: 'Mes commerces', icon: LayoutGrid, href: '/merchant' },
        { label: 'Support', icon: MessageCircle, href: `/merchant/${orgId}/support` },
      ],
    },
  ];

  const sections = restreint ? sectionsRestreintes : navSections;

  // Une page et ses sous-pages (la fiche d'une commande allume « Commandes »).
  const estActif = (href: string) =>
    pathname === href || (href !== '/merchant' && Boolean(pathname?.startsWith(`${href}/`)));

  // Le libellé s'affiche toujours dans le tiroir du téléphone, et sur grand
  // écran seulement si la barre est dépliée.
  const libelle = sidebarOpen ? '' : 'lg:hidden';

  const lien = (item: { label: string; icon: typeof Home; href: string }) => {
    const actif = estActif(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={sidebarOpen ? undefined : item.label}
        aria-current={actif ? 'page' : undefined}
        onClick={() => setTiroirOuvert(false)}
        className={`flex items-center gap-3 rounded-[10px] px-3 py-1.5 text-sm transition-colors ${
          actif ? 'bg-orange-50 font-bold text-orange-700' : 'font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <item.icon size={18} className="flex-shrink-0" aria-hidden="true" />
        <span className={`truncate ${libelle}`}>{item.label}</span>
      </Link>
    );
  };

  return (
    <CurrentStoreProvider orgId={orgId}>
    <div className="flex min-h-screen bg-[#F7F7F6] text-gray-900">
      {/* Le voile derrière le tiroir, sur téléphone. */}
      {tiroirOuvert && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setTiroirOuvert(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#ECECEA] bg-white transition-all duration-300 ${
          tiroirOuvert ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 ${sidebarOpen ? 'lg:w-64' : 'lg:w-20'}`}
      >
        {/* Le commerce, et le passage aux autres espaces du groupe. */}
        <div className="border-b border-[#ECECEA] p-4">
          <SelecteurEspace actuel="merchant" href="/merchant" clair className="gap-3 -m-1 p-1 w-full min-w-0" chevron={sidebarOpen}>
            <div className="w-10 h-10 bg-orange-600 text-white rounded-xl flex items-center justify-center font-extrabold flex-shrink-0">
              {orgStatus?.name?.charAt(0).toUpperCase() || 'M'}
            </div>
            <div className={`min-w-0 ${libelle}`}>
              <p className="font-extrabold text-sm truncate">{orgStatus?.name || 'Ma Boutique'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-gray-500">Commerçant</span>
                {orgStatus?.tier && (
                  <span
                    title={`Formule ${FORMULES[orgStatus.tier]?.libelle || orgStatus.tier}`}
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${
                      FORMULES[orgStatus.tier]?.classe || FORMULES.FREE.classe
                    }`}
                  >
                    {FORMULES[orgStatus.tier]?.libelle || orgStatus.tier}
                  </span>
                )}
              </div>
            </div>
          </SelecteurEspace>
        </div>

        <nav aria-label="Espace commerçant" className="flex-1 space-y-3 overflow-y-auto p-3">
          {sections.map((section, index) => (
            <div key={section.title ?? `section-${index}`} className="space-y-0.5">
              {section.title && (
                <p className={`px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 ${libelle}`}>
                  {section.title}
                </p>
              )}
              {section.items.map(lien)}
            </div>
          ))}
        </nav>

        <div className="border-t border-[#ECECEA] p-3">
          <button
            type="button"
            onClick={handleLogout}
            title={sidebarOpen ? undefined : 'Déconnexion'}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
          >
            <LogOut size={18} className="flex-shrink-0" aria-hidden="true" />
            <span className={`truncate ${libelle}`}>Déconnexion</span>
          </button>
        </div>
      </aside>

      <div className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#ECECEA] bg-white px-4 py-3 sm:px-6">
          {/* Le tiroir sur téléphone, le repli de la barre sur grand écran. */}
          <button
            type="button"
            onClick={() => setTiroirOuvert(true)}
            aria-label="Ouvrir le menu"
            className="rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 lg:hidden"
          >
            <Menu size={22} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Replier le menu' : 'Déplier le menu'}
            className="hidden rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 lg:block"
          >
            {sidebarOpen ? <ChevronsLeft size={20} /> : <ChevronsRight size={20} />}
          </button>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <StoreSwitcher clair />
            <NotificationBell clair />
            <LanguageSwitcher clair />
          </div>
        </header>

        {/* Une commande attend d'être acceptée : ça sonne, sur toutes les pages. */}
        {!restreint && <AlerteCommandes orgId={orgId} />}

        {/* Un commerce pas encore validé prépare sa boutique mais ne peut pas
            l'ouvrir : le bandeau le dit sur chaque page, pas seulement au
            moment où le bouton d'ouverture refuse. */}
        {!loadingStatus && orgStatus?.validation && !orgStatus.validation.valide && (
          <div className="border-b border-sky-200 bg-sky-50 px-4 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <Clock size={20} className="text-sky-700 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <h3 className="font-bold text-sky-900">Commerce en attente de validation</h3>
                <p className="text-gray-700 mt-1">
                  Préparez votre boutique : produits, catégories, horaires. Vous pourrez l&apos;ouvrir
                  dès que la plateforme aura validé vos documents.
                </p>
                {orgStatus.validation.piecesAFournir?.length > 0 && (
                  <p className="text-gray-700 mt-1">
                    <strong className="text-sky-900">À fournir :</strong>{' '}
                    {orgStatus.validation.piecesAFournir.map((piece) => piece.libelle).join(', ')}.
                  </p>
                )}
                {orgStatus.validation.piecesEnExamen?.length > 0 && (
                  <p className="text-gray-500 mt-1">
                    En cours d&apos;examen :{' '}
                    {orgStatus.validation.piecesEnExamen.map((piece) => piece.libelle).join(', ')}.
                  </p>
                )}
                <Link
                  href="/merchant/profil"
                  className="inline-block mt-2 font-bold text-sky-800 underline hover:text-sky-950"
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
              ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
          } border-b px-4 py-4 sm:px-6`}>
            <div className="flex items-start gap-3">
              <AlertCircle
                size={20}
                className={orgStatus.status === 'SUSPENDED' ? 'text-amber-700' : 'text-red-700 mt-1'}
              />
              <div className="flex-1">
                <h3 className={`font-bold ${orgStatus.status === 'SUSPENDED' ? 'text-amber-900' : 'text-red-800'}`}>
                  {orgStatus.status === 'SUSPENDED'
                    ? 'Compte temporairement suspendu'
                    : 'Compte fermé'}
                </h3>
                <p className="text-sm text-gray-700 mt-1">
                  {orgStatus.status === 'SUSPENDED'
                    ? `Raison: ${orgStatus.suspensionReason || 'Non spécifiée'}`
                    : `Raison: ${orgStatus.closureReason || 'Non spécifiée'}`}
                </p>

                {orgStatus.status === 'CLOSED' && orgStatus.closedUntil && (
                  <div className="text-sm text-gray-700 mt-2 flex items-center gap-2">
                    <Clock size={16} />
                    <span>
                      Données supprimées dans {getDaysUntilDelete()} jours. Contactez le support pour restaurer votre compte.
                    </span>
                  </div>
                )}

                {orgStatus.status === 'SUSPENDED' && (
                  <p className="text-sm text-gray-700 mt-2">
                    Veuillez contacter le support pour réactiver votre compte.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {/* Un compte restreint ne voit plus que le support. Afficher la page
              demandée l'aurait laissé devant des tableaux vides et des
              enregistrements qui échouent, sans lui dire pourquoi. */}
          {restreint && !pathname?.endsWith('/support') ? (
            <div className="max-w-xl mx-auto mt-10 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-white border border-[#ECECEA] flex items-center justify-center">
                <MessageCircle size={26} className="text-gray-500" />
              </div>

              <h2 className="text-2xl font-extrabold">
                {orgStatus?.status === 'CLOSED' ? 'Compte fermé' : 'Compte suspendu'}
              </h2>

              <p className="text-gray-500">
                Votre espace est en accès restreint.{' '}
                {orgStatus?.status === 'CLOSED'
                  ? 'Seul le support reste joignable.'
                  : 'Vous pouvez échanger avec le support, qui vous indiquera la marche à suivre.'}
              </p>

              <Link
                href={`/merchant/${orgId}/support`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-bold transition"
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
