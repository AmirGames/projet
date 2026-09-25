'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { NOM_COOKIE_LANGUE, type Langue } from '@/i18n/langues';
import {
  NOM_COOKIE_REGION,
  REGIONS,
  regionParDefaut,
  regionsSuggerees,
  trouverRegion,
  type Region,
} from '@/i18n/regions';

const UN_AN = 60 * 60 * 24 * 365;

function lireCookie(nom: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nom}=`))
    ?.split('=')[1];
}

/**
 * Le sélecteur de région : le bouton affiche le pays en cours, et ouvre une
 * fenêtre où chaque carte associe une langue et un pays.
 *
 * Pas encore de segment d'URL : choisir une région pose le cookie de région
 * et celui de langue, puis redemande à Next.js de re-rendre les pages serveur
 * — la même adresse reste affichée. Les sous-répertoires /be-fr/… viendront
 * s'appuyer sur ce même cookie.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Langue;
  const t = useTranslations('nav');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [region, setRegion] = useState<Region>(() => regionParDefaut(locale));
  const [suggerees, setSuggerees] = useState<Region[]>([]);

  // Le cookie n'est lisible qu'une fois dans le navigateur. Une région dont
  // la langue ne correspond plus (langue changée ailleurs) est ignorée.
  useEffect(() => {
    const enregistree = trouverRegion(lireCookie(NOM_COOKIE_REGION));
    setRegion(enregistree && enregistree.langue === locale ? enregistree : regionParDefaut(locale));
  }, [locale]);

  useEffect(() => {
    if (!isOpen) return;
    setSuggerees(regionsSuggerees(region, navigator.languages ?? [navigator.language]));

    const fermerAuClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const debordement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', fermerAuClavier);
    return () => {
      document.body.style.overflow = debordement;
      document.removeEventListener('keydown', fermerAuClavier);
    };
  }, [isOpen, region]);

  const choisir = (choix: Region) => {
    document.cookie = `${NOM_COOKIE_REGION}=${choix.code};path=/;max-age=${UN_AN};samesite=lax`;
    document.cookie = `${NOM_COOKIE_LANGUE}=${choix.langue};path=/;max-age=${UN_AN};samesite=lax`;
    setRegion(choix);
    setIsOpen(false);
    if (choix.langue !== locale) router.refresh();
  };

  const carte = (r: Region, encadree: boolean) => (
    <button
      key={r.code}
      onClick={() => choisir(r)}
      className={`text-left px-4 py-3 rounded-xl border transition ${
        encadree ? 'border-gray-900' : 'border-transparent hover:bg-gray-100'
      }`}
    >
      <span className="block text-gray-900">{r.nomLangue}</span>
      <span className="block text-gray-500">{r.nomPays}</span>
    </button>
  );

  const pays = region.code.split('-')[0].toUpperCase();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition"
        aria-label={`${t('region')} : ${region.nomPays} (${region.nomLangue})`}
        title={`${region.nomPays} · ${region.nomLangue}`}
      >
        <Globe size={20} />
        <span className="text-sm font-medium">{pays}</span>
      </button>

      {/* Rendue sous <body> : plusieurs en-têtes qui accueillent ce bouton
          sont sticky ou en overflow caché, ce qui rognerait la fenêtre. */}
      {isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="region-titre"
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 sm:p-6"
            onMouseDown={(e) => e.target === e.currentTarget && setIsOpen(false)}
          >
            <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white text-gray-900 shadow-2xl">
              <div className="px-6 pt-5">
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition"
                  aria-label={t('close')}
                >
                  <X size={20} />
                </button>
                <div className="mt-4 border-b border-gray-200">
                  <span className="inline-block pb-3 border-b-2 border-gray-900 font-medium">
                    {t('languageAndRegion')}
                  </span>
                </div>
              </div>

              <div className="overflow-y-auto px-6 pb-8">
                <h2 id="region-titre" className="text-2xl font-semibold mt-8 mb-4">
                  {t('suggestedRegions')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {suggerees.map((r) => carte(r, false))}
                </div>

                <h2 className="text-2xl font-semibold mt-10 mb-4">{t('chooseRegion')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {REGIONS.map((r) => carte(r, r.code === region.code))}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
