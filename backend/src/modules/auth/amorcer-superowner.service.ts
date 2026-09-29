import { logger } from "../../config/logger";
import { EmailService } from "../notifications/email.service";
import {
  ConfigurationSuperownerInvalide,
  creerSuperownerInitial,
  parametresDeLEnvironnement,
} from "./superowner-initial.service";

/** Adresse du premier superowner quand SUPEROWNER_EMAIL n'est pas donné. */
export const EMAIL_SUPEROWNER_PAR_DEFAUT = "noreply@zupone.com";

const adresseDuSite = () =>
  (process.env.SITE_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Au démarrage : si la base n'a aucun superowner (base vide), le crée.
 * Avec SUPEROWNER_PASSWORD(_HASH) le mot de passe est celui de l'environnement ;
 * sinon le compte reçoit par courriel un lien pour choisir le sien.
 * Rejouable sans effet dès qu'un superowner existe. Ne fait jamais échouer le démarrage.
 */
export async function amorcerSuperowner(): Promise<void> {
  try {
    const parametres = parametresDeLEnvironnement();
    const email = parametres.email ?? EMAIL_SUPEROWNER_PAR_DEFAUT;
    const resultat = await creerSuperownerInitial({ ...parametres, email, invitation: true });

    if (resultat.statut !== "cree") return;
    logger.info("Superowner créé", { email: resultat.email });

    if (!resultat.jeton) return; // mot de passe fourni par l'environnement

    const lien = `${adresseDuSite()}/reinitialiser?jeton=${resultat.jeton}`;
    try {
      await EmailService.sendSuperownerInvitation(resultat.email, lien);
    } catch (err) {
      // Le courriel n'est pas parti : le lien est la seule porte d'entrée, on le consigne.
      logger.warn("Envoi du lien superowner impossible, lien à utiliser directement", {
        email: resultat.email,
        lien,
        error: err instanceof Error ? err.message : err,
      });
    }
  } catch (err) {
    if (err instanceof ConfigurationSuperownerInvalide) {
      logger.error(err.message);
      return;
    }
    logger.error("Création du superowner impossible", {
      error: err instanceof Error ? err.message : err,
    });
  }
}
