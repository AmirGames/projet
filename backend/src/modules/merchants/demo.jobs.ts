import { DemoMerchantService, configurationDemo } from "./demo.service";
import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";

/**
 * Remet le commerce de démonstration à zéro : au démarrage (pour qu'il existe),
 * puis chaque nuit à 3 h, heure du serveur. Sans effet si DEMO_MERCHANT_ENABLED
 * n'est pas « true ».
 */

const INTERVALLE_MS = 600000;
const HEURE_REMISE_A_ZERO = 3;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;
let dernierJour = "";

async function remettreAZero() {
  if (enCours) return;
  enCours = true;

  try {
    await Surveillance.executerTache("commerce-demo", () => DemoMerchantService.reinitialiser());
  } catch (err) {
    logger.error("Remise à zéro du commerce de démonstration impossible", {
      error: err instanceof Error ? err.message : err,
    });
  } finally {
    enCours = false;
  }
}

async function passer() {
  const maintenant = new Date();
  const jour = maintenant.toISOString().slice(0, 10);

  if (maintenant.getHours() !== HEURE_REMISE_A_ZERO || jour === dernierJour) return;

  dernierJour = jour;
  await remettreAZero();
}

export class DemoJobs {
  static start() {
    if (minuteur || !configurationDemo()) return;

    Surveillance.declarerTache("commerce-demo", "Commerce de démonstration", 86400000);

    // Au démarrage : le compte doit exister sans attendre la nuit.
    dernierJour = new Date().toISOString().slice(0, 10);
    void remettreAZero();

    minuteur = setInterval(passer, INTERVALLE_MS);
    minuteur.unref?.();
    logger.info("Commerce de démonstration activé", { remiseAZero: `${HEURE_REMISE_A_ZERO} h` });
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
