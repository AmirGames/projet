import { headers } from 'next/headers';
import { espaceDuDomaine } from '@/lib/domaines';
import SignupForm from './SignupForm';
import type { MarqueConnexion } from '@/components/auth/LogoConnexion';

export default async function SignupPage() {
  const entetes = await headers();
  const hote = entetes.get('x-forwarded-host') || entetes.get('host') || '';
  const espace = espaceDuDomaine(hote);
  const marque: MarqueConnexion =
    espace === 'groupe' || espace === 'vitrine'
      ? 'zupone'
      : espace === 'drive' || espace === 'chauffeur'
        ? 'zupdrive'
        : 'zupeat';

  return <SignupForm marque={marque} />;
}

