import Link from '@/components/LienRegional';

import { MARQUES, type Marque } from '@/lib/marques';

/**
 * L'en-tête blanc des vitrines du groupe (ZupOne, ZupDrive, pages « Devenir
 * … ») : le logo de la marque à gauche, la navigation passée en enfants à
 * droite. Même allure que l'en-tête du parcours client ZupEat.
 */
export function EnTeteMarque({
  marque,
  href = '/',
  children,
  themeSombre = false,
}: {
  marque: Marque;
  /** Où mène le logo : l'accueil de la marque. */
  href?: string;
  children?: React.ReactNode;
  /** En-tête transparent adapté aux vitrines sombres. */
  themeSombre?: boolean;
}) {
  const theme = MARQUES[marque];
  const suffixe = marque === 'zupeat' ? 'Eat' : marque === 'zupone' ? 'One' : 'Drive';
  const couleurSuffixe = marque === 'zupeat' ? 'text-[#FF7A00]' : marque === 'zupone' ? 'text-[#D8B274]' : 'text-blue-500';

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${themeSombre ? 'border-white/10 bg-[#090B0E]/95 text-white' : 'border-gray-100 bg-white'}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href={href} aria-label={`${theme.nom} — accueil`} className={`flex shrink-0 items-center gap-2 hover:no-underline ${themeSombre ? 'text-white' : 'text-gray-900'}`}>
          {!themeSombre && (
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-extrabold ${theme.logo}`} aria-hidden="true">
              Z
            </span>
          )}
          <span className="text-xl font-extrabold tracking-tight">Zup<span className={couleurSuffixe}>{suffixe}</span></span>
        </Link>
        {children && <div className="flex min-w-0 items-center gap-2 md:gap-4">{children}</div>}
      </div>
    </header>
  );
}

