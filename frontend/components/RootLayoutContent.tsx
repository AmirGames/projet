'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Navbar from './Navbar';
import SynchroPaniers from './SynchroPaniers';
import { loadThemeFromAPI, loadSavedTheme } from '@/lib/theme-config';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const ESPACES_AVEC_NAVIGATION = ['/superowner', '/super-admin', '/admin', '/client'];

// Pages du livreur affichées sans session : le layout livreur n'y montre
// aucune barre, la navbar globale reste donc la seule navigation.
const PAGES_LIVREUR_SANS_NAVIGATION = ['/driver/login', '/driver/signup'];

// Sous /merchant, seuls le niveau du choix de boutique et les pages d'une
// boutique (/merchant/:orgId/...) ont leur propre cadre (voir merchant/layout).
const PAGES_COMMERCANT_SANS_CADRE = ['orders', 'register', 'onboard'];

function aSaPropreNavigation(pathname: string | null): boolean {
  if (!pathname) return false;
  const sousChemin = (prefixe: string) =>
    pathname === prefixe || pathname.startsWith(prefixe + '/');

  if (ESPACES_AVEC_NAVIGATION.some(sousChemin)) return true;

  if (sousChemin('/driver')) {
    return !PAGES_LIVREUR_SANS_NAVIGATION.some(sousChemin);
  }

  if (sousChemin('/merchant')) {
    const segment = pathname.split('/')[2];
    return !segment || !PAGES_COMMERCANT_SANS_CADRE.includes(segment);
  }

  return false;
}

export default function RootLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('rootLayoutContent');
  const pathname = usePathname();

  useEffect(() => {
    const initializeTheme = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const isSuperOwner = localStorage.getItem('isSuperOwner') === 'true';

        if (token && isSuperOwner) {
          await loadThemeFromAPI(API_URL, token);
        } else {
          loadSavedTheme();
        }
      } catch (error) {
        signalerErreur(t('themeError'), error);
        loadSavedTheme();
      }
    };

    initializeTheme();
  }, [t]);

  // Masquer la navbar sur :
  // - la page d'accueil (qui a son propre header)
  // - les pages d'impression (qui ne portent que le document à imprimer)
  // - les espaces qui ont déjà leur propre navigation (sidebar ou barre du
  //   haut) : sinon deux barres s'empilent en haut de page.
  // La navbar s'affiche partout ailleurs pour permettre la navigation.
  const hideNavbar = pathname === '/' ||
                     pathname?.startsWith('/impression') ||
                     aSaPropreNavigation(pathname);

  return (
    <>
      <SynchroPaniers />
      {!hideNavbar && <Navbar />}
      {children}
    </>
  );
}
