const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type Niveau = 'read' | 'write';

/** Ce que le compte connecté peut voir et faire dans l'espace superowner. */
export interface AccesPlateforme {
  isSuperOwner: boolean;
  role: string;
  roleLabel?: string;
  permissions: Record<string, Niveau>;
}

export async function chargerAcces(): Promise<AccesPlateforme> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_URL}/api/superowner/me/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('acces');
  return res.json();
}

// Chaque page de l'espace et la section qui l'ouvre. `null` : réservée au
// superowner (l'équipe et ses droits).
const PAGES: [string, string | null][] = [
  ['/superowner/user-management', null],
  ['/superowner/roles', null],
  ['/superowner/members', 'members'],
  ['/superowner/versements', 'payouts'],
  ['/superowner/reviews', 'reviews'],
];

/** La section d'une page de l'espace, d'après son chemin. */
export function sectionDuChemin(chemin: string): string | null {
  if (chemin === '/superowner' || chemin === '/superowner/') return 'dashboard';
  const connue = PAGES.find(([prefixe]) => chemin.startsWith(prefixe));
  if (connue) return connue[1];
  // Les autres pages portent le nom de leur section : /superowner/<section>/…
  return chemin.split('/')[2] ?? null;
}
