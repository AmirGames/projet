'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import { loadThemeFromAPI, loadSavedTheme } from '@/lib/theme-config';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RootLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
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
        console.error('Erreur lors du chargement du thème:', error);
        loadSavedTheme();
      }
    };

    initializeTheme();
  }, [API_URL]);

  // Masquer la navbar sur :
  // - la page d'accueil (qui a son propre header)
  // - les pages d'impression (qui ne portent que le document à imprimer)
  // - les pages superowner (qui ont leur propre navigation sidebar + topbar)
  // La navbar s'affiche partout ailleurs pour permettre la navigation.
  const hideNavbar = pathname === '/' ||
                     pathname?.startsWith('/impression') ||
                     pathname?.startsWith('/superowner');

  return (
    <>
      {!hideNavbar && <Navbar />}
      {children}
    </>
  );
}
