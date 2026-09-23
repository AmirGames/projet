import { MerchantApprovalService } from "../services/merchant-approval.service";
import { logger } from "../config/logger";

/**
 * Surveillance périodique des dossiers commerçants.
 *
 * Une pièce expire sans que personne ne clique nulle part : il faut aller
 * voir. Une fois par heure suffit — le rappel part trente jours avant.
 */

const INTERVALLE_MS = 3600000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

async function passer() {
  if (enCours) return;
  enCours = true;

  try {
    const bilan = await MerchantApprovalService.surveillerExpirations();
    if (bilan.rappels > 0 || bilan.expirees > 0) {
      logger.info("Pièces commerçants surveillées", bilan);
    }
  } catch (err) {
    logger.error("Surveillance des pièces commerçants impossible", {
      error: err instanceof Error ? err.message : err,
    });
  } finally {
    enCours = false;
  }
}

export class MerchantJobs {
  static start() {
    if (minuteur) return;

    // Un premier passage au démarrage : un serveur relancé chaque nuit
    // n'atteindrait jamais la première heure.
    passer();
    minuteur = setInterval(passer, INTERVALLE_MS);

    minuteur.unref?.();
    logger.info("Surveillance des pièces commerçants activée", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
