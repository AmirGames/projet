import { jetonAcces } from '@/lib/jeton-session';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Les pièces privées (permis, RIB, pièces des commerçants, photos de dépôt) ne
 * se lisent plus à leur adresse brute : l'API exige une session. Une balise
 * <img> ou un lien n'envoyant pas de jeton, on demande d'abord une adresse
 * signée, valable cinq minutes.
 *
 * Reconnaît les adresses telles que la base les garde
 * (…/uploads/drivers/…), l'ancienne route (…/documents/file/…) et les
 * adresses déjà signées (…/api/files/…) : l'API les donne signées, mais pour
 * cinq minutes seulement. Un écran resté ouvert plus longtemps (examen d'un
 * dossier) ouvrait un lien échu ; on en redemande donc une au moment du clic.
 * Les dossiers suivent DOSSIERS_PRIVES (backend, fichiers-prives.service.ts).
 */
const PIECE_PRIVEE =
  /\/(uploads|api\/drivers\/documents\/file|api\/files)\/(drivers|merchants|deliveries|chauffeurs)\//;

export function estPiecePrivee(adresse: string | null | undefined): boolean {
  return !!adresse && PIECE_PRIVEE.test(adresse);
}

/** L'adresse à donner au navigateur : signée pour une pièce privée, inchangée sinon. */
export async function adresseLisible(adresse: string): Promise<string> {
  if (!estPiecePrivee(adresse)) return adresse;

  const token = typeof window !== 'undefined' ? jetonAcces() : null;
  const reponse = await fetch(
    `${API_URL}/api/files/signed-url?url=${encodeURIComponent(adresse)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  const lu = await reponse.json().catch(() => null);
  if (!reponse.ok || !lu?.data?.url) {
    throw new Error(lu?.error || `HTTP ${reponse.status}`);
  }
  return lu.data.url as string;
}

/**
 * Ouvre la pièce dans un nouvel onglet. L'onglet est ouvert tout de suite, au
 * clic, pour ne pas être pris pour une fenêtre surgissante ; il reçoit
 * l'adresse signée ensuite.
 */
export async function ouvrirPiece(adresse: string) {
  if (!estPiecePrivee(adresse)) {
    window.open(adresse, '_blank', 'noopener,noreferrer');
    return;
  }
  const onglet = window.open('', '_blank');
  try {
    const signee = await adresseLisible(adresse);
    if (onglet) {
      onglet.opener = null;
      onglet.location.href = signee;
    } else {
      window.location.href = signee;
    }
  } catch {
    onglet?.close();
    alert("Impossible d'ouvrir ce document.");
  }
}
