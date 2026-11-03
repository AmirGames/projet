import { apiFetch } from './api';
import type { AdresseTrajet } from './courses';

/** Une suggestion du service d'adresses du serveur (`GET /api/addresses/search`). */
export interface SuggestionAdresse {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  preuveAdresse: string | null;
}

export async function rechercherAdresses(q: string): Promise<SuggestionAdresse[]> {
  const res = await apiFetch<{ suggestions?: SuggestionAdresse[] }>(
    `/api/addresses/search?q=${encodeURIComponent(q.trim())}&limit=6&usage=zupdrive`,
    null
  );
  return res.suggestions ?? [];
}

/**
 * Une suggestion devient l'adresse d'un trajet. Seule la preuve signée par
 * le géocodeur serveur permet au backend d'utiliser ses coordonnées.
 */
export function adresseTrajet(s: SuggestionAdresse): AdresseTrajet | null {
  const { latitude, longitude } = s;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const codePostal = (s.postalCode ?? '').trim();
  const adresse = (s.label ?? '').trim();
  const preuveAdresse = (s.preuveAdresse ?? '').trim();
  if (!codePostal || !adresse || !preuveAdresse) return null;
  return { adresse, latitude, longitude, codePostal, preuveAdresse };
}
