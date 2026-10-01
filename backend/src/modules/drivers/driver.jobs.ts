import { DriverAvailabilityService } from "./driver-availability.service";
import { DispatchService } from "./dispatch.service";
import { SurveillanceCoursesService } from "./surveillance-courses.service";
import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";

/**
 * Surveillance périodique des livreurs.
 *
 * Trois choses n'arrivent jamais d'elles-mêmes : la fin d'une pause (personne
 * ne clique à l'heure dite), la perte du signal GPS (un téléphone sans
 * réseau n'envoie justement plus rien) et le livreur qui ne vient pas, ou ne
 * livre pas, la course qu'il a acceptée. Il faut aller voir.
 */

const INTERVALLE_MS = 30000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class DriverJobs {
  static start() {
    if (minuteur) return;

    Surveillance.declarerTache("livreurs", "Surveillance des livreurs", INTERVALLE_MS);

    minuteur = setInterval(async () => {
      if (enCours) return;
      enCours = true;

      try {
        await Surveillance.executerTache("livreurs", async () => {
          const pauses = await DriverAvailabilityService.leverPausesEchues();
          if (pauses > 0) logger.info("Pauses de livreurs terminées", { nombre: pauses });

          const relancees = await DispatchService.relancerRecherches();
          if (relancees > 0) logger.info("Courses sans preneur reproposées", { nombre: relancees });

          const gps = await DriverAvailabilityService.surveillerGps();
          if (gps.perdus > 0 || gps.misHorsLigne > 0) logger.info("Signaux GPS surveillés", gps);

          // Après le GPS : un signal perdu à ce passage ne compte plus comme position.
          const courses = await SurveillanceCoursesService.surveiller();
          if (courses.averties + courses.retirees + courses.alertes + courses.closes > 0) {
            logger.info("Courses en cours surveillées", courses);
          }
        });
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
