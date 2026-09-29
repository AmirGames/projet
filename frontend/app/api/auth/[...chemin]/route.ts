import { NextRequest } from 'next/server';
import { relayer } from '@/lib/relais-api';

// Jamais mis en cache ni pré-rendu : chaque appel est une session.
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ chemin: string[] }> };

const relais = async (requete: NextRequest, { params }: Contexte) =>
  relayer(requete, 'auth', (await params).chemin);

export { relais as GET, relais as POST };
