import Link from 'next/link';
import { lienVersEspace } from '@/lib/domaines';

/** Wordmark partagé par les parcours d'authentification du compte ZupOne. */
export function LogoZupOne() {
  return (
    <Link
      href={lienVersEspace('vitrine', '/zupone')}
      aria-label="ZupOne — accueil"
      className="mx-auto mb-8 inline-flex items-center gap-2 rounded-lg text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
    >
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-black text-sm font-black text-white">Z</span>
      <span className="text-lg font-black tracking-tight">ZupOne</span>
    </Link>
  );
}

