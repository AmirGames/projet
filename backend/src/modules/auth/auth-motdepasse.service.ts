import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { AuthService } from "./auth.service";
import { oublierCompte } from "./auth.middleware";
import { SecurityEventService } from "./security-event.service";
import { EmailService } from "../notifications/email.service";
import { AccountTokenService, DUREE_REINITIALISATION_MS } from "./account-token.service";
import { rattacherFicheInvite } from "../customers/fiche-client.service";
import { adresseDuSite } from "./auth-confirmation.service";

/** Mot de passe oublié, réinitialisation par lien et changement depuis le profil. */
export const AuthMotDePasseService = {
  /**
   * Demande de réinitialisation. La réponse ne dit jamais si l'adresse
   * existe : sinon ce formulaire devient un moyen de vérifier qui est
   * inscrit chez nous.
   */
  async demanderReinitialisation(adresse: string) {
    const email = adresse.toLowerCase();

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, status: true },
    });

    const reponse = {
      message:
        "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé.",
    };

    if (!user || user.status !== "ACTIVE") {
      logger.info("Réinitialisation demandée pour une adresse sans compte actif", { email });
      return reponse;
    }

    const { jeton, empreinte, expireLe } = AccountTokenService.emettre(
      DUREE_REINITIALISATION_MS
    );

    await db.user.update({
      where: { id: user.id },
      data: { resetTokenHash: empreinte, resetTokenExpiresAt: expireLe },
    });

    const lien = `${adresseDuSite()}/reinitialiser?jeton=${jeton}`;

    // Envoi non attendu : un serveur de courriel lent retiendrait la réponse,
    // et cette attente trahirait, par sa seule durée, qu'un compte existe à
    // cette adresse.
    EmailService.sendPasswordReset(user.email, user.name, lien).catch((err) => {
      logger.error("Envoi du lien de réinitialisation impossible", {
        email,
        error: err instanceof Error ? err.message : err,
      });
    });

    await SecurityEventService.record({
      action: "PASSWORD_RESET_REQUESTED",
      actor: user.email,
      severity: "LOW",
      details: "Lien de réinitialisation demandé",
    });

    return reponse;
  },

  /** Nouveau mot de passe via le lien reçu. */
  async reinitialiser(jetonRecu: string, password: string) {
    // On retrouve le compte par l'empreinte : le jeton en clair n'est nulle
    // part en base.
    const user = await db.user.findUnique({
      where: { resetTokenHash: AccountTokenService.empreinte(jetonRecu) },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        resetTokenHash: true,
        resetTokenExpiresAt: true,
      },
    });

    const lienInvalide = new ApiError(
      400,
      "Ce lien n'est plus valable. Demandez-en un nouveau.",
      "INVALID_RESET_TOKEN"
    );

    if (!user || !AccountTokenService.correspond(jetonRecu, user.resetTokenHash)) {
      throw lienInvalide;
    }

    if (AccountTokenService.expire(user.resetTokenExpiresAt)) {
      throw lienInvalide;
    }

    if (user.status !== "ACTIVE") {
      throw new ApiError(403, "Ce compte est désactivé", "ACCOUNT_DISABLED");
    }

    const passwordHash = await AuthService.hashPassword(password);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // Quelqu'un d'autre avait peut-être le mot de passe : ses sessions
          // tombent avec lui.
          passwordChangedAt: new Date(),
          // Un jeton ne sert qu'une fois.
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          // Recevoir ce lien prouve que l'adresse est bien la sienne.
          emailVerified: true,
          emailTokenHash: null,
          emailTokenExpiresAt: null,
        },
      });
      await tx.sessionConnexion.updateMany({
        where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() },
      });
    });

    // L'adresse étant prouvée, la fiche client invité rejoint le compte.
    await rattacherFicheInvite(user);

    await SecurityEventService.record({
      action: "PASSWORD_RESET",
      actor: user.email,
      severity: "HIGH",
      details: "Mot de passe changé via un lien de réinitialisation",
    });

    oublierCompte(user.id);
    // Toutes les sessions, cookie de zupone.com compris : celui qui avait le
    // mot de passe volé ne se fait plus remettre de jetons neufs.
    logger.info("Mot de passe réinitialisé", { userId: user.id });
  },

  /** Changement depuis le profil, session ouverte : ferme toutes les sessions. */
  async changer(userId: string, motDePasseActuel: string, nouveau: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user || !user.passwordHash || !(await AuthService.comparePassword(motDePasseActuel, user.passwordHash))) {
      throw new ApiError(400, "Mot de passe actuel incorrect.", "INVALID_CURRENT_PASSWORD");
    }

    if (motDePasseActuel === nouveau) {
      throw new ApiError(400, "Le nouveau mot de passe doit être différent de l'actuel.", "SAME_PASSWORD");
    }

    // La révocation en transaction ferme aussi les jetons émis dans cette seconde.
    const changeLe = new Date(Math.floor(Date.now() / 1000) * 1000);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await AuthService.hashPassword(nouveau),
          // Ferme les sessions ouvertes ailleurs.
          passwordChangedAt: changeLe,
          // Un lien de réinitialisation en attente ne doit plus servir.
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
      });
      await tx.sessionConnexion.updateMany({
        where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() },
      });
    });

    await SecurityEventService.record({
      action: "PASSWORD_CHANGED",
      actor: user.email,
      severity: "MEDIUM",
      details: "Mot de passe changé depuis le profil",
    });

    oublierCompte(user.id);
  },
};
