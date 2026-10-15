import { getTranslations } from 'next-intl/server';
import Link from '@/components/LienRegional';
import { EMAIL_CONTACT, PAGES_LEGALES } from '@/lib/editeur';

/** Cadre commun des pages légales : sommaire à gauche, texte lisible à droite. */
export default async function LayoutLegal({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('piedDeGroupe');

  return (
    <div className="min-h-screen bg-[#FFF9F4] text-slate-800">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[220px_1fr] md:gap-10 md:px-10 md:py-12">
        <nav aria-label={t('legal')} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm md:sticky md:top-24 md:self-start">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#D94B00]">
            {t('legal')}
          </p>
          <ul className="space-y-2 text-sm">
            {PAGES_LEGALES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className="text-slate-600 transition-colors hover:text-[#D94B00] hover:underline">
                  {t(`pages.${page.cle}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="legal max-w-3xl rounded-3xl border border-orange-100 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
          {children}
          <p className="mt-12 border-t border-orange-100 pt-4 text-sm text-slate-500">
            {t('question')} <a href={`mailto:${EMAIL_CONTACT}`}>{EMAIL_CONTACT}</a>.
          </p>
        </article>
      </div>
    </div>
  );
}
