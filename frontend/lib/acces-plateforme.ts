import { jetonAcces } from '@/lib/jeton-session';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type Niveau = 'read' | 'write';

/** Ce que le compte connecté peut voir et faire dans l'espace superowner. */
export interface AccesPlateforme {
  isSuperOwner: boolean;
  role: string;
  roleLabel?: string;
  permissions: Record<string, Niveau>;
  /** Vue dérivée de la permission support-tickets de EAT ou DRIVE. */
  assistantSupport?: boolean;
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
  const token = jetonAcces();
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
    assistantSupport: lu.isSuperOwner || Boolean(eat?.permissions['support-tickets'] || drive?.permissions['support-tickets']),
  };
}

// Chaque page de l'espace et la section qui l'ouvre. `null` : réservée au
// superowner (l'équipe et ses droits).
const PAGES: [string, string | null][] = [
  ['/superowner/assistant', 'assistant-support'],
  ['/superowner/user-management', null],
  ['/superowner/roles', null],
  ['/superowner/zupeat/members', 'members'],
  ['/superowner/zupeat/versements', 'payouts'],
  ['/superowner/zupeat/reviews', 'reviews'],
  ['/superowner/zupeat/incidents-livraison', 'driver-support'],
  ['/superowner/zupdrive/chauffeurs', 'chauffeurs'],
  // Les sociétés et leurs véhicules : les mêmes dossiers LVC que les chauffeurs.
  ['/superowner/zupdrive/societes', 'chauffeurs'],
  ['/superowner/zupdrive/tarifs', 'courses-drive'],
  ['/superowner/zupdrive/courses', 'courses-drive'],
];

/**
 * Pseudo-sections des accueils : `accueil` (/superowner, qui renvoie vers la
 * plateforme choisie) est ouvert à tout membre de l'équipe ; `zupdrive`
 * (tableau de bord ZupDrive) à qui voit au moins une section ZupDrive.
 */
export const SECTION_ACCUEIL = 'accueil';
export const SECTION_ACCUEIL_DRIVE = 'zupdrive';

/** La section d'une page de l'espace, d'après son chemin. */
export function sectionDuChemin(chemin: string): string | null {
  const propre = chemin.replace(/\/+$/, '') || '/';
  if (propre === '/superowner') return SECTION_ACCUEIL;
  if (propre === '/superowner/zupeat') return 'dashboard';
  if (propre === '/superowner/zupdrive') return SECTION_ACCUEIL_DRIVE;
  const connue = PAGES.find(([prefixe]) => chemin.startsWith(prefixe));
  if (connue) return connue[1];
  // Les autres pages portent le nom de leur section :
  // /superowner/zupeat/<section>/… pour ZupEat, /superowner/<section>/…
  // pour les pages communes.
  const morceaux = chemin.split('/');
  return (morceaux[2] === 'zupeat' ? morceaux[3] : morceaux[2]) ?? null;
}
