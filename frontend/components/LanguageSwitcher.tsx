'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { LANGUES_SUPPORTEES, NOM_COOKIE_LANGUE, type Langue } from '@/i18n/langues';
import { useState, useRef, useEffect } from 'react';

const NOM_LANGUE: Record<Langue, string> = {
  fr: 'Français',
  en: 'English',
};

/**
 * Pas de segment d'URL à changer : on pose juste le cookie de langue, puis on
 * redemande à Next.js de re-rendre les pages serveur avec ce cookie — la même
 * adresse reste affichée, seul le contenu change de langue.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Langue;
  const t = useTranslations('nav');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const changerDeLangue = (langue: Langue) => {
    document.cookie = `${NOM_COOKIE_LANGUE}=${langue};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setIsOpen(false);
    router.refresh();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition"
        aria-label={t('language')}
        title={t('language')}
      >
        <Globe size={20} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-50">
          {LANGUES_SUPPORTEES.map((langue) => (
            <button
              key={langue}
              onClick={() => changerDeLangue(langue)}
              className={`w-full text-left px-4 py-3 transition ${
                locale === langue
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-200 hover:bg-gray-600'
              } ${langue === LANGUES_SUPPORTEES[0] ? 'rounded-t-lg' : ''} ${
                langue === LANGUES_SUPPORTEES[LANGUES_SUPPORTEES.length - 1]
                  ? 'rounded-b-lg'
                  : ''
              }`}
            >
              {NOM_LANGUE[langue]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
