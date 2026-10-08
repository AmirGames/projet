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
}

export async function rechercherAdresses(q: string): Promise<SuggestionAdresse[]> {
  const res = await apiFetch<{ suggestions?: SuggestionAdresse[] }>(
    `/api/addresses/search?q=${encodeURIComponent(q.trim())}&limit=6`,
    null
  );
  return res.suggestions ?? [];
}

/**
 * Une suggestion devient l'adresse d'un trajet. Sans coordonnées ni code
 * postal le serveur ne peut ni situer ni chiffrer le trajet : on la refuse
 * (null) plutôt que d'envoyer une adresse que l'API rejetterait.
 */
export function adresseTrajet(s: SuggestionAdresse): AdresseTrajet | null {
  const { latitude, longitude } = s;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const codePostal = (s.postalCode ?? '').trim();
  const adresse = (s.label ?? '').trim();
  if (!codePostal || !adresse) return null;
  return { adresse, latitude, longitude, codePostal };
}
