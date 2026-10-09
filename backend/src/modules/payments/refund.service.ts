import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import type { RefundOperation, RefundOperationStatus } from "@prisma/client";
import { db, type ClientTransaction } from "../../services/db";
import { stripe } from "./stripe";
import { montantAEncaisser } from "../delivery/delivery-mode.service";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { delaiAvantRelance } from "../jobs/outbox.service";

const BAIL_MS = 2 * 60_000;
// Stripe conserve une clé au moins 24 h. Au-delà de 23 h, on réconcilie
// seulement : recréer à l'aveugle après purge de la clé pourrait doubler.
const FENETRE_CREATION_MS = 23 * 60 * 60_000;
const MAX_TENTATIVES = 12;
const idStripe = (v: string | { id: string } | null) =>
  typeof v === "string" ? v : v?.id;
const cents = (v: unknown) => Math.round(Number(v) * 100);

/** Tous les remboursements, y compris les anciens hors première page. */
async function remboursements(paymentIntentId: string) {
  const resultat: Stripe.Refund[] = [];
  let apres: string | undefined;
  do {
    const page = await stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: 100,
      ...(apres ? { starting_after: apres } : {}),
    });
    resultat.push(...page.data);
    if (!page.has_more) break;
    apres = page.data.at(-1)?.id;
    if (!apres)
      throw new ApiError(
        503,
        "Réconciliation Stripe incomplète.",
        "REFUND_LIST_INCOMPLETE",
      );
  } while (apres);
  return resultat;
}

export const RefundService = {
  /** L'appelant détient le verrou de la commande dans sa transaction métier. */
  async enregistrerPourCommande(
    tx: ClientTransaction,
    orderId: string,
    reason: string,
  ) {
    const commande = await tx.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    const paiement = commande?.payments[0];
    if (
      !commande ||
      !paiement?.stripePaymentIntentId ||
      commande.paymentStatus !== "SUCCEEDED"
    )
      return null;
    const montant = cents(paiement.amount);
    if (
      montant <= 0 ||
      montant !== cents(montantAEncaisser(commande)) ||
      paiement.currency.toLowerCase() !== "eur"
    ) {
      throw new ApiError(
        409,
        "Montant ou devise du remboursement incohérent.",
        "REFUND_AMOUNT_MISMATCH",
      );
    }
    // INSERT ON CONFLICT : pas de P2002 absorbé dans une transaction PostgreSQL
    // déjà invalidée. La clé et le payload ne changent jamais lors d'un rejeu.
    const cree = await tx.refundOperation.createMany({
      data: {
        id: randomUUID(),
        paymentId: paiement.id,
        paymentIntentId: paiement.stripePaymentIntentId,
        amountCents: montant,
        currency: paiement.currency.toLowerCase(),
        reason: reason.slice(0, 300),
        idempotencyKey: `a03-remboursement-${paiement.id}`,
        ...(paiement.stripeRefundId
          ? { stripeRefundId: paiement.stripeRefundId }
          : {}),
      },
      skipDuplicates: true,
    });
    const operation = await tx.refundOperation.findUnique({
      where: { paymentId: paiement.id },
    });
    if (!operation)
      throw new ApiError(
        409,
        "Intention de remboursement non enregistrée.",
        "REFUND_REGISTRATION_CONFLICT",
      );
    if (cree.count && operation)
      await tx.refundOperationEvent.create({
        data: { operationId: operation.id, status: "REQUESTED" },
      });
    return operation;
  },

  async demander(orderId: string, reason: string, adminId?: string) {
    return db.$transaction(async (tx) => {
      // Même verrou que le refus et le webhook, sans appel Stripe.
      await tx.order.updateMany({
        where: { id: orderId },
        data: { updatedAt: new Date() },
      });
      const operation = await this.enregistrerPourCommande(tx, orderId, reason);
      if (operation && adminId)
        await tx.systemAuditLog.create({
          data: {
            adminId,
            action: "REFUND_REQUESTED",
            target: orderId,
            changes: {
              operationId: operation.id,
              amountCents: operation.amountCents,
              reason,
            },
          },
        });
      return operation;
    });
  },

  /** Une reprise humaine conserve impérativement la même clé et firstCallAt. */
  async reprendre(orderId: string, reason: string, adminId: string) {
    return db.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id: orderId },
        data: { updatedAt: new Date() },
      });
      const paiement = await tx.payment.findUnique({ where: { orderId } });
      let operation = paiement
        ? await tx.refundOperation.findUnique({
            where: { paymentId: paiement.id },
          })
        : null;
      if (!operation)
        throw new ApiError(
          409,
          "Aucun remboursement à reprendre.",
          "REFUND_NOT_RETRYABLE",
        );
      if (
        operation.status === "PROCESSING" &&
        operation.lockedUntil &&
        operation.lockedUntil > new Date()
      ) {
        throw new ApiError(
          409,
          "Un worker traite ce remboursement.",
          "REFUND_BUSY",
        );
      }
      if (operation.status !== "SUCCEEDED") {
        operation = await tx.refundOperation.update({
          where: { id: operation.id },
          data: {
            status: "RETRY",
            version: { increment: 1 },
            nextAttemptAt: new Date(),
            lockedUntil: null,
          },
        });
        await tx.refundOperationEvent.create({
          data: {
            operationId: operation.id,
            status: "RETRY",
            code: "ADMIN_RETRY",
          },
        });
      }
      await tx.systemAuditLog.create({
        data: {
          adminId,
          action: "REFUND_RETRY",
          target: orderId,
          changes: { operationId: operation.id, reason },
        },
      });
      return operation;
    });
  },

  async traiterLesDus(
    limite = 20,
    maintenant = new Date(),
    operationId?: string,
  ) {
    const candidats = await db.refundOperation.findMany({
      where: {
        ...(operationId ? { id: operationId } : {}),
        OR: [
          {
            status: { in: ["REQUESTED", "RETRY", "WAITING_STRIPE"] },
            nextAttemptAt: { lte: maintenant },
          },
          { status: "PROCESSING", lockedUntil: { lte: maintenant } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: limite,
    });
    for (const candidat of candidats) {
      const operation = await db.$transaction(async (tx) => {
        const pris = await tx.refundOperation.updateMany({
          where: {
            id: candidat.id,
            version: candidat.version,
            status: candidat.status,
          },
          data: {
            status: "PROCESSING",
            version: { increment: 1 },
            attempts: { increment: 1 },
            lockedUntil: new Date(maintenant.getTime() + BAIL_MS),
          },
        });
        if (pris.count !== 1) return null;
        await tx.refundOperationEvent.create({
          data: { operationId: candidat.id, status: "PROCESSING" },
        });
        return tx.refundOperation.findUniqueOrThrow({
          where: { id: candidat.id },
        });
      });
      if (!operation) continue;
      try {
        await this.executer(operation, maintenant);
      } catch (err) {
        // Ne stocker ni réponse SDK ni message pouvant contenir des données
        // sensibles : un code exploitable suffit au journal et à l'alerte.
        const code =
          err instanceof ApiError ? err.code : "STRIPE_OR_DATABASE_UNAVAILABLE";
        const definitif = err instanceof ApiError && err.statusCode === 409;
        await this.terminer(
          operation,
          definitif || operation.attempts >= MAX_TENTATIVES
            ? "ABANDONED"
            : "RETRY",
          { lastError: code },
          maintenant,
        );
      }
    }
    return candidats.length;
  },

  /** Réconciliation hors transaction ; aucun ancien payload webhook ne fait foi. */
  async executer(operation: RefundOperation, maintenant: Date) {
    const intention = await stripe.paymentIntents.retrieve(
      operation.paymentIntentId,
    );
    if (
      intention.id !== operation.paymentIntentId ||
      intention.status !== "succeeded" ||
      intention.currency !== operation.currency ||
      intention.amount_received !== operation.amountCents
    ) {
      throw new ApiError(
        409,
        "Paiement Stripe incohérent.",
        "REFUND_AMOUNT_MISMATCH",
      );
    }
    const liste = await remboursements(operation.paymentIntentId);
    if (
      liste.some(
        (r) =>
          r.currency !== operation.currency ||
          idStripe(r.payment_intent) !== operation.paymentIntentId,
      )
    ) {
      throw new ApiError(
        409,
        "Remboursement Stripe incohérent.",
        "REFUND_AMOUNT_MISMATCH",
      );
    }
    const rendu = liste
      .filter((r) => r.status === "succeeded")
      .reduce((s, r) => s + r.amount, 0);
    if (rendu > operation.amountCents)
      throw new ApiError(
        409,
        "Cumul Stripe incohérent.",
        "REFUND_AMOUNT_MISMATCH",
      );
    if (rendu === operation.amountCents) {
      await this.terminer(
        operation,
        "SUCCEEDED",
        {
          refundedCents: rendu,
          stripeRefundId: liste.find((r) => r.status === "succeeded")?.id,
        },
        maintenant,
      );
      return;
    }
    const connu = liste.find(
      (r) =>
        r.id === operation.stripeRefundId ||
        r.metadata?.refundOperationId === operation.id,
    );
    const enAttente = liste.filter(
      (r) => r.status === "pending" || r.status === "requires_action",
    );
    if (
      enAttente.reduce((s, r) => s + r.amount, rendu) > operation.amountCents
    ) {
      throw new ApiError(
        409,
        "Cumul Stripe incohérent.",
        "REFUND_AMOUNT_MISMATCH",
      );
    }
    if (enAttente.length) {
      await this.terminer(
        operation,
        "WAITING_STRIPE",
        { stripeRefundId: connu?.id ?? enAttente[0].id, refundedCents: rendu },
        maintenant,
      );
      return;
    }
    if (connu && (connu.status === "failed" || connu.status === "canceled")) {
      await this.terminer(
        operation,
        "ABANDONED",
        { refundedCents: rendu, lastError: "REFUND_FAILED_MANUAL_REVIEW" },
        maintenant,
      );
      return;
    }
    if (operation.stripeRefundId && !connu) {
      throw new ApiError(
        409,
        "Remboursement enregistré absent de Stripe.",
        "REFUND_REFERENCE_MISSING",
      );
    }
    // Une restitution partielle exige un examen : le payload de cette opération
    // reste le remboursement total figé, on ne change jamais sa clé ni son montant.
    if (rendu > 0) {
      await this.terminer(
        operation,
        "ABANDONED",
        { refundedCents: rendu, lastError: "REFUND_PARTIAL_MANUAL_REVIEW" },
        maintenant,
      );
      return;
    }
    if (
      operation.firstCallAt &&
      maintenant.getTime() - operation.firstCallAt.getTime() >=
        FENETRE_CREATION_MS
    ) {
      throw new ApiError(
        409,
        "Résultat externe incertain après expiration de la clé.",
        "REFUND_IDEMPOTENCY_WINDOW_EXPIRED",
      );
    }
    // Écrit AVANT l'appel : même un arrêt immédiat laisse la fenêtre bornée.
    const autorise = await db.refundOperation.updateMany({
      where: {
        id: operation.id,
        version: operation.version,
        status: "PROCESSING",
      },
      data: { firstCallAt: operation.firstCallAt ?? maintenant },
    });
    if (!autorise.count) return;
    const remboursement = await stripe.refunds.create(
      {
        payment_intent: operation.paymentIntentId,
        amount: operation.amountCents,
        reason: "requested_by_customer",
        metadata: { refundOperationId: operation.id, raison: operation.reason },
      },
      { idempotencyKey: operation.idempotencyKey },
    );
    if (
      remboursement.amount !== operation.amountCents ||
      remboursement.currency !== operation.currency ||
      idStripe(remboursement.payment_intent) !== operation.paymentIntentId
    ) {
      throw new ApiError(
        409,
        "Réponse Stripe incohérente.",
        "REFUND_AMOUNT_MISMATCH",
      );
    }
    await this.terminer(
      operation,
      remboursement.status === "succeeded"
        ? "SUCCEEDED"
        : ["failed", "canceled"].includes(remboursement.status ?? "")
          ? "ABANDONED"
          : "WAITING_STRIPE",
      {
        stripeRefundId: remboursement.id,
        refundedCents:
          remboursement.status === "succeeded" ? remboursement.amount : 0,
        lastError: ["failed", "canceled"].includes(remboursement.status ?? "")
          ? "REFUND_FAILED_MANUAL_REVIEW"
          : null,
      },
      maintenant,
    );
  },

  async terminer(
    operation: RefundOperation,
    status: RefundOperationStatus,
    resultat: {
      stripeRefundId?: string;
      refundedCents?: number;
      lastError?: string | null;
    },
    maintenant: Date,
  ) {
    const applique = await db.$transaction(async (tx) => {
      // Même verrou que le webhook payé ; empêche une résurrection concurrente.
      const paiement = await tx.payment.findUniqueOrThrow({
        where: { id: operation.paymentId },
      });
      await tx.order.updateMany({
        where: { id: paiement.orderId },
        data: { updatedAt: maintenant },
      });
      const pris = await tx.refundOperation.updateMany({
        where: {
          id: operation.id,
          status: "PROCESSING",
          version: operation.version,
        },
        data: {
          status,
          lockedUntil: null,
          lastError: resultat.lastError ?? null,
          ...(resultat.stripeRefundId
            ? { stripeRefundId: resultat.stripeRefundId }
            : {}),
          ...(status === "SUCCEEDED" ? { completedAt: maintenant } : {}),
          nextAttemptAt: new Date(
            maintenant.getTime() +
              (status === "WAITING_STRIPE"
                ? 60_000
                : delaiAvantRelance(operation.attempts)),
          ),
        },
      });
      if (!pris.count) return false;
      await tx.refundOperationEvent.create({
        data: { operationId: operation.id, status, code: resultat.lastError },
      });
      const rendu = resultat.refundedCents;
      if (rendu !== undefined) {
        // Le cumul réussi est monotone : une lecture concurrente plus ancienne
        // ne peut effacer un remboursement déjà constaté.
        const actuel = await tx.payment.findUniqueOrThrow({
          where: { id: operation.paymentId },
        });
        if (rendu >= cents(actuel.refundedAmount ?? 0)) {
          await tx.payment.update({
            where: { id: operation.paymentId },
            data: {
              ...(resultat.stripeRefundId
                ? { stripeRefundId: resultat.stripeRefundId }
                : {}),
              refundedAmount: rendu ? rendu / 100 : null,
              ...(rendu ? { refundedAt: actuel.refundedAt ?? maintenant } : {}),
              ...(status === "SUCCEEDED" ? { status: "REFUNDED" } : {}),
            },
          });
        }
      }
      if (status === "SUCCEEDED")
        await tx.order.update({
          where: { id: paiement.orderId },
          data: { paymentStatus: "REFUNDED" },
        });
      return true;
    });
    if (applique && status === "ABANDONED")
      logger.error("Remboursement abandonné : intervention requise", {
        operationId: operation.id,
        paymentId: operation.paymentId,
        code: resultat.lastError,
      });
  },

  /** Réveil durable : l'événement n'écrit jamais son état financier périmé. */
  async reveiller(paymentIntentId: string) {
    const { count } = await db.refundOperation.updateMany({
      where: {
        paymentIntentId,
        status: { in: ["REQUESTED", "RETRY", "WAITING_STRIPE", "ABANDONED"] },
      },
      data: { status: "RETRY", nextAttemptAt: new Date() },
    });
    return count > 0;
  },

  async aExaminer(cursor?: string, limite = 50) {
    return db.payment.findMany({
      where: {
        status: "SUCCEEDED",
        OR: [
          {
            order: {
              OR: [{ status: "REJECTED" }, { deletedAt: { not: null } }],
            },
          },
          { refundOperation: { is: { status: { not: "SUCCEEDED" } } } },
          { stripeRefundId: { not: null } },
        ],
      },
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        stripePaymentIntentId: true,
        stripeRefundId: true,
        refundedAmount: true,
        order: { select: { status: true, deletedAt: true } },
        refundOperation: {
          include: { history: { orderBy: { createdAt: "desc" }, take: 20 } },
        },
      },
      orderBy: { id: "asc" },
      take: limite,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  },
};
