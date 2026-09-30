import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Petits outils des écrans ZupDrive (passager, chauffeur, équipe).
 *
 * Les montants arrivent de l'API en centimes (entiers) et ne sont convertis
 * qu'à l'affichage : aucun calcul de prix ne se fait dans le navigateur.
 */

/** Appelle l'API avec la session ; lève le message d'erreur de l'API. */
export async function appelerZupDrive<T>(chemin: string, init: RequestInit & { corps?: unknown } = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const { corps, ...options } = init;
  const reponse = await fetch(`${API_URL}${chemin}`, {
    ...options,
    headers: {
      ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  const lu = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const erreur = new Error(lu?.error || lu?.message || `HTTP ${reponse.status}`) as Error & { code?: string };
    erreur.code = lu?.code;
    throw erreur;
  }
  return (lu?.data ?? lu) as T;
}

/** 1075 → « 10,75 € ». */
export const prix = (centimes: number) => euro(centimes / 100);

export const kilometres = (metres: number) =>
  `${(metres / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;

export const minutes = (secondes: number) => `${Math.max(1, Math.round(secondes / 60))} min`;

/** Une clé d'idempotence : la même commande rejouée rend la même course. */
export function cleAleatoire(): string {
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

export const STATUTS_ACTIFS = ['RECHERCHE', 'ACCEPTEE', 'ARRIVEE', 'EN_COURS'];

export interface AdresseTrajet {
  adresse: string;
  latitude: number;
  longitude: number;
  codePostal: string;
}
