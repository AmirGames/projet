'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

// Ces écrans restent joignables en maintenance, côté API comme côté interface :
// sans eux, personne ne pourrait se connecter pour désactiver le mode.
const CHEMINS_EXEMPTS = ['/login', '/superowner'];

/**
 * Affiche un écran de maintenance dès qu'une réponse de l'API revient en 503
 * avec le code MAINTENANCE_MODE.
 *
 * Les pages appellent `fetch` directement, chacune avec sa propre gestion
 * d'erreur : sans ce garde-fou, une plateforme en maintenance se traduirait par
 * un « Erreur lors du chargement » incompréhensible sur chaque écran. On
 * enveloppe donc `fetch` une seule fois, au lieu de modifier chaque page.
 */
export function MaintenanceGate() {
  const t = useTranslations('maintenanceGate');
  const [message, setMessage] = useState('');
  const pathname = usePathname();
  const exempt = CHEMINS_EXEMPTS.some((chemin) => (pathname || '').startsWith(chemin));

  useEffect(() => {
    const originel = window.fetch;

    window.fetch = async (...args) => {
      try {
        const reponse = await originel(...args);
        if (reponse.status === 403) {
          try {
            const donnees = await reponse.clone().json();
            if (['MFA_REQUIRED', 'MFA_ENROLLMENT_REQUIRED', 'MFA_RECENT_REQUIRED', 'MFA_ROTATION_REQUIRED'].includes(donnees?.code)) {
              window.dispatchEvent(new Event('mfa-required'));
            }
          } catch { /* Le refus d'origine reste transmis à l'appelant. */ }
        }

        if (reponse.status === 503) {
          // Le corps ne peut être lu qu'une fois : on travaille sur une copie
          // pour que la page appelante reçoive sa réponse intacte.
          try {
            const donnees = await reponse.clone().json();
            if (donnees?.code === 'MAINTENANCE_MODE') {
              setMessage(donnees.error || t('enMaintenance'));
            }
          } catch {
            // Un 503 sans corps JSON ne vient pas du mode maintenance.
          }
        }

        return reponse;
      } catch (error) {
        // Propager l'erreur au lieu de la laisser silencieuse
        throw error;
      }
    };

    return () => {
      window.fetch = originel;
    };
  }, [t]);

  if (!message || exempt) return null;

  return (
    <div className="fixed inset-0 z-100 bg-[#F7F7F6] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
          <Wrench size={32} className="text-orange-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600">{message || t('message')}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-semibold transition-colors"
        >
          {t('reessayer')}
        </button>
      </div>
    </div>
  );
}
