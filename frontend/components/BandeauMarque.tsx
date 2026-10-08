import { MARQUES, type Marque } from '@/lib/marques';

/**
 * Le grand bandeau d'accroche des vitrines du groupe : un aplat arrondi aux
 * couleurs de la marque, le titre, le texte, puis les actions en enfants.
 * Des emojis en filigrane, sur grand écran, donnent le ton sans image.
 */
export function BandeauMarque({
  marque,
  badge,
  titre,
  texte,
  emojis = [],
  children,
}: {
  marque: Marque;
  badge?: React.ReactNode;
  titre: React.ReactNode;
  texte?: React.ReactNode;
  emojis?: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6 md:pt-6">
      <section
        className={`relative overflow-hidden rounded-3xl px-6 py-12 text-white md:px-12 md:py-16 ${MARQUES[marque].bandeau}`}
      >
        {emojis.length > 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 rotate-6 select-none grid-cols-3 gap-x-10 gap-y-8 text-7xl lg:grid"
          >
            {emojis.slice(0, 6).map((emoji, i) => (
              <span key={i} className="drop-shadow-xl">
                {emoji}
              </span>
            ))}
          </div>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10" />

        <div className="relative max-w-2xl">
          {badge && (
            <span className="mb-5 inline-block rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold backdrop-blur-sm">
              {badge}
            </span>
          )}
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">{titre}</h1>
          {texte && <p className="mt-4 text-lg text-white/90 md:text-xl">{texte}</p>}
          {children && <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div>}
        </div>
      </section>
    </div>
  );
}
