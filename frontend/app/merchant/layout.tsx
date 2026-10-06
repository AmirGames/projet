'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useCallback, useState } from 'react';
import { fermerSessionPartout } from '@/lib/sso';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Store,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

import { memoriserBoutique } from '@/lib/current-store';
import { AlerteCommandes } from '@/components/AlerteCommandes';
import { NotificationBell } from '@/components/NotificationBell';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Cadre du choix du commerce.
 *
 * Les pages d'une boutique (/merchant/:orgId/...) ont leur propre barre
 * latérale : ce cadre ne s'applique qu'au niveau au-dessus, là où aucune
 * boutique n'est encore choisie. Il en reprend l'allure pour que le passage
 * de l'un à l'autre ne donne pas l'impression de changer de site, mais sa
 * navigation est celle qui a du sens ici : la liste des boutiques.
 */

// Seule la couleur reste ici : le nom d'une formule se règle côté plateforme,
// et une copie locale afficherait « Premium » après un renommage.
const COULEURS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600 border-gray-200',
  PREMIUM: 'bg-sky-50 text-sky-800 border-sky-200',
  PRO: 'bg-amber-50 text-amber-800 border-amber-200',
};

interface Boutique {
  id: string;
  name: string;
  city?: string | null;
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('cadreCommercant');
  // Sur grand écran, la barre se replie en icônes ; sur téléphone, c'est un
  // tiroir fermé par défaut, qui se referme à chaque lien suivi.
  const [menuOuvert, setMenuOuvert] = useState(true);
  const [tiroir, setTiroir] = useState(false);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [formule, setFormule] = useState<{ code: string; libelle: string } | null>(null);
  const [orgId, setOrgId] = useState('');

  const router = useRouter();
  const pathname = usePathname();

  // Seul le niveau du choix reçoit ce cadre : /merchant/:orgId/... a le sien,
  // et empiler les deux afficherait deux barres latérales.
  const auNiveauDuChoix =
    pathname === '/merchant' || pathname === '/merchant/formule' || pathname === '/merchant/profil';

  const charger = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const org = localStorage.getItem('currentOrgId');

      if (!token || !org) return;
      setOrgId(org);

      const [reponseBoutiques, reponseQuota] = await Promise.all([
        fetch(`${API_URL}/api/stores/org/${org}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/stores/org/${org}/quota`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (reponseBoutiques.ok) {
        const donnees = await reponseBoutiques.json();
        setBoutiques(Array.isArray(donnees) ? donnees : donnees.stores || []);
      }

      if (reponseQuota.ok) {
        const quota = await reponseQuota.json();
        setFormule(quota.tier ? { code: quota.tier, libelle: quota.tierLabel || quota.tier } : null);
      }
    } catch (error) {
      signalerErreur(t('chargementImpossible'), error);
    }
  }, []);

  useEffectChargement(() => {
    if (auNiveauDuChoix) charger();
  }, [auNiveauDuChoix, charger]);

  const seDeconnecter = () => {
    // Ferme la session sur tous les domaines, puis l'efface d'ici.
    fermerSessionPartout();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentOrgId');
    router.push('/login');
  };

  const ouvrirBoutique = (storeId: string) => {
    memoriserBoutique(orgId, storeId);
    router.push(`/merchant/${orgId}/dashboard`);
  };

  if (!auNiveauDuChoix) return <>{children}</>;

  const lienSecondaire =
    'flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm font-semibold transition-colors text-gray-700 hover:bg-gray-100 hover:text-gray-900';

  return (
    <div className="flex min-h-screen bg-[#F7F7F6] text-gray-900">
      {/* Le voile derrière le tiroir, sur téléphone. */}
      {tiroir && (
        <button
          type="button"
          aria-label={t('fermerMenu')}
          onClick={() => setTiroir(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#ECECEA] bg-white transition-all duration-300 lg:static lg:translate-x-0 ${
          tiroir ? 'translate-x-0' : '-translate-x-full'
        } ${menuOuvert ? 'lg:w-64' : 'lg:w-20'}`}
      >
        <div className="p-6 border-b border-gray-200">
          <SelecteurEspace actuel="merchant" href="/merchant" clair className="gap-3 -m-2 p-2 w-full min-w-0" chevron={menuOuvert || tiroir}>
            <div className="w-10 h-10 bg-orange-600 text-white rounded-xl flex items-center justify-center font-extrabold flex-shrink-0">
              <LayoutGrid size={20} />
            </div>
            {(menuOuvert || tiroir) && (
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{t('mesCommerces')}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{t('commercant')}</span>
                  {formule && (
                    <span
                      title={t("formule", { nom: formule.libelle })}
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${
                        COULEURS[formule.code] || COULEURS.FREE
                      }`}
                    >
                      {formule.libelle}
                    </span>
                  )}
                </div>
              </div>
            )}
          </SelecteurEspace>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {(menuOuvert || tiroir) && (
            <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('boutiques')}
            </p>
          )}

          {boutiques.map((boutique) => (
            <button
              key={boutique.id}
              type="button"
              onClick={() => ouvrirBoutique(boutique.id)}
              title={menuOuvert || tiroir ? undefined : boutique.name}
              className={`${lienSecondaire} w-full text-left`}
            >
              <Store size={20} className="flex-shrink-0" />
              {(menuOuvert || tiroir) && (
                <span className="min-w-0">
                  <span className="block truncate">{boutique.name}</span>
                  {boutique.city && (
                    <span className="block text-xs text-gray-500 truncate">{boutique.city}</span>
                  )}
                </span>
              )}
            </button>
          ))}

          {boutiques.length === 0 && menuOuvert && (
            <p className="px-4 py-3 text-sm text-gray-500">{t('aucuneBoutique')}</p>
          )}

          <div className="pt-3 mt-3 border-t border-gray-200 space-y-1">
            <Link href="/store/new" onClick={() => setTiroir(false)} title={menuOuvert ? undefined : t('nouvelleBoutique')} className={lienSecondaire}>
              <Plus size={20} className="flex-shrink-0" />
              {(menuOuvert || tiroir) && <span className="truncate">{t('nouvelleBoutique')}</span>}
            </Link>

            <Link
              href="/merchant/formule"
              onClick={() => setTiroir(false)}
              title={menuOuvert ? undefined : t('maFormule')}
              className={lienSecondaire}
            >
              <CreditCard size={20} className="flex-shrink-0" />
              {(menuOuvert || tiroir) && <span className="truncate">{t('maFormule')}</span>}
            </Link>

            <Link
              href="/merchant/profil"
              onClick={() => setTiroir(false)}
              title={menuOuvert ? undefined : t('monProfil')}
              className={lienSecondaire}
            >
              <UserCog size={20} className="flex-shrink-0" />
              {(menuOuvert || tiroir) && <span className="truncate">{t('monProfil')}</span>}
            </Link>

            {orgId && (
              <Link
                href={`/merchant/${orgId}/support`}
                onClick={() => setTiroir(false)}
                title={menuOuvert ? undefined : t('support')}
                className={lienSecondaire}
              >
                <MessageCircle size={20} className="flex-shrink-0" />
                {(menuOuvert || tiroir) && <span className="truncate">{t('support')}</span>}
              </Link>
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={seDeconnecter}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-50 transition-colors text-red-600"
          >
            <LogOut size={20} className="flex-shrink-0" />
            {(menuOuvert || tiroir) && <span className="truncate">{t('deconnexion')}</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-[#ECECEA] px-4 py-3 sm:px-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setTiroir(true)}
            aria-label={t('ouvrirMenu')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors lg:hidden"
          >
            <Menu size={22} />
          </button>
          <button
            type="button"
            onClick={() => setMenuOuvert(!menuOuvert)}
            aria-label={menuOuvert ? t('replier') : t('deplier')}
            className="hidden p-2 hover:bg-gray-100 rounded-lg transition-colors lg:block"
          >
            {menuOuvert ? <ChevronsLeft size={20} /> : <ChevronsRight size={20} />}
          </button>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <div className="hidden text-sm text-gray-500 md:block">
              {pathname === '/merchant/formule'
                ? t('enteteFormule')
                : pathname === '/merchant/profil'
                  ? t('enteteProfil')
                  : t('enteteChoix')}
            </div>
            {/* Une réponse du support arrive souvent pendant qu'on choisit sa
                boutique : la cloche manquait à ce niveau-là. */}
            <NotificationBell clair />
            <LanguageSwitcher clair />
          </div>
        </header>

        {/* Une commande peut tomber pendant qu'on choisit sa boutique : sans
            cela, elle ne sonnait qu'une fois une boutique ouverte. */}
        {orgId && <AlerteCommandes orgId={orgId} toutesBoutiques />}

        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
