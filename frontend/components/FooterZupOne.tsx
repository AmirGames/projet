import { getTranslations } from 'next-intl/server';
import Link from '@/components/LienRegional';
import { NomMarque } from '@/components/NomMarque';
import { accueilDe, lienVersEspace } from '@/lib/domaines';
import { EMAIL_CONTACT, PAGES_LEGALES } from '@/lib/editeur';

export async function FooterZupOne() {
  const [t, groupe] = await Promise.all([
    getTranslations('vitrineZupone'),
    getTranslations('piedDeGroupe'),
  ]);

  const colonnes = [
    {
      titre: t('navPlatforms'),
      liens: [
        { href: '/zupone#plateformes', label: t('navPlatforms') },
        { href: '/zupone#rejoindre', label: t('navJoin') },
      ],
    },
    {
      titre: groupe('plateformes'),
      liens: [
        { href: accueilDe('public'), label: 'ZupEat', marque: 'zupeat' as const },
        { href: accueilDe('drive'), label: 'ZupDrive', marque: 'zupdrive' as const },
        { href: lienVersEspace('groupe', '/superowner'), label: groupe('espaceEquipe') },
      ],
    },
    {
      titre: groupe('legal'),
      liens: PAGES_LEGALES.map((page) => ({
        href: page.href,
        label: groupe(`pages.${page.cle}`),
      })),
    },
  ];

  return (
    <footer className="border-t border-white/10 bg-[#090B0E] text-white" aria-label={groupe('legal')}>
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-14">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
          <div className="col-span-2 max-w-xs md:col-span-1">
            <Link href="/zupone" aria-label="ZupOne — accueil" className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B274]">
              <NomMarque marque="zupone" className="text-2xl font-black tracking-tight text-white" />
            </Link>
            <p className="mt-3 text-sm leading-6 text-white/60">{groupe('groupe')}</p>
            <a href={`mailto:${EMAIL_CONTACT}`} className="mt-3 inline-flex rounded-sm text-sm font-medium text-white/75 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B274]">
              {EMAIL_CONTACT}
            </a>
          </div>
          {colonnes.map((colonne) => (
            <nav key={colonne.titre} aria-label={colonne.titre}>
              <h2 className="text-sm font-bold text-white">{colonne.titre}</h2>
              <ul className="mt-4 space-y-2.5">
                {colonne.liens.map((lien) => (
                  <li key={lien.href}>
                    <Link href={lien.href} className="rounded-sm text-sm text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B274]">
                      {'marque' in lien && lien.marque ? <NomMarque marque={lien.marque} /> : lien.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('footerCopyright', { year: new Date().getFullYear() })}</p>
          <Link href={accueilDe('vitrine')} className="w-fit rounded-sm font-semibold text-white/75 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B274]">
            zupone.com →
          </Link>
        </div>
      </div>
    </footer>
  );
}

