'use client';


import { oublierJeton } from '@/lib/jeton-session';
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
import { useTranslations } from 'next-intl';

// Chaque formule a sa couleur, pour être identifiable d'un coup d'œil.
// Le libellé : `formules.<code>` des traductions.
const FORMULES: Record<string, { classe: string }> = {
  FREE: { classe: 'bg-gray-100 text-gray-600 border-gray-200' },
  PREMIUM: { classe: 'bg-sky-50 text-sky-800 border-sky-200' },
  PRO: { classe: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export default function MerchantStoreLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('cadreCommercant');
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
    oublierJeton();
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
        { label: t('tableau'), icon: Home, href: `/merchant/${orgId}/dashboard` },
        { label: t('commandes'), icon: ShoppingCart, href: `/merchant/${orgId}/orders` },
        { label: t('clients'), icon: Users, href: `/merchant/${orgId}/customers` },
        { label: t('avis'), icon: Star, href: `/merchant/${orgId}/reviews` },
      ],
    },
    {
      title: t('catalogue'),
      items: [
        { label: t('produits'), icon: Package, href: `/merchant/${orgId}/products` },
        { label: t('categories'), icon: Zap, href: `/merchant/${orgId}/categories` },
        { label: t('promotions'), icon: Percent, href: `/merchant/${orgId}/promotions` },
        { label: t('etiquettes'), icon: Tags, href: `/merchant/${orgId}/product-tags` },
        { label: t('photos'), icon: ImageIcon, href: `/merchant/${orgId}/product-media` },
        { label: t('referencement'), icon: Search, href: `/merchant/${orgId}/product-seo` },
      ],
    },
    {
      title: t('boutique'),
      items: [
        { label: t('horaires'), icon: Timer, href: `/merchant/${orgId}/store-hours` },
        { label: t('zones'), icon: MapPin, href: `/merchant/${orgId}/delivery-zones` },
        { label: t('paiement'), icon: CreditCard, href: `/merchant/${orgId}/payment-methods` },
        { label: t('taxes'), icon: Receipt, href: `/merchant/${orgId}/tax-settings` },
      ],
    },
    {
      title: t('argent'),
      items: [
        { label: t('reversements'), icon: Wallet, href: `/merchant/${orgId}/payouts` },
        { label: t('factures'), icon: FileText, href: `/merchant/${orgId}/invoices` },
        { label: t('statistiques'), icon: BarChart3, href: `/merchant/${orgId}/analytics` },
        { label: t('rapports'), icon: FileText, href: `/merchant/${orgId}/reports` },
      ],
    },
    {
      title: t('gestion'),
      items: [
        { label: t('marketing'), icon: Megaphone, href: `/merchant/${orgId}/marketing` },
        { label: t('equipe'), icon: Users2, href: `/merchant/${orgId}/staff` },
        { label: t('notifications'), icon: Bell, href: `/merchant/${orgId}/notifications` },
      ],
    },
    {
      title: t('compte'),
      items: [
        { label: t('parametres'), icon: Settings, href: `/merchant/${orgId}/settings` },
        { label: t('aideSupport'), icon: MessageCircle, href: `/merchant/${orgId}/support` },
        // Retour au choix du commerce, d'où l'on peut aussi en créer un.
        { label: t('mesCommerces'), icon: LayoutGrid, href: '/merchant' },
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
        { label: t('mesCommerces'), icon: LayoutGrid, href: '/merchant' },
        { label: t('support'), icon: MessageCircle, href: `/merchant/${orgId}/support` },
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
        <item.icon size={18} className="shrink-0" aria-hidden="true" />
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
          aria-label={t('fermerMenu')}
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
            <div className="w-10 h-10 bg-orange-600 text-white rounded-xl flex items-center justify-center font-extrabold shrink-0">
              {orgStatus?.name?.charAt(0).toUpperCase() || 'M'}
            </div>
            <div className={`min-w-0 ${libelle}`}>
              <p className="font-extrabold text-sm truncate">{orgStatus?.name || t('maBoutique')}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-gray-500">{t('commercant')}</span>
                {orgStatus?.tier && (
                  <span
                    title={t('formule', { nom: FORMULES[orgStatus.tier] ? t(`formules.${orgStatus.tier}`) : orgStatus.tier })}
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${
                      FORMULES[orgStatus.tier]?.classe || FORMULES.FREE.classe
                    }`}
                  >
                    {FORMULES[orgStatus.tier] ? t(`formules.${orgStatus.tier}`) : orgStatus.tier}
                  </span>
                )}
              </div>
            </div>
          </SelecteurEspace>
        </div>

        <nav aria-label={t('espaceCommercant')} className="flex-1 space-y-3 overflow-y-auto p-3">
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
            title={sidebarOpen ? undefined : t('deconnexion')}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
          >
            <LogOut size={18} className="shrink-0" aria-hidden="true" />
            <span className={`truncate ${libelle}`}>{t('deconnexion')}</span>
          </button>
        </div>
      </aside>

      <div className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#ECECEA] bg-white px-4 py-3 sm:px-6">
          {/* Le tiroir sur téléphone, le repli de la barre sur grand écran. */}
          <button
            type="button"
            onClick={() => setTiroirOuvert(true)}
            aria-label={t('ouvrirMenu')}
            className="rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 lg:hidden"
          >
            <Menu size={22} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? t('replier') : t('deplier')}
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
              <Clock size={20} className="text-sky-700 mt-0.5 shrink-0" />
              <div className="flex-1 text-sm">
                <h3 className="font-bold text-sky-900">{t('enAttente')}</h3>
                <p className="text-gray-700 mt-1">
                  {t('preparez')}
                </p>
                {orgStatus.validation.piecesAFournir?.length > 0 && (
                  <p className="text-gray-700 mt-1">
                    <strong className="text-sky-900">{t('aFournir')}</strong>{' '}
                    {orgStatus.validation.piecesAFournir.map((piece) => piece.libelle).join(', ')}.
                  </p>
                )}
                {orgStatus.validation.piecesEnExamen?.length > 0 && (
                  <p className="text-gray-500 mt-1">
                    {t('enExamen')}{' '}
                    {orgStatus.validation.piecesEnExamen.map((piece) => piece.libelle).join(', ')}.
                  </p>
                )}
                <Link
                  href="/merchant/profil"
                  className="inline-block mt-2 font-bold text-sky-800 underline hover:text-sky-950"
                >
                  {t('completer')}
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
                    ? t('suspendu')
                    : t('ferme')}
                </h3>
                <p className="text-sm text-gray-700 mt-1">
                  {orgStatus.status === 'SUSPENDED'
                    ? t('raison', { raison: orgStatus.suspensionReason || t('nonSpecifiee') })
                    : t('raison', { raison: orgStatus.closureReason || t('nonSpecifiee') })}
                </p>

                {orgStatus.status === 'CLOSED' && orgStatus.closedUntil && (
                  <div className="text-sm text-gray-700 mt-2 flex items-center gap-2">
                    <Clock size={16} />
                    <span>
                      {t('donneesSupprimees', { n: getDaysUntilDelete() ?? 0 })}
                    </span>
                  </div>
                )}

                {orgStatus.status === 'SUSPENDED' && (
                  <p className="text-sm text-gray-700 mt-2">
                    {t('contacter')}
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
                {orgStatus?.status === 'CLOSED' ? t('ferme') : t('compteSuspendu')}
              </h2>

              <p className="text-gray-500">
                {orgStatus?.status === 'CLOSED' ? t('restreintFerme') : t('restreintSuspendu')}
              </p>

              <Link
                href={`/merchant/${orgId}/support`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-bold transition"
              >
                <MessageCircle size={18} />
                {t('ecrire')}
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
