import { Outbox } from "./outbox.service";
import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";

/**
 * Le worker de l'outbox : envoie les messages dus, rejoue ceux qui ont échoué.
 *
 * Dix secondes : c'est le retard maximal d'un premier envoi (le message est
 * normalement traité tout de suite par ce balayage, pas par l'appelant).
 */

const INTERVALLE_MS = 10_000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;
let dernierePurge = 0;

export class OutboxJobs {
  static start() {
    if (minuteur) return;

    Surveillance.declarerTache("outbox", "Envoi des messages en attente", INTERVALLE_MS);

    minuteur = setInterval(async () => {
      if (enCours) return;
      enCours = true;

      try {
        const envoyes = await Surveillance.executerTache("outbox", async () => {
          const n = await Outbox.traiterLesDus();
          // La purge n'a pas besoin d'être fréquente.
          if (Date.now() - dernierePurge > 60 * 60_000) {
            dernierePurge = Date.now();
            await Outbox.purger();
          }
          return n;
        });
        if (envoyes > 0) logger.info("Messages de l'outbox envoyés", { nombre: envoyes });
      } catch (err) {
        logger.error("Traitement de l'outbox impossible", { error: err instanceof Error ? err.message : err });
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);

    minuteur.unref?.();
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
