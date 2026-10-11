import Link from 'next/link';
import { lienVersEspace } from '@/lib/domaines';

export type MarqueConnexion = 'zupeat' | 'zupone' | 'zupdrive';

const IDENTITES: Record<MarqueConnexion, { nom: string; accueil: string; fond: string; accent?: string }> = {
  zupeat: { nom: 'ZupEat', accueil: lienVersEspace('public', '/client'), fond: 'bg-[#FF7A00] text-black', accent: 'text-[#FF7A00]' },
  zupone: { nom: 'ZupOne', accueil: lienVersEspace('vitrine', '/zupone'), fond: 'bg-black text-white', accent: 'text-[#2563EB]' },
  zupdrive: { nom: 'ZupDrive', accueil: lienVersEspace('drive', '/zupdrive'), fond: 'bg-blue-600 text-white', accent: 'text-blue-600' },
};

/** Wordmark du parcours de connexion, adapté au domaine actuellement visité. */
export function LogoConnexion({ marque }: { marque: MarqueConnexion }) {
  const identite = IDENTITES[marque];
  const premierMot = identite.nom.slice(0, 3);
  const suffixe = identite.nom.slice(3);

  return (
    <Link
      href={identite.accueil}
      aria-label={`${identite.nom} — accueil`}
      className="mx-auto mb-8 inline-flex items-center gap-2 rounded-lg text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
    >
      <span aria-hidden="true" className={`grid size-9 place-items-center rounded-xl text-sm font-black ${identite.fond}`}>Z</span>
      <span className="text-lg font-black tracking-tight">
        {premierMot}<span className={identite.accent}>{suffixe}</span>
      </span>
    </Link>
  );
}

