import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";
import { PlatformInvoiceService, moisPrecedent, identitePlateforme } from "./platform-invoice.service";

/**
 * L'émission mensuelle des factures Peppol.
 *
 * Chaque jour, on facture le mois écoulé à tous les commerçants qui ne l'ont
 * pas encore été : le 1er, c'est la vague normale ; les jours suivants
 * rattrapent un serveur arrêté ou un commerçant dont le dossier vient d'être
 * complété. L'émission est idempotente, refaire la passe ne double rien.
 */

const INTERVALLE_MS = 60 * 60000;

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;
let dernierJourTraite = "";

async function passer() {
  if (enCours) return;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (aujourdhui === dernierJourTraite) return;

  // Sans l'identité de la plateforme, rien ne peut s'émettre : on le dit une
  // fois par jour plutôt que de le découvrir le 1er du mois suivant.
  const { manque } = identitePlateforme();
  if (manque.length) {
    dernierJourTraite = aujourdhui;
    logger.warn("Factures Peppol non émises : identité de la plateforme incomplète", { manque });
    return;
  }

  enCours = true;
  try {
    const bilan = await Surveillance.executerTache("factures-peppol", () =>
      PlatformInvoiceService.emettreLeMois(moisPrecedent())
    );
    dernierJourTraite = aujourdhui;

    if (bilan.emises || bilan.envoyees) logger.info("Factures Peppol émises", bilan);
    if (bilan.bloquees.length) logger.warn("Factures Peppol bloquées, dossier à compléter", { bloquees: bilan.bloquees });
  } catch (err) {
    logger.error("Émission des factures Peppol impossible", { error: err instanceof Error ? err.message : err });
  } finally {
    enCours = false;
  }
}

export class PlatformInvoiceJobs {
  static start() {
    if (minuteur) return;

    // Un passage par jour : la tâche est en retard au bout de vingt-six heures.
    Surveillance.declarerTache("factures-peppol", "Émission des factures Peppol du mois", 26 * INTERVALLE_MS);

    passer();
    minuteur = setInterval(passer, INTERVALLE_MS);
    minuteur.unref?.();
    logger.info("Émission mensuelle des factures Peppol activée", { intervalleMs: INTERVALLE_MS });
  }

  static stop() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  }
}
