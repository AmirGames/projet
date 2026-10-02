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
}: {
  marque: Marque;
  /** Où mène le logo : l'accueil de la marque. */
  href?: string;
  children?: React.ReactNode;
}) {
  const theme = MARQUES[marque];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href={href} className="flex flex-shrink-0 items-center gap-2 text-gray-900 hover:no-underline">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-extrabold ${theme.logo}`}
            aria-hidden="true"
          >
            Z
          </span>
          <span className="text-xl font-extrabold tracking-tight">{theme.nom}</span>
        </Link>
        {children && <div className="flex min-w-0 items-center gap-2 md:gap-4">{children}</div>}
      </div>
    </header>
  );
}
