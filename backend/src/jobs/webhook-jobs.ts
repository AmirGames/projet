import { WebhookService } from "../services/webhook.service";
import { logger } from "../config/logger";
import { Surveillance } from "../services/surveillance.service";

/**
 * Rejoue les envois de webhooks dont la relance est due.
 *
 * Un envoi raté ne produit aucun événement : personne ne vient dire « mon
 * serveur était éteint, renvoyez-moi la commande ». Sans ce balayage, la date
 * de relance inscrite en base ne serait qu'une intention — la relance
 * elle-même n'arriverait jamais.
 *
 * L'intervalle est court devant la première relance (une minute) : il fixe le
 * retard maximal avec lequel un envoi repart.
 */

const INTERVALLE_MS = Number(process.env.WEBHOOK_BALAYAGE_MS || 15000);

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class WebhookJobs {
  static start() {
    if (minuteur) return;

    Surveillance.declarerTache("webhooks", "Relance des webhooks", INTERVALLE_MS);

    minuteur = setInterval(async () => {
      // Deux passes simultanées renverraient le même envoi deux fois.
      if (enCours) return;
      enCours = true;

      try {
        const nombre = await Surveillance.executerTache("webhooks", () =>
          WebhookService.relancerLesEnvoisDus()
        );

        if (nombre > 0) {
          logger.info("Envois de webhooks relancés", { nombre });
        }
      } catch (err) {
        logger.error("Relance des webhooks impossible", {
          error: err instanceof Error ? err.message : err,
        });
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);

    // Ce minuteur ne doit pas retenir le processus à l'arrêt.
    minuteur.unref?.();

    logger.info("Relance des webhooks activée", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;

    clearInterval(minuteur);
    minuteur = null;
  }
}
