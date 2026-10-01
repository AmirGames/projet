'use client';

import { BandeauCommandeEnCours } from '@/components/BandeauCommandeEnCours';
import { EnTeteClient } from '@/components/EnTeteClient';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /**
   * Le panier global a disparu avec l'ancien tunnel.
   *
   * Le site tient un panier **par commerce** (`lib/paniers.ts`) : un
   * fournisseur de panier unique enveloppait ces pages sans que personne ne le
   * lise, et laissait croire à deux systèmes de panier concurrents.
   */
  return (
    <div className="min-h-screen bg-white">
      <EnTeteClient />

      <BandeauCommandeEnCours />

      <main>{children}</main>
    </div>
  );
}
