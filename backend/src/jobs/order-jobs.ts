import { OrderAcceptanceService } from "../services/order-acceptance.service";
import { paymentService } from "../services/payment.service";
import { logger } from "../config/logger";

/**
 * Le temps de réponse des commerçants, et l'appel des livreurs.
 *
 * - Une commande restée sans réponse est refusée d'elle-même, et le client
 *   prévenu : sinon il attendait une commande que personne n'avait vue.
 * - Une livraison acceptée appelle son livreur quand elle est bientôt prête,
 *   d'après le temps de préparation annoncé.
 * - Une commande à payer en ligne jamais payée est retirée au bout de trente minutes.
 *
 * Aucun événement ne signale « le commerçant n'a pas répondu » : il faut
 * passer voir. Trente secondes suffisent devant des délais de dix minutes.
 */

const INTERVALLE_MS = 30_000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class OrderJobs {
  static start() {
    if (minuteur) return;

    minuteur = setInterval(async () => {
      // Deux passes simultanées refuseraient ou dispatcheraient deux fois.
      if (enCours) return;
      enCours = true;

      try {
        const refusees = await OrderAcceptanceService.refuserLesCommandesSansReponse();
        if (refusees > 0) {
          logger.info("Commandes sans réponse refusées", { nombre: refusees });
        }

        const retirees = await paymentService.abandonnerLesPaiementsNonAboutis();
        if (retirees > 0) {
          logger.info("Commandes jamais payées retirées", { nombre: retirees });
        }

        const courses = await OrderAcceptanceService.lancerLesCoursesDues();
        if (courses > 0) {
          logger.info("Livreurs appelés pour des commandes bientôt prêtes", { nombre: courses });
        }
      } catch (err) {
        logger.error("Suivi des commandes impossible", {
          error: err instanceof Error ? err.message : err,
        });
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);

    // Ce minuteur ne doit pas retenir le processus à l'arrêt.
    minuteur.unref?.();

    logger.info("Suivi des commandes activé", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;

    clearInterval(minuteur);
    minuteur = null;
  }
}
