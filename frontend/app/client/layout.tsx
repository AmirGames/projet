import type { Metadata } from 'next';
import { BandeauCommandeEnCours } from '@/components/BandeauCommandeEnCours';
import { EnTeteClient } from '@/components/EnTeteClient';
import { MarketplaceFooter } from '@/components/client/MarketplaceFooter';

export const metadata: Metadata = {
  title: 'Commerces de proximité, livrés chez vous — ZupEat',
  description: 'Découvrez les commerces et artisans près de chez vous et faites-vous livrer avec ZupEat.',
};

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
      <MarketplaceFooter />
    </div>
  );
}
