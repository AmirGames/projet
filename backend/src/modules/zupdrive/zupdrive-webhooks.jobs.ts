import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";
import { ZupDriveWebhooksService } from "./zupdrive-webhooks.service";

const INTERVALLE_MS = 10_000;
let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class ZupDriveWebhookJobs {
  static start() {
    if (minuteur) return;
    Surveillance.declarerTache("zupdrive-webhooks", "Livraison des webhooks ZupDrive", INTERVALLE_MS);
    minuteur = setInterval(async () => {
      if (enCours) return;
      enCours = true;
      try {
        const n = await Surveillance.executerTache("zupdrive-webhooks", () => ZupDriveWebhooksService.traiterLesLivraisonsDues());
        if (n) logger.info("Livraisons de webhooks ZupDrive envoyées", { nombre: n });
      } catch (error) {
        logger.error("Traitement des webhooks ZupDrive impossible", { error: error instanceof Error ? error.message : "erreur interne" });
      } finally { enCours = false; }
    }, INTERVALLE_MS);
    minuteur.unref?.();
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
