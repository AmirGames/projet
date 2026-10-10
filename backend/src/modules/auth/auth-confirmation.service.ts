import { db, type ClientTransaction } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { EmailService } from "../notifications/email.service";
import { AccountTokenService, DUREE_CONFIRMATION_MS } from "./account-token.service";
import { rattacherFicheInvite } from "../customers/fiche-client.service";
import { Outbox } from "../jobs/outbox.service";

export const TYPE_EMAIL_CONFIRMATION = "auth.confirmation_email";

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

/** Une exigence de confirmation implique toujours la préparation de son e-mail. */
export const confirmationAEnvoyer = () => confirmationExigee() || process.env.ENABLE_EMAIL_VERIFICATION !== "false";

/**
 * Adresse du site pour les liens envoyés par courriel. Les pages visées sont
 * communes à tous les domaines, n'importe lequel convient donc.
 */
export const adresseDuSite = () =>
  (process.env.SITE_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Enregistre l'intention d'envoi avec le compte. Aucun jeton ni lien de
 * connexion dans l'outbox : le worker les crée au moment de l'envoi.
 */
export async function envoyerConfirmation(
  user: { id: string },
  client: Pick<ClientTransaction, "outboxMessage"> = db
) {
  await Outbox.enregistrer(TYPE_EMAIL_CONFIRMATION, { userId: user.id }, { tx: client });
}

/** Une panne SMTP remonte au worker, qui reprend l'envoi avec un nouveau lien. */
export async function envoyerConfirmationDuCompte(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerified: true, status: true },
  });
  if (!user || user.emailVerified || user.status !== "ACTIVE") return;

  const { jeton, empreinte, expireLe } = AccountTokenService.emettre(DUREE_CONFIRMATION_MS);
  const { count } = await db.user.updateMany({
    where: { id: user.id, email: user.email, emailVerified: false, status: "ACTIVE" },
    data: { emailTokenHash: empreinte, emailTokenExpiresAt: expireLe },
  });
  if (count !== 1) return;

  const lien = `${adresseDuSite()}/verifier-email?jeton=${jeton}`;
  await EmailService.sendEmailVerification(user.email, user.name, lien);
}

/** Confirmation d'adresse (lien reçu) et renvoi du lien. */
export const AuthConfirmationService = {
  /** Confirme l'adresse du compte désigné par le jeton du lien. */
  async verifier(jetonRecu: string) {
    const user = await db.user.findUnique({
      where: { emailTokenHash: AccountTokenService.empreinte(jetonRecu) },
      select: { id: true, email: true, emailVerified: true, status: true, emailTokenHash: true, emailTokenExpiresAt: true },
    });

    if (!user || !AccountTokenService.correspond(jetonRecu, user.emailTokenHash)) {
      throw new ApiError(
        400,
        "Ce lien de confirmation a expiré ou a déjà été utilisé. Demandez-en un nouveau.",
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

    await db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: {
          id: user.id, email: user.email, status: "ACTIVE", emailVerified: false,
          emailTokenHash: AccountTokenService.empreinte(jetonRecu),
          emailTokenExpiresAt: { gt: new Date() },
        },
        data: { emailVerified: true, emailTokenHash: null, emailTokenExpiresAt: null },
      });
      if (count !== 1) {
        throw new ApiError(400, "Ce lien de confirmation a expiré ou a déjà été utilisé. Demandez-en un nouveau.", "INVALID_EMAIL_TOKEN");
      }
      await rattacherFicheInvite(user, tx);
    });

    logger.info("Adresse confirmée", { userId: user.id });

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
