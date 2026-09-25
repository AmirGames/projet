import Link from 'next/link';
import { EMAIL_CONTACT, PAGES_LEGALES } from '@/lib/editeur';

/** Cadre commun des pages légales : sommaire à gauche, texte lisible à droite. */
export default function LayoutLegal({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[220px_1fr] md:px-10">
        <nav aria-label="Informations légales" className="md:sticky md:top-24 md:self-start">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Informations légales
          </p>
          <ul className="space-y-2 text-sm">
            {PAGES_LEGALES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className="text-slate-600 hover:text-slate-900 hover:underline">
                  {page.titre}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="legal max-w-3xl">
          {children}
          <p className="mt-12 border-t border-slate-200 pt-4 text-sm text-slate-500">
            Une question ? Écrivez-nous à <a href={`mailto:${EMAIL_CONTACT}`}>{EMAIL_CONTACT}</a>.
          </p>
        </article>
      </div>
    </div>
  );
}
