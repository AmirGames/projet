'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Crown, LayoutDashboard, Shield, ShoppingBag, Store, Truck } from 'lucide-react';
import { preparerEspace, useEspacesAccessibles, type Espace } from '@/lib/espaces';

const ICONES: Record<Espace, typeof Store> = {
  client: ShoppingBag,
  driver: Truck,
  merchant: Store,
  admin: LayoutDashboard,
  'super-admin': Shield,
  superowner: Crown,
};

/**
 * Le logo d'un espace, qui devient un menu pour passer dans un autre espace
 * du même compte (livreur, commerçant, client, administration…).
 *
 * Sans autre espace ouvert au compte, il reste un simple lien vers `href`.
 */
export function SelecteurEspace({
  actuel,
  href,
  children,
  className = 'gap-2',
  chevron = true,
}: {
  actuel: Espace;
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Faux quand la barre latérale est repliée : il n'y a place que pour l'icône. */
  chevron?: boolean;
}) {
  const router = useRouter();
  const { espaces, premiereOrg } = useEspacesAccessibles();
  const [ouvert, setOuvert] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOuvert(false);
    };
    const echap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', fermer);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  const autres = espaces.filter((espace) => espace.id !== actuel);
  if (autres.length === 0) {
    return (
      <Link href={href} className={`flex items-center ${className}`}>
        {children}
      </Link>
    );
  }

  const aller = (id: Espace, destination: string) => {
    setOuvert(false);
    if (id === actuel) return;
    preparerEspace(id, premiereOrg);
    router.push(destination);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOuvert(!ouvert)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        title="Changer d'espace"
        className={`flex items-center rounded-lg hover:bg-gray-700/60 transition text-left ${className}`}
      >
        {children}
        {chevron && (
          <ChevronDown
            size={16}
            className={`ml-auto flex-shrink-0 text-gray-400 transition-transform ${ouvert ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-60 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1"
        >
          <p className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-500">Changer d&apos;espace</p>
          {espaces.map((espace) => {
            const Icone = ICONES[espace.id];
            const estActuel = espace.id === actuel;
            return (
              <button
                key={espace.id}
                type="button"
                role="menuitem"
                onClick={() => aller(espace.id, espace.href)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                  estActuel ? 'text-white bg-gray-700/60' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <Icone size={18} className="flex-shrink-0" />
                <span className="flex-1 text-left">{espace.libelle}</span>
                {estActuel && <Check size={16} className="text-orange-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
