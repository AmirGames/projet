import { RefundService } from "./refund.service";
import { Surveillance } from "../monitoring/surveillance.service";
import { logger } from "../../config/logger";

const INTERVALLE_MS = 10_000;
let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

/** Le leader existant démarre ce job ; la prise SQL protège aussi les reprises. */
export class RefundJobs {
  static start() {
    if (minuteur) return;
    Surveillance.declarerTache(
      "remboursements",
      "Remboursements durables Stripe",
      INTERVALLE_MS,
    );
    minuteur = setInterval(async () => {
      if (enCours) return;
      enCours = true;
      try {
        await Surveillance.executerTache("remboursements", () =>
          RefundService.traiterLesDus(),
        );
      } catch {
        logger.error("Worker de remboursement indisponible");
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);
    minuteur.unref?.();
  }
  static stop() {
    if (minuteur) clearInterval(minuteur);
    minuteur = null;
  }
}
