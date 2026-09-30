import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";
import { ChauffeurExpirationService } from "./chauffeur-expiration.service";

/**
 * Surveillance périodique des pièces des chauffeurs ZupDrive : relances
 * d'expiration (30 puis 10 jours avant), passage en « expirée » et
 * suspension des chauffeurs dont une pièce exigée n'est plus valable. Une
 * fois par heure suffit.
 */

const INTERVALLE_MS = 3600000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

async function passer() {
  if (enCours) return;
  enCours = true;

  try {
    const bilan = await Surveillance.executerTache("pieces-chauffeurs", () =>
      ChauffeurExpirationService.surveiller()
    );
    if (bilan.rappels > 0 || bilan.expirees > 0 || bilan.suspendus > 0) {
      logger.info("Pièces chauffeurs ZupDrive surveillées", bilan);
    }
  } catch (err) {
    logger.error("Surveillance des pièces chauffeurs impossible", {
      error: err instanceof Error ? err.message : err,
    });
  } finally {
    enCours = false;
  }
}

export class ChauffeurJobs {
  static start() {
    if (minuteur) return;

    Surveillance.declarerTache("pieces-chauffeurs", "Pièces des chauffeurs ZupDrive", INTERVALLE_MS);

    // Un premier passage au démarrage : un serveur relancé chaque nuit
    // n'atteindrait jamais la première heure.
    passer();
    minuteur = setInterval(passer, INTERVALLE_MS);

    minuteur.unref?.();
    logger.info("Surveillance des pièces chauffeurs activée", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
