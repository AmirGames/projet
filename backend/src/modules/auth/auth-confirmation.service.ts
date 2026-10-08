import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { EmailService } from "../notifications/email.service";
import { AccountTokenService, DUREE_CONFIRMATION_MS } from "./account-token.service";
import { rattacherFicheInvite } from "../customers/fiche-client.service";

/**
 * Faut-il une adresse confirmée pour se connecter ?
 *
 * `REQUIRE_EMAIL_VERIFICATION=true|false` décide. Non définie, la
 * confirmation est exigée en production et pas ailleurs : le développement
 * local n'a pas toujours de serveur de courriel.
 */
export function confirmationExigee() {
  const valeur = process.env.REQUIRE_EMAIL_VERIFICATION?.trim();
  if (!valeur) return process.env.NODE_ENV === "production";
  return valeur === "true";
}

/**
 * Adresse du site pour les liens envoyés par courriel. Les pages visées sont
 * communes à tous les domaines, n'importe lequel convient donc.
 */
export const adresseDuSite = () =>
  (process.env.SITE_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Enregistre un lien de confirmation et le fait partir, sans jamais faire
 * échouer ni ralentir l'appelant.
 *
 * Seul le jeton est attendu : il doit exister en base avant que le lien
 * puisse être cliqué. L'envoi, lui, part sans être attendu — un serveur de
 * courriel injoignable retenait la réponse de l'inscription de longues
 * secondes, et le visiteur qui réessayait tombait sur « adresse déjà
 * utilisée » alors que son compte venait d'être créé.
 */
export async function envoyerConfirmation(user: { id: string; email: string; name: string | null }) {
  const { jeton, empreinte, expireLe } = AccountTokenService.emettre(DUREE_CONFIRMATION_MS);

  await db.user.update({
    where: { id: user.id },
    data: { emailTokenHash: empreinte, emailTokenExpiresAt: expireLe },
  });

  const lien = `${adresseDuSite()}/verifier-email?jeton=${jeton}`;

  EmailService.sendEmailVerification(user.email, user.name, lien).catch((err) => {
    // Un serveur de courriel indisponible ne doit pas empêcher l'inscription :
    // le message peut être redemandé plus tard.
    logger.warn("Envoi de la confirmation d'adresse impossible", {
      email: user.email,
      error: err instanceof Error ? err.message : err,
    });
  });
}

/** Confirmation d'adresse (lien reçu) et renvoi du lien. */
export const AuthConfirmationService = {
  /** Confirme l'adresse du compte désigné par le jeton du lien. */
  async verifier(jetonRecu: string) {
    const user = await db.user.findUnique({
      where: { emailTokenHash: AccountTokenService.empreinte(jetonRecu) },
      select: { id: true, email: true, emailTokenHash: true, emailTokenExpiresAt: true },
    });

    if (!user || !AccountTokenService.correspond(jetonRecu, user.emailTokenHash)) {
      throw new ApiError(
        400,
        "Ce lien de confirmation n'est pas valable.",
        "INVALID_EMAIL_TOKEN"
      );
    }

    if (AccountTokenService.expire(user.emailTokenExpiresAt)) {
      throw new ApiError(
        400,
        "Ce lien de confirmation a expiré. Demandez-en un nouveau.",
        "EXPIRED_EMAIL_TOKEN"
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailTokenHash: null, emailTokenExpiresAt: null },
    });

    logger.info("Adresse confirmée", { userId: user.id });

    // L'adresse est prouvée : la fiche client née d'une commande sans compte
    // rejoint maintenant le compte.
    await rattacherFicheInvite(user);

    return { message: "Adresse confirmée.", email: user.email };
  },

  /**
   * Nouveau lien de confirmation.
   *
   * `userId` vient de la session quand il y en a une ; elle prime sur
   * l'adresse fournie : sinon n'importe qui pourrait viser le compte d'un autre.
   */
  async renvoyer(userId: string | null, email: string | undefined) {
    if (!userId && !email) {
      throw new ApiError(400, "Indiquez votre adresse e-mail", "MISSING_EMAIL");
    }

    const user = await db.user.findUnique({
      where: userId ? { id: userId } : { email: email!.toLowerCase() },
      select: { id: true, email: true, name: true, emailVerified: true, status: true },
    });

    // Connecté, on peut être précis. Sans session, la réponse est la même
    // que le compte existe ou non : sinon ce formulaire dirait qui est
    // inscrit.
    if (!userId) {
      if (user && !user.emailVerified && user.status === "ACTIVE") {
        await envoyerConfirmation(user);
      }

      return {
        message:
          "Si un compte existe pour cette adresse et n'est pas encore confirmé, un lien vient d'y être envoyé.",
      };
    }

    if (!user) {
      throw new ApiError(404, "Compte introuvable", "USER_NOT_FOUND");
    }

    if (user.emailVerified) {
      return { message: "Votre adresse est déjà confirmée.", emailVerified: true };
    }

    await envoyerConfirmation(user);

    return { message: "Un nouveau lien vient de vous être envoyé.", emailVerified: false };
  },
};
