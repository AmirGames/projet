import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LienLogoClient } from './LogoClient';

export function MarketplaceFooter() {
  const t = useTranslations('marketplaceFooter');

  const colonnes = [
    {
      titre: t('discover'),
      liens: [
        { href: '/restaurants', label: t('shops') },
        { href: '/client/favorites', label: t('favorites') },
        { href: '/client/orders', label: t('orders') },
      ],
    },
    {
      titre: t('partners'),
      liens: [
        { href: '/devenir-livreur', label: t('courier') },
        { href: '/devenir-commercant', label: t('merchant') },
      ],
    },
    {
      titre: t('legal'),
      liens: [
        { href: '/mentions-legales', label: t('legalNotice') },
        { href: '/cgu', label: t('terms') },
        { href: '/cgv', label: t('salesTerms') },
        { href: '/confidentialite', label: t('privacy') },
      ],
    },
  ];

  return (
    <footer className="mt-20 border-t border-neutral-200 bg-neutral-50" aria-label={t('landmark')}>
      <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <LienLogoClient />
            <p className="mt-4 text-sm leading-6 text-neutral-600">{t('tagline')}</p>
          </div>
          {colonnes.map((colonne) => (
            <nav key={colonne.titre} aria-label={colonne.titre}>
              <h2 className="text-sm font-bold text-black">{colonne.titre}</h2>
              <ul className="mt-4 space-y-3">
                {colonne.liens.map((lien) => (
                  <li key={lien.href}>
                    <Link
                      href={lien.href}
                      className="rounded-sm text-sm text-neutral-600 transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
                    >
                      {lien.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <p>{t('madeForLocal')}</p>
        </div>
      </div>
    </footer>
  );
}

