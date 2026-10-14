import Link from '@/components/LienRegional';
import { useTranslations } from 'next-intl';
import { accueilDe, lienVersEspace } from '@/lib/domaines';
import { EMAIL_CONTACT } from '@/lib/editeur';
import { NomMarque } from '@/components/NomMarque';

export function MarketplaceFooter() {
  const t = useTranslations('marketplaceFooter');

  const colonnes: { titre: string; navLabel: string; marque?: boolean; liens: { href: string; label: string }[] }[] = [
    {
      titre: t('discover'),
      navLabel: t('discover'),
      liens: [
        { href: '/restaurants', label: t('shops') },
        { href: '/client/favorites', label: t('favorites') },
        { href: '/client/orders', label: t('orders') },
      ],
    },
    {
      titre: t('brand'),
      navLabel: t('brand'),
      marque: true,
      liens: [
        { href: '/devenir-commercant', label: t('partner') },
        { href: '/devenir-livreur', label: t('courier') },
        { href: '/zupone#plateformes', label: t('business') },
        { href: lienVersEspace('groupe', '/superowner'), label: t('team') },
      ],
    },
    {
      titre: t('help'),
      navLabel: t('help'),
      liens: [
        { href: '/client#comment-ca-marche', label: t('howItWorks') },
        { href: `mailto:${EMAIL_CONTACT}`, label: EMAIL_CONTACT },
        { href: '/mentions-legales', label: t('legalNotice') },
        { href: '/cgu', label: t('terms') },
        { href: '/confidentialite', label: t('privacy') },
      ],
    },
  ];

  return (
    <footer className="mt-0 border-t border-white/10 bg-[#090B0E] text-white" aria-label={t('landmark')}>
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-14">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 max-w-xs md:col-span-1">
            <Link href="/client" aria-label="ZupEat — accueil" className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
              <NomMarque marque="zupeat" className="text-2xl font-black tracking-[-0.06em] text-white" />
            </Link>
            <p className="mt-3 text-sm leading-6 text-white/65">{t('tagline')}</p>
          </div>
          {colonnes.map((colonne) => (
            <nav key={colonne.titre} aria-label={colonne.navLabel ?? colonne.titre}>
              <h2 className="text-sm font-bold text-white">
                {colonne.marque ? <NomMarque marque="zupeat" /> : colonne.titre}
              </h2>
              <ul className="mt-4 space-y-3">
                {colonne.liens.map((lien) => (
                  <li key={lien.href}>
                    {lien.href.startsWith('mailto:') ? (
                      <a href={lien.href} className="rounded-sm text-sm text-white/65 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
                        {lien.label}
                      </a>
                    ) : (
                      <Link
                        href={lien.href}
                        className="rounded-sm text-sm text-white/65 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
                      >
                        {lien.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <p className="inline-flex items-center gap-1">
            {t('groupAttribution')}
            <Link href={accueilDe('vitrine')} className="rounded-sm font-semibold text-white hover:text-[#FF7A00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
              <NomMarque marque="zupone" />
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}


