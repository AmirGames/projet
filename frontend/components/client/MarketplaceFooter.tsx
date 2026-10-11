import Link from 'next/link';
import { LienLogoClient } from './LogoClient';

const liens = [
  { href: '/restaurants', label: 'Découvrir les commerces' },
  { href: '/devenir-livreur', label: 'Devenir livreur' },
  { href: '/devenir-commercant', label: 'Devenir partenaire' },
  { href: '/legal', label: 'Conditions et confidentialité' },
];

export function MarketplaceFooter() {
  return (
    <footer className="mt-20 border-t border-neutral-200 bg-neutral-50" aria-label="Pied de page">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1fr_auto] md:items-start md:px-8">
        <div className="max-w-md">
          <LienLogoClient />
          <p className="mt-4 text-sm leading-6 text-neutral-600">Les bonnes choses de vos commerces de quartier, livrées simplement.</p>
        </div>
        <nav aria-label="Liens de pied de page" className="flex flex-col gap-3 text-sm font-medium text-neutral-700 sm:flex-row sm:flex-wrap sm:gap-x-6">
          {liens.map((lien) => <Link key={lien.href} href={lien.href} className="rounded-sm hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">{lien.label}</Link>)}
        </nav>
        <p className="text-xs text-neutral-500 md:col-span-2">© {new Date().getFullYear()} ZupEat. Tous droits réservés.</p>
      </div>
    </footer>
  );
}
