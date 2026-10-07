import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";
import { CourseDriveService } from "./course-drive.service";

/**
 * L'attribution des courses ZupDrive dans la durée : une proposition expire
 * sans que personne ne clique, un chauffeur se connecte pendant qu'un
 * passager attend. Toutes les 5 secondes, les propositions échues sont
 * fermées et chaque course en recherche est proposée au chauffeur suivant.
 */

const INTERVALLE_MS = 5000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class CourseDriveJobs {
  static start() {
    if (minuteur) return;

    Surveillance.declarerTache("courses-drive", "Attribution des courses ZupDrive", INTERVALLE_MS);

    minuteur = setInterval(async () => {
      if (enCours) return;
      enCours = true;
      try {
        const bilan = await Surveillance.executerTache("courses-drive", () => CourseDriveService.balayer());
        if (bilan.expirees > 0 || bilan.proposees > 0 || bilan.remboursees > 0) logger.info("Courses ZupDrive balayées", bilan);
      } catch (err) {
        logger.error("Attribution des courses ZupDrive impossible", {
          error: err instanceof Error ? err.message : err,
        });
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);

    minuteur.unref?.();
    logger.info("Attribution des courses ZupDrive activée", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
