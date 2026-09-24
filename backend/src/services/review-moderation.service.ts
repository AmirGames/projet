import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { emitNotification } from "../config/socket";
import { logger } from "../config/logger";
import { etatModeration } from "./etat-moderation";

/**
 * La modération des avis.
 *
 * Le commerçant ne décide pas du sort des avis qu'il reçoit : il pouvait les
 * rejeter ou les supprimer, et donc ne garder que les bons. Il les signale
 * désormais, avec un motif, et la plateforme tranche : conserver l'avis ou le
 * retirer.
 *
 * Un avis signalé reste publié tant que la plateforme n'a pas décidé.
 */

async function notifier(emails: string[], titre: string, message: string, lien: string) {
  for (const email of new Set(emails)) {
    try {
      const notification = await db.notification.create({
        data: { type: "PLATFORM_ANNOUNCEMENT", title: titre, message, recipientEmail: email, link: lien },
      });
      emitNotification(email, notification);
    } catch (err) {
      logger.warn("Review moderation notification failed", {
        email,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}

async function prevenirLaPlateforme(message: string) {
  const plateforme = await db.user.findMany({
    where: { OR: [{ isSuperOwner: true }, { isSystemAdmin: true }], status: "ACTIVE" },
    select: { email: true },
  });

  await notifier(
    plateforme.map((u) => u.email),
    "Avis à examiner",
    message,
    "/superowner/reviews"
  );
}

export class ReviewModerationService {
  /** Le commerçant signale un avis reçu par sa boutique. */
  static async signaler(storeId: string, reviewId: string, reason: string, userId: string) {
    const avis = await db.review.findUnique({
      where: { id: reviewId },
      include: {
        reports: { select: { createdAt: true, decision: true, decisionNote: true, decidedAt: true } },
        store: { select: { name: true } },
      },
    });

    if (!avis || avis.storeId !== storeId) {
      throw new ApiError(404, "Avis introuvable", "REVIEW_NOT_FOUND");
    }

    const etat = etatModeration(avis, avis.reports);

    if (etat.signalement === "EN_ATTENTE") {
      throw new ApiError(409, "Cet avis est déjà signalé : la plateforme l'examine", "REVIEW_ALREADY_REPORTED");
    }

    if (!etat.peutSignaler) {
      throw new ApiError(
        409,
        avis.status === "APPROVED"
          ? "La plateforme a choisi de conserver cet avis. Vous pourrez le signaler à nouveau si le client le modifie."
          : "Cet avis n'est pas publié",
        "REVIEW_NOT_REPORTABLE"
      );
    }

    const signalement = await db.reviewReport.create({
      data: { reviewId, reason: reason.trim(), reportedById: userId },
    });

    await prevenirLaPlateforme(`${avis.store.name} signale un avis : « ${reason.trim()} »`);

    return signalement;
  }

  /**
   * Le client a retouché un avis que la plateforme avait retiré.
   *
   * Il reste retiré, mais la nouvelle version revient devant la plateforme :
   * c'est à elle, pas à la retouche, de décider s'il est republié.
   */
  static async apresRetoucheDUnAvisRetire(reviewId: string) {
    const enAttente = await db.reviewReport.findFirst({ where: { reviewId, decision: null } });
    if (enAttente) return;

    await db.reviewReport.create({
      data: { reviewId, reason: "Avis modifié par le client après son retrait" },
    });

    await prevenirLaPlateforme("Un client a modifié un avis retiré : à republier ou non");
  }

  /** Les signalements, en attente ou tranchés. */
  static async lister(etat: "EN_ATTENTE" | "TRAITES", skip = 0, take = 50) {
    const where = etat === "EN_ATTENTE" ? { decision: null } : { decision: { not: null } };

    const [signalements, total] = await Promise.all([
      db.reviewReport.findMany({
        where,
        orderBy: etat === "EN_ATTENTE" ? { createdAt: "asc" } : { decidedAt: "desc" },
        skip,
        take,
        include: {
          review: {
            include: {
              store: { select: { id: true, name: true } },
              product: { select: { name: true } },
              customer: { select: { name: true, email: true } },
            },
          },
        },
      }),
      db.reviewReport.count({ where }),
    ]);

    const comptes = await db.user.findMany({
      where: {
        id: {
          in: signalements.flatMap((s) => [s.reportedById, s.decidedById]).filter((id): id is string => !!id),
        },
      },
      select: { id: true, email: true, name: true },
    });
    const compte = (id: string | null) => (id ? comptes.find((c) => c.id === id) ?? null : null);

    return {
      data: signalements.map((s) => ({
        id: s.id,
        motif: s.reason,
        signaleLe: s.createdAt,
        // Absent : signalement automatique, après la retouche d'un avis retiré.
        signalePar: compte(s.reportedById),
        decision: s.decision,
        noteDecision: s.decisionNote,
        decideLe: s.decidedAt,
        decidePar: compte(s.decidedById),
        avis: {
          id: s.review.id,
          note: s.review.rating,
          commentaire: s.review.comment,
          statut: s.review.status,
          modifieLe: s.review.editedAt,
          boutique: s.review.store,
          plat: s.review.product?.name ?? null,
          client: s.review.customer,
        },
      })),
      total,
    };
  }

  /** La plateforme tranche : conserver l'avis, ou le retirer. */
  static async decider(reportId: string, decision: "KEPT" | "REMOVED", note: string | undefined, userId: string) {
    const signalement = await db.reviewReport.findUnique({
      where: { id: reportId },
      include: { review: { include: { store: { select: { name: true, orgId: true } } } } },
    });

    if (!signalement) {
      throw new ApiError(404, "Signalement introuvable", "REPORT_NOT_FOUND");
    }

    if (signalement.decision) {
      throw new ApiError(409, "Ce signalement est déjà tranché", "REPORT_ALREADY_DECIDED");
    }

    const [tranche] = await db.$transaction([
      db.reviewReport.update({
        where: { id: reportId },
        data: { decision, decisionNote: note?.trim() || null, decidedById: userId, decidedAt: new Date() },
      }),
      db.review.update({
        where: { id: signalement.reviewId },
        data: { status: decision === "REMOVED" ? "REMOVED" : "APPROVED" },
      }),
    ]);

    await db.systemAuditLog.create({
      data: {
        adminId: userId,
        action: decision === "REMOVED" ? "REMOVE_REVIEW" : "KEEP_REVIEW",
        target: signalement.reviewId,
        changes: { signalement: reportId, motif: signalement.reason, note: note ?? null } as any,
      },
    });

    // Le commerçant qui a signalé apprend ce qui a été décidé.
    if (signalement.reportedById) {
      const auteur = await db.user.findUnique({
        where: { id: signalement.reportedById },
        select: { email: true },
      });

      if (auteur) {
        await notifier(
          [auteur.email],
          decision === "REMOVED" ? "Avis retiré" : "Avis conservé",
          decision === "REMOVED"
            ? "La plateforme a retiré l'avis que vous aviez signalé."
            : `La plateforme a choisi de conserver l'avis que vous aviez signalé${note?.trim() ? ` : ${note.trim()}` : "."}`,
          `/merchant/${signalement.review.store.orgId}/reviews`
        );
      }
    }

    return tranche;
  }
}
