/**
 * Les conditions de commande (CGV et confidentialité) ne se redemandent pas
 * tant que leurs versions n'ont pas changé.
 *
 * - Compte connecté : c'est le serveur qui sait si les versions en vigueur ont
 *   déjà été acceptées (preuve enregistrée), il refuse la commande sinon.
 * - Visiteur sans compte : le navigateur retient la version acceptée ; une
 *   page republiée change la version et la case revient.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const CLE = 'zupeat.conditions-commande';

export interface EtatAcceptation {
  /** Les versions en vigueur, « cgv@v1 confidentialite@v1 ». */
  versions: string;
  /** Vrai : plus besoin de cocher la case. */
  dejaAccepte: boolean;
}

export async function lireEtatAcceptation(jeton: string | null): Promise<EtatAcceptation | null> {
  try {
    const reponse = await fetch(`${API_URL}/api/pages-legales/acceptation/commande`, {
      headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
      cache: 'no-store',
    });
    if (!reponse.ok) return null;
    const { data } = await reponse.json();
    if (typeof data?.versions !== 'string') return null;
    let memorisee: string | null = null;
    try {
      memorisee = localStorage.getItem(CLE);
    } catch {
      /* stockage indisponible : on redemande la case */
    }
    return { versions: data.versions, dejaAccepte: data.aJour === true || memorisee === data.versions };
  } catch {
    return null;
  }
}

/** À appeler une fois la commande créée avec la case cochée. */
export function memoriserAcceptation(versions: string) {
  try {
    localStorage.setItem(CLE, versions);
  } catch {
    /* sans stockage, la case sera simplement redemandée */
  }
}

export function oublierAcceptation() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à oublier */
  }
}
