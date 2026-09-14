/**
 * Détermine l'espace d'accueil d'un compte.
 *
 * L'ancien tableau de bord (/dashboard) et le nouvel espace commerçant
 * (/merchant/:orgId) ont coexisté un temps : un même lien pouvait mener à deux
 * interfaces différentes, avec deux barres de navigation superposées. Cette
 * fonction centralise la destination pour qu'il n'y ait plus qu'une réponse.
 */
export function espaceDAccueil(options: {
  isSuperOwner?: boolean;
  orgId?: string | null;
}): string {
  if (options.isSuperOwner) return '/super-admin';
  if (options.orgId) return `/merchant/${options.orgId}/dashboard`;
  return '/login';
}

/** Variante côté navigateur, qui lit l'organisation mémorisée à la connexion. */
export function espaceDAccueilLocal(): string {
  if (typeof window === 'undefined') return '/login';

  try {
    return espaceDAccueil({
      isSuperOwner: localStorage.getItem('isSuperOwner') === 'true',
      orgId: localStorage.getItem('currentOrgId'),
    });
  } catch {
    return '/login';
  }
}
