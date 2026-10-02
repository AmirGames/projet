import { EnTeteMarque } from '@/components/EnTeteMarque';

/**
 * Le passager ZupDrive commande et suit ses trajets sous l'en-tête de sa
 * plateforme : la barre globale, aux couleurs de ZupEat, n'a rien à faire ici
 * (voir ESPACES_AVEC_NAVIGATION dans components/RootLayoutContent.tsx).
 */
export default function LayoutTrajet({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <EnTeteMarque marque="zupdrive" href="/zupdrive" />
      {children}
    </div>
  );
}
