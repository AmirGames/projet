import { DispatchService } from "../services/dispatch.service";
import { logger } from "../config/logger";
import { Surveillance } from "../services/surveillance.service";

/**
 * Relance des courses dont la proposition a expiré.
 *
 * Un livreur qui ne répond pas ne produit aucun événement : personne ne vient
 * dire « j'ai ignoré cette course ». Sans ce balayage, une course proposée à
 * quelqu'un qui a rangé son téléphone resterait bloquée indéfiniment, alors
 * que d'autres livreurs sont disponibles.
 *
 * L'intervalle est volontairement court devant le délai d'acceptation (30 s
 * par défaut) : il fixe le retard maximal avant que la course reparte.
 */

const INTERVALLE_MS = 5000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class DispatchJobs {
  static start() {
    if (minuteur) return;

    Surveillance.declarerTache("dispatch", "Relance des courses", INTERVALLE_MS);

    minuteur = setInterval(async () => {
      // Un balayage lent ne doit pas se chevaucher avec le suivant : deux
      // passes simultanées proposeraient la même course deux fois.
      if (enCours) return;
      enCours = true;

      try {
        const nombre = await Surveillance.executerTache("dispatch", () =>
          DispatchService.balayerPropositionsExpirees()
        );

        if (nombre > 0) {
          logger.info("Propositions de course expirées, relancées", { nombre });
        }
      } catch (err) {
        logger.error("Balayage des propositions impossible", {
          error: err instanceof Error ? err.message : err,
        });
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);

    // Ce minuteur ne doit pas retenir le processus à l'arrêt.
    minuteur.unref?.();

    logger.info("Relance des courses activée", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;

    clearInterval(minuteur);
    minuteur = null;
  }
}
