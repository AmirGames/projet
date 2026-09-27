import { MerchantPayoutService } from "../services/merchant-payout.service";
import { logger } from "../config/logger";
import { Surveillance } from "../services/surveillance.service";

/**
 * L'arrêté du lundi.
 *
 * Chaque lundi à 00 h 00 (Bruxelles), la semaine écoulée est arrêtée pour les
 * commerçants et les livreurs : le fichier SEPA est prêt à 00 h 05. On passe
 * toutes les cinq minutes ; l'arrêté ne se fait qu'une fois par semaine (voir
 * arreterLaSemaine), et un serveur arrêté à minuit le rattrape en redémarrant.
 */

const INTERVALLE_MS = 5 * 60000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

async function passer() {
  if (enCours) return;
  enCours = true;

  try {
    const bilan = await Surveillance.executerTache("versements", () => MerchantPayoutService.arreterLaSemaine());
    if (bilan.commercants > 0 || bilan.livreurs > 0) {
      logger.info("Semaine arrêtée pour les versements", bilan);
    }
  } catch (err) {
    logger.error("Arrêté de la semaine impossible", { error: err instanceof Error ? err.message : err });
  } finally {
    enCours = false;
  }
}

export class PayoutJobs {
  static start() {
    if (minuteur) return;

    Surveillance.declarerTache("versements", "Arrêté des versements du lundi", INTERVALLE_MS);

    passer();
    minuteur = setInterval(passer, INTERVALLE_MS);
    minuteur.unref?.();
    logger.info("Arrêté hebdomadaire des versements activé", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
