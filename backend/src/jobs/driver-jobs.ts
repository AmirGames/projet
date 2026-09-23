import { DriverAvailabilityService } from "../services/driver-availability.service";
import { logger } from "../config/logger";

/**
 * Surveillance périodique des livreurs.
 *
 * Deux choses n'arrivent jamais d'elles-mêmes : la fin d'une pause (personne
 * ne clique à l'heure dite) et la perte du signal GPS (un téléphone sans
 * réseau n'envoie justement plus rien). Il faut aller voir.
 */

const INTERVALLE_MS = 30000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class DriverJobs {
  static start() {
    if (minuteur) return;

    minuteur = setInterval(async () => {
      if (enCours) return;
      enCours = true;

      try {
        const pauses = await DriverAvailabilityService.leverPausesEchues();
        if (pauses > 0) logger.info("Pauses de livreurs terminées", { nombre: pauses });

        const gps = await DriverAvailabilityService.surveillerGps();
        if (gps.perdus > 0 || gps.misHorsLigne > 0) logger.info("Signaux GPS surveillés", gps);
      } catch (err) {
        logger.error("Surveillance des livreurs impossible", {
          error: err instanceof Error ? err.message : err,
        });
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);

    minuteur.unref?.();
    logger.info("Surveillance des livreurs activée", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
