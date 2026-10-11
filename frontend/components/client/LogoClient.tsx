import Link from 'next/link';

/** Wordmark ZupEat sans reprendre l'identité visuelle d'une autre plateforme. */
export function LogoClient({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="ZupEat, accueil">
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-[#FF7A00] text-base font-black text-black shadow-sm">
        Z
      </span>
      {!compact && <span className="text-xl font-black tracking-[-0.06em] text-black">ZupEat</span>}
    </span>
  );
}

export function LienLogoClient({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/client" aria-label="ZupEat — accueil" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2">
      <LogoClient compact={compact} />
    </Link>
  );
}
