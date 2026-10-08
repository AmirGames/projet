/**
 * Ce que l'écran dit du paiement d'un trajet. Il ne dépend que de ce que le
 * serveur a enregistré (webhook Stripe) : le téléphone n'est jamais la source
 * de vérité. Même logique que `etatPaiementTrajet` du site.
 */

export type EtatPaiement = 'aucun' | 'a_payer' | 'paye' | 'remboursement' | 'rembourse';

/** Une course qui n'a pas eu lieu : un paiement reçu doit être rendu. */
const COURSES_NON_ABOUTIES = ['ANNULEE', 'SANS_CHAUFFEUR'];

export function etatPaiementTrajet(
  statutCourse: string,
  paiement: { obligatoire: boolean; statut: string | null } | null | undefined
): EtatPaiement {
  const statut = paiement?.statut ?? null;
  if (statut === 'REFUNDED') return 'rembourse';
  if (statut === 'REFUND_REQUESTED' || statut === 'REFUND_FAILED') return 'remboursement';
  if (statut === 'SUCCEEDED') return COURSES_NON_ABOUTIES.includes(statutCourse) ? 'remboursement' : 'paye';
  // Seule une course en recherche se paie (l'API refuse les autres).
  if (paiement?.obligatoire && statutCourse === 'RECHERCHE') return 'a_payer';
  return 'aucun';
}
