import { headers } from 'next/headers';
import { espaceDuDomaine, estDomaineZupDrive } from '@/lib/domaines';
import SignupForm from './SignupForm';
import type { MarqueConnexion } from '@/components/auth/LogoConnexion';
import { cheminInterne } from '@/lib/chemin-interne';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const retour = cheminInterne((await searchParams).next);
  const entetes = await headers();
  const hote = entetes.get('x-forwarded-host') || entetes.get('host') || '';
  const espace = espaceDuDomaine(hote);
  const marque: MarqueConnexion =
    espace === 'groupe' || espace === 'vitrine'
      ? 'zupone'
      : espace === 'drive' || espace === 'chauffeur' || estDomaineZupDrive(hote)
        ? 'zupdrive'
        : 'zupeat';

  return <SignupForm marque={marque} retour={retour} />;
}

