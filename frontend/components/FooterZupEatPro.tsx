import Link from '@/components/LienRegional';
import { useTranslations } from 'next-intl';
import { accueilDe, lienVersEspace } from '@/lib/domaines';

export function FooterZupEatPro() {
  const t = useTranslations('accueilPro');
  const colonnes = [
    {
      titre: t('footerDiscover'),
      liens: [
        { href: accueilDe('public'), label: t('commerces') },
        { href: '/devenir-commercant', label: t('devenirCommercant') },
      ],
    },
    {
      titre: t('footerPartners'),
      liens: [
        { href: lienVersEspace('livreur', '/devenir-livreur'), label: t('devenirLivreur') },
      ],
    },
    {
      titre: t('footerAccount'),
      liens: [
        { href: '/login', label: t('connexion') },
        { href: '/signup', label: t('creerBoutique') },
        { href: '/mentions-legales', label: t('footerLegal') },
      ],
    },
  ];

  return (
    <footer className="border-t border-neutral-200 bg-[#FAFAF9]" aria-label={t('footerLabel')}>
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-14 lg:px-10">
        <div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-12">
          <div className="max-w-xs">
            <Link href="/" aria-label="ZupEat — accueil" className="inline-flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-[#FF7A00] text-base font-black text-black">Z</span>
              <span className="text-xl font-black tracking-[-.055em] text-black">Zup<span className="text-[#FF7A00]">Eat</span></span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-neutral-600">{t('footerTagline')}</p>
          </div>

          {colonnes.map((colonne) => (
            <nav key={colonne.titre} aria-label={colonne.titre}>
              <h2 className="text-sm font-extrabold text-black">{colonne.titre}</h2>
              <ul className="mt-4 space-y-3">
                {colonne.liens.map((lien) => (
                  <li key={lien.href}>
                    <Link href={lien.href} className="rounded-sm text-sm text-neutral-600 transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
                      {lien.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('footerCopyright', { year: new Date().getFullYear() })}</p>
          <a href="mailto:contact@zupeat.com" className="w-fit rounded-sm transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">contact@zupeat.com</a>
        </div>
      </div>
    </footer>
  );
}

