const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type Niveau = 'read' | 'write';

/** Ce que le compte connecté peut voir et faire dans l'espace superowner. */
export interface AccesPlateforme {
  isSuperOwner: boolean;
  role: string;
  roleLabel?: string;
  permissions: Record<string, Niveau>;
}

/** Les sections de l'espace qui relèvent de ZupDrive, et non de ZupEat. */
const SECTIONS_DRIVE = ['chauffeurs', 'courses-drive'];

interface AccesParPlateforme {
  role: string;
  roleLabel?: string;
  permissions: Record<string, Niveau>;
}

/**
 * Les droits du compte dans l'espace, toutes plateformes réunies.
 *
 * Un rôle se donne plateforme par plateforme : les sections ZupDrive
 * (chauffeurs) viennent du rôle ZupDrive, toutes les autres du rôle ZupEat.
 * Un membre qui n'a de rôle que sur l'une des deux voit ce qu'elle ouvre.
 */
export async function chargerAcces(): Promise<AccesPlateforme> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_URL}/api/superowner/me/permissions/plateformes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('acces');
  const lu: {
    isSuperOwner: boolean;
    plateformes: Partial<Record<'EAT' | 'DRIVE', AccesParPlateforme | null>>;
  } = await res.json();
  const eat = lu.plateformes.EAT ?? null;
  const drive = lu.plateformes.DRIVE ?? null;

  const permissions: Record<string, Niveau> = {};
  for (const [section, niveau] of Object.entries(eat?.permissions ?? {})) {
    if (!SECTIONS_DRIVE.includes(section)) permissions[section] = niveau;
  }
  for (const section of SECTIONS_DRIVE) {
    const niveau = drive?.permissions[section];
    if (niveau) permissions[section] = niveau;
  }

  const base = eat ?? drive;
  return {
    isSuperOwner: lu.isSuperOwner,
    role: base?.role ?? '',
    roleLabel: base?.roleLabel,
    permissions,
  };
}

// Chaque page de l'espace et la section qui l'ouvre. `null` : réservée au
// superowner (l'équipe et ses droits).
const PAGES: [string, string | null][] = [
  ['/superowner/user-management', null],
  ['/superowner/roles', null],
  ['/superowner/members', 'members'],
  ['/superowner/versements', 'payouts'],
  ['/superowner/reviews', 'reviews'],
  ['/superowner/zupdrive/chauffeurs', 'chauffeurs'],
  ['/superowner/zupdrive/tarifs', 'courses-drive'],
  ['/superowner/zupdrive/courses', 'courses-drive'],
];

/** La section d'une page de l'espace, d'après son chemin. */
export function sectionDuChemin(chemin: string): string | null {
  if (chemin === '/superowner' || chemin === '/superowner/') return 'dashboard';
  const connue = PAGES.find(([prefixe]) => chemin.startsWith(prefixe));
  if (connue) return connue[1];
  // Les autres pages portent le nom de leur section : /superowner/<section>/…
  return chemin.split('/')[2] ?? null;
}
