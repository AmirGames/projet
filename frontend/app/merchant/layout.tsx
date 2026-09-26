'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useCallback, useState } from 'react';
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
  X,
} from 'lucide-react';

import { memoriserBoutique } from '@/lib/current-store';
import { NotificationBell } from '@/components/NotificationBell';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SelecteurEspace } from '@/components/SelecteurEspace';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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
  FREE: 'bg-gray-600/40 text-gray-300 border-gray-500/40',
  PREMIUM: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  PRO: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
};

interface Boutique {
  id: string;
  name: string;
  city?: string | null;
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const [menuOuvert, setMenuOuvert] = useState(true);
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
      signalerErreur('Chargement des boutiques impossible', error);
    }
  }, []);

  useEffectChargement(() => {
    if (auNiveauDuChoix) charger();
  }, [auNiveauDuChoix, charger]);

  const seDeconnecter = () => {
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
    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-300 hover:bg-gray-700 hover:text-white';

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      <aside
        className={`${
          menuOuvert ? 'w-64' : 'w-20'
        } bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col`}
      >
        <div className="p-6 border-b border-gray-700">
          <SelecteurEspace actuel="merchant" href="/merchant" className="gap-3 -m-2 p-2 w-full min-w-0" chevron={menuOuvert}>
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center font-bold flex-shrink-0">
              <LayoutGrid size={20} />
            </div>
            {menuOuvert && (
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">Mes commerces</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">Commerçant</span>
                  {formule && (
                    <span
                      title={`Formule ${formule.libelle}`}
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
          {menuOuvert && (
            <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Boutiques
            </p>
          )}

          {boutiques.map((boutique) => (
            <button
              key={boutique.id}
              type="button"
              onClick={() => ouvrirBoutique(boutique.id)}
              title={menuOuvert ? undefined : boutique.name}
              className={`${lienSecondaire} w-full text-left`}
            >
              <Store size={20} className="flex-shrink-0" />
              {menuOuvert && (
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
            <p className="px-4 py-3 text-sm text-gray-500">Aucune boutique pour l&apos;instant.</p>
          )}

          <div className="pt-3 mt-3 border-t border-gray-700 space-y-1">
            <Link href="/store/new" title={menuOuvert ? undefined : 'Nouvelle boutique'} className={lienSecondaire}>
              <Plus size={20} className="flex-shrink-0" />
              {menuOuvert && <span className="truncate">Nouvelle boutique</span>}
            </Link>

            <Link
              href="/merchant/formule"
              title={menuOuvert ? undefined : 'Ma formule'}
              className={lienSecondaire}
            >
              <CreditCard size={20} className="flex-shrink-0" />
              {menuOuvert && <span className="truncate">Ma formule</span>}
            </Link>

            <Link
              href="/merchant/profil"
              title={menuOuvert ? undefined : 'Mon profil'}
              className={lienSecondaire}
            >
              <UserCog size={20} className="flex-shrink-0" />
              {menuOuvert && <span className="truncate">Mon profil</span>}
            </Link>

            {orgId && (
              <Link
                href={`/merchant/${orgId}/support`}
                title={menuOuvert ? undefined : 'Support'}
                className={lienSecondaire}
              >
                <MessageCircle size={20} className="flex-shrink-0" />
                {menuOuvert && <span className="truncate">Support</span>}
              </Link>
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={seDeconnecter}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-900/20 transition-colors text-red-400"
          >
            <LogOut size={20} className="flex-shrink-0" />
            {menuOuvert && <span className="truncate">Déconnexion</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setMenuOuvert(!menuOuvert)}
            title={menuOuvert ? 'Replier le menu' : 'Déplier le menu'}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {menuOuvert ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">
              {pathname === '/merchant/formule'
                ? 'Votre formule et la grille tarifaire'
                : pathname === '/merchant/profil'
                  ? 'Vos informations de facturation et votre compte'
                  : 'Choisissez le commerce à gérer'}
            </div>
            {/* Une réponse du support arrive souvent pendant qu'on choisit sa
                boutique : la cloche manquait à ce niveau-là. */}
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
