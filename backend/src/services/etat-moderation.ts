/**
 * Où en est un avis, vu du commerçant. Règle pure, sans base ni
 * configuration : elle se teste seule.
 */

export type EtatSignalement = "EN_ATTENTE" | "CONSERVE" | "RETIRE";

interface Signalement {
  createdAt: Date;
  decision: string | null;
  decisionNote: string | null;
  decidedAt: Date | null;
}

/**
 * Où en est un avis, vu du commerçant.
 *
 * Il peut signaler un avis publié qui n'attend pas déjà une décision. Un avis
 * que la plateforme a choisi de conserver ne se signale à nouveau que si le
 * client l'a modifié depuis : sinon ce serait redemander la même chose.
 */
export function etatModeration(
  avis: { status: string; editedAt: Date },
  signalements: Signalement[]
): { signalement: EtatSignalement | null; motifDecision: string | null; peutSignaler: boolean } {
  const dernier = [...signalements].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  let signalement: EtatSignalement | null = null;
  if (dernier) {
    signalement = !dernier.decision ? "EN_ATTENTE" : dernier.decision === "REMOVED" ? "RETIRE" : "CONSERVE";
  }

  const conserveDepuisSaDerniereVersion =
    signalement === "CONSERVE" && dernier.decidedAt !== null && dernier.decidedAt >= avis.editedAt;

  return {
    signalement,
    motifDecision: dernier?.decisionNote ?? null,
    peutSignaler: avis.status === "APPROVED" && signalement !== "EN_ATTENTE" && !conserveDepuisSaDerniereVersion,
  };
}
