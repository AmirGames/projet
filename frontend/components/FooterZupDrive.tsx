'use client';

import Link from '@/components/LienRegional';
import { useTranslations } from 'next-intl';
import { accueilDe, lienVersEspace } from '@/lib/domaines';
import { EMAIL_CONTACT, PAGES_LEGALES } from '@/lib/editeur';

export function FooterZupDrive() {
  const t = useTranslations('footerZupdrive');
  const legal = useTranslations('piedDeGroupe');
  const liensLegaux = PAGES_LEGALES
    .filter(({ cle }) => ['mentions', 'cgu', 'confidentialite', 'cookies', 'accessibilite'].includes(cle))
    .map((page) => ({
      href: page.href,
      label: legal(`pages.${page.cle}`),
    }));
  const colonnes = [
    {
      titre: t('discover'),
      liens: [
        { href: '/trajet', label: t('bookRide') },
        { href: accueilDe('public'), label: t('zupeat') },
      ],
    },
    {
      titre: 'ZupDrive',
      liens: [
        { href: '/devenir-chauffeur', label: t('becomeDriver') },
        { href: lienVersEspace('chauffeur', '/chauffeur'), label: t('driverSpace') },
      ],
    },
    {
      titre: t('help'),
      liens: [
        { href: `mailto:${EMAIL_CONTACT}`, label: t('contact') },
        ...liensLegaux,
      ],
    },
  ];

  return (
    <footer className="border-t border-white/10 bg-[#090B0E] text-white" aria-label={t('label')}>
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-14 lg:px-10">
        <div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-12">
          <div className="max-w-xs">
            <Link href="/" aria-label="ZupDrive — accueil" className="inline-flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <span className="text-xl font-black tracking-[-.055em] text-white">Zup<span className="text-blue-500">Drive</span></span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-white/60">{t('description')}</p>
          </div>

          {colonnes.map((colonne) => (
            <nav key={colonne.titre} aria-label={colonne.titre}>
              <h2 className="text-sm font-extrabold text-white">{colonne.titre}</h2>
              <ul className="mt-4 space-y-3">
                {colonne.liens.map((lien) => (
                  <li key={lien.href}>
                    {lien.href.startsWith('mailto:') ? (
                      <a href={lien.href} className="rounded-sm text-sm text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                        {lien.label}
                      </a>
                    ) : (
                      <Link href={lien.href} className="rounded-sm text-sm text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                        {lien.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <Link href={accueilDe('vitrine')} className="w-fit rounded-sm font-medium text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            {t('groupService')}
          </Link>
        </div>
      </div>
    </footer>
  );
}

