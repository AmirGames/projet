import { apiFetch } from './api';

/**
 * Ce que le compte connecté peut voir et faire dans l'espace d'administration.
 *
 * Sert uniquement à masquer les écrans inutiles : chaque route du serveur
 * refait le contrôle (voir backend permissions-plateforme.service). Masquer un
 * onglet n'a jamais fermé une porte.
 */
export type Niveau = 'read' | 'write';

export interface MesPermissions {
  isSuperOwner: boolean;
  plateforme: string;
  role: string;
  roleLabel?: string;
  permissions: Record<string, Niveau>;
}

export const chargerPermissions = (token: string) =>
  apiFetch<MesPermissions>('/api/superowner/me/permissions?plateforme=EAT', token);

export const peutLire = (p: MesPermissions | null, section: string) => !!p?.permissions[section];
export const peutModifier = (p: MesPermissions | null, section: string) => p?.permissions[section] === 'write';
