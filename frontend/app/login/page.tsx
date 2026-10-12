import { headers } from 'next/headers';
import { espaceDuDomaine } from '@/lib/domaines';
import LoginForm from './LoginForm';
import type { MarqueConnexion } from '@/components/auth/LogoConnexion';

export default async function LoginPage() {
  const entetes = await headers();
  const hote = entetes.get('x-forwarded-host') || entetes.get('host') || '';
  const espace = espaceDuDomaine(hote);

  // /login est partagé entre les domaines : son identité suit le domaine
  // demandé, comme la navigation globale.
  const marque: MarqueConnexion =
    espace === 'groupe' || espace === 'vitrine'
      ? 'zupone'
      : espace === 'drive' || espace === 'chauffeur'
        ? 'zupdrive'
        : 'zupeat';

  return <LoginForm marque={marque} />;
}

