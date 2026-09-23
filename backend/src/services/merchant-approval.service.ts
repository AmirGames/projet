import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitNotification } from "../config/socket";
import { EmailService } from "./email.service";
import {
  PIECES_EXIGEES,
  etatDeValidation,
  libelleDuDocumentCommercant,
} from "./merchant-profile.service";

/**
 * La validation d'un commerce par la plateforme.
 *
 * Un commerce naissait prêt à vendre : il s'inscrivait et pouvait encaisser
 * dans la minute, sans que personne n'ait vu son Kbis ni l'identité de son
 * gérant. La plateforme reverse pourtant l'argent de ses clients sur le compte
 * qu'il a donné.
 *
 * Il attend désormais la validation de la plateforme. En attendant, il prépare
 * tout — catalogue, catégories, horaires, zones — mais ne peut ni ouvrir, ni
 * recevoir de commande, ni apparaître dans les listes du client. Le verrou vit
 * côté serveur, là où on ne le contourne pas.
 */

/** Le délai de prévenance avant l'expiration d'une pièce. */
export const JOURS_AVANT_EXPIRATION = 30;

const JOUR_MS = 24 * 3600 * 1000;

export class MerchantApprovalService {
  /** Où en est la validation : ce qui est validé, ce qui manque encore. */
  static async etat(orgId: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: {
        approvedAt: true,
        documents: { select: { type: true, status: true } },
      },
    });

    if (!org) {
      throw new ApiError(404, "Organisation introuvable", "ORG_NOT_FOUND");
    }

    return etatDeValidation(org.approvedAt, org.documents);
  }

  /**
   * Refuse le geste si le commerce n'est pas validé.
   *
   * Appelé partout où une boutique s'ouvre ou encaisse : un seul message, un
   * seul code, que l'écran sait reconnaître.
   */
  static async exigerValidation(orgId: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { approvedAt: true },
    });

    if (org && !org.approvedAt) {
      throw new ApiError(
        403,
        "Votre commerce est en attente de validation par la plateforme : vous pourrez l'ouvrir une fois vos documents validés.",
        "MERCHANT_NOT_APPROVED"
      );
    }
  }

  /**
   * Valide un commerce : il peut ouvrir.
   *
   * Le dossier doit être complet. Valider sans Kbis validé serait exactement
   * le trou qu'on vient de boucher. La boutique n'est pas ouverte pour autant :
   * c'est au commerçant de choisir le moment.
   */
  static async valider(orgId: string, adminId: string) {
    const etat = await this.etat(orgId);

    if (etat.valide) {
      throw new ApiError(400, "Ce commerce est déjà validé", "ALREADY_APPROVED");
    }

    if (!etat.dossierComplet) {
      const manquantes = etat.piecesManquantes.map((piece) => piece.libelle).join(", ");

      throw new ApiError(
        400,
        `Dossier incomplet : ${manquantes} ${
          etat.piecesManquantes.length > 1 ? "restent à valider" : "reste à valider"
        }.`,
        "INCOMPLETE_FILE"
      );
    }

    const org = await db.organization.update({
      where: { id: orgId },
      data: { approvedAt: new Date(), approvedBy: adminId },
      select: { id: true, name: true, approvedAt: true, approvedBy: true },
    });

    logger.info("Merchant approved", { orgId, adminId });

    await this.prevenirLeCommercant(
      orgId,
      "Votre commerce est validé",
      "Vos documents ont été validés : vous pouvez ouvrir votre boutique depuis la page Horaires.",
      "/merchant"
    );

    return org;
  }

  /**
   * Prévient la plateforme qu'un dossier attend son examen.
   *
   * Appelé après chaque dépôt : dès que toutes les pièces exigées sont là, et
   * qu'aucune n'est refusée, il y a quelque chose à faire. Sans cet avis, le
   * commerçant attendrait une validation que personne ne sait devoir donner.
   */
  static async signalerDossierPret(orgId: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        approvedAt: true,
        documents: { select: { type: true, status: true } },
      },
    });

    if (!org || org.approvedAt) return;

    const pret = PIECES_EXIGEES.every((type) =>
      org.documents.some((piece) => piece.type === type && piece.status !== "REJECTED")
    );

    if (!pret) return;

    await this.prevenirLaPlateforme(
      `Dossier à examiner — ${org.name}`,
      "Toutes les pièces exigées ont été déposées : le commerce attend sa validation.",
      `/superowner/organizations/${orgId}`
    );
  }

  /**
   * Surveille l'expiration des pièces.
   *
   * Un Kbis ou une pièce d'identité expire sans prévenir. Le commerçant est
   * averti trente jours avant, une seule fois, pour avoir le temps d'en obtenir
   * une nouvelle. Le jour venu, la pièce passe « expirée » et la plateforme
   * l'apprend ; le commerce, lui, n'est pas fermé d'office — c'est à la
   * plateforme d'en décider.
   */
  static async surveillerExpirations(maintenant = new Date()) {
    const horizon = new Date(maintenant.getTime() + JOURS_AVANT_EXPIRATION * JOUR_MS);

    const bientot = await db.organizationDocument.findMany({
      where: {
        status: { in: ["APPROVED", "PENDING"] },
        expiryReminderAt: null,
        expiryDate: { gt: maintenant, lte: horizon },
      },
      include: { org: { select: { name: true } } },
    });

    for (const piece of bientot) {
      const jours = Math.max(
        1,
        Math.ceil((piece.expiryDate!.getTime() - maintenant.getTime()) / JOUR_MS)
      );
      const libelle = libelleDuDocumentCommercant(piece.type);
      const date = piece.expiryDate!.toLocaleDateString("fr-FR");

      // Marquée d'abord : un courriel en échec ne doit pas relancer le
      // commerçant à chaque passage.
      await db.organizationDocument.update({
        where: { id: piece.id },
        data: { expiryReminderAt: maintenant },
      });

      await this.prevenirLeCommercant(
        piece.orgId,
        `${libelle} : expire dans ${jours} jour${jours > 1 ? "s" : ""}`,
        `Votre document expire le ${date}. Déposez-en une version à jour depuis votre profil avant cette date.`,
        "/merchant/profil",
        true
      );
    }

    const expirees = await db.organizationDocument.findMany({
      where: {
        status: { in: ["APPROVED", "PENDING"] },
        expiryDate: { lte: maintenant },
      },
      include: { org: { select: { name: true } } },
    });

    for (const piece of expirees) {
      const libelle = libelleDuDocumentCommercant(piece.type);

      await db.organizationDocument.update({
        where: { id: piece.id },
        data: { status: "EXPIRED" },
      });

      await this.prevenirLeCommercant(
        piece.orgId,
        `${libelle} : document expiré`,
        "Votre document a expiré. Déposez-en une version à jour depuis votre profil.",
        "/merchant/profil",
        true
      );

      await this.prevenirLaPlateforme(
        `Pièce expirée — ${piece.org.name}`,
        `${libelle} a expiré. Le commerce reste ouvert : à vous de décider de la suite.`,
        `/superowner/organizations/${piece.orgId}`
      );
    }

    return { rappels: bientot.length, expirees: expirees.length };
  }

  /**
   * Prévenir le commerçant dans le service — et par courriel quand l'enjeu le
   * justifie : une expiration s'annonce des semaines avant, il ne consulte pas
   * forcément son espace d'ici là.
   */
  private static async prevenirLeCommercant(
    orgId: string,
    titre: string,
    message: string,
    lien: string,
    parCourriel = false
  ) {
    const adhesions = await db.membership.findMany({
      where: { orgId },
      select: { user: { select: { email: true, name: true } } },
    });

    for (const adhesion of adhesions) {
      const email = adhesion.user?.email;
      if (!email) continue;

      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: titre,
          message,
          recipientEmail: email,
          link: lien,
          priority: parCourriel ? "HIGH" : "MEDIUM",
        },
      });

      emitNotification(email, notification);

      if (parCourriel) {
        await EmailService.sendEmail({
          to: email,
          subject: titre,
          html: `<p>Bonjour ${adhesion.user?.name || ""},</p><p>${message}</p>`,
          text: message,
        }).catch((err) =>
          logger.warn("Merchant document reminder email failed", {
            orgId,
            error: err instanceof Error ? err.message : err,
          })
        );
      }
    }
  }

  private static async prevenirLaPlateforme(titre: string, message: string, lien: string) {
    const plateforme = await db.user.findMany({
      where: { OR: [{ isSuperOwner: true }, { isSystemAdmin: true }], status: "ACTIVE" },
      select: { email: true },
    });

    for (const email of new Set(plateforme.map((u) => u.email))) {
      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: titre,
          message,
          recipientEmail: email,
          link: lien,
        },
      });

      emitNotification(email, notification);
    }
  }
}
