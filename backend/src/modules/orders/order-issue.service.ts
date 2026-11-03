import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { codeErreur } from "../../utils/code-erreur";

export const CATEGORIES_INCIDENT = ["MISSING_ITEM", "WRONG_ORDER", "LATE_ORDER", "OTHER"] as const;
export const incidentCommandeSchema = z.object({
  category: z.enum(CATEGORIES_INCIDENT), message: z.string().trim().min(5).max(1000),
  requestRefund: z.boolean().default(false),
  items: z.array(z.object({ lineId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(1000) }).strict()).max(50).default([]),
}).strict();
const CHAMPS_PUBLICS = {
  id: true, category: true, message: true, items: true, requestRefund: true,
  status: true, response: true, resolvedAt: true, createdAt: true,
  refundOperation: { select: { kind: true, amountCents: true, currency: true, status: true, createdAt: true, completedAt: true } },
} as const;
const CHAMPS_COMMANDE = {
  id: true, status: true, paymentStatus: true, submittedAt: true, createdAt: true,
  delivery: { select: { status: true } },
  items: { select: { id: true, quantity: true, product: { select: { name: true } }, variant: { select: { label: true } } } },
  issues: { select: CHAMPS_PUBLICS, orderBy: { createdAt: "desc" as const } },
} as const;
type Commande = NonNullable<Awaited<ReturnType<typeof lire>>>;
const DELAI_SIGNALER = 7 * 24 * 60 * 60_000;

async function lire(orderId: string) {
  return db.order.findFirst({ where: { id: orderId, deletedAt: null }, select: CHAMPS_COMMANDE });
}

/** Une semaine depuis la création, avec une date fixe que les éditions n'allongent pas. */
function categoriesPossibles(commande: Commande, maintenant: number) {
  if (!commande.submittedAt || maintenant > commande.createdAt.getTime() + DELAI_SIGNALER || commande.status === "REJECTED") return [];
  const recue = commande.status === "COMPLETED" || commande.delivery?.status === "DELIVERED";
  const categories: (typeof CATEGORIES_INCIDENT[number])[] = recue ? ["MISSING_ITEM", "WRONG_ORDER", "OTHER"] : ["OTHER"];
  if (!recue && maintenant - commande.createdAt.getTime() >= 15 * 60_000) categories.push("LATE_ORDER");
  return categories.filter((c) => !commande.issues.some((i) => i.category === c));
}
const articles = (commande: Commande) => commande.items.map((i) => ({ id: i.id, quantity: i.quantity,
  name: [i.product?.name ?? "Article", i.variant?.label].filter(Boolean).join(" · ") }));

/** Ces fonctions sont appelées après contrôle du propriétaire/jeton dans les routes. */
export const OrderIssueService = {
  async etat(orderId: string, maintenant = Date.now()) {
    const commande = await lire(orderId);
    if (!commande) throw new ApiError(404, "Commande introuvable", "NOT_FOUND");
    return { categories: categoriesPossibles(commande, maintenant), refundPossible: commande.paymentStatus === "SUCCEEDED",
      items: articles(commande), dossiers: commande.issues };
  },
  async signaler(orderId: string, entree: z.infer<typeof incidentCommandeSchema>, maintenant = Date.now()) {
    const commande = await lire(orderId);
    if (!commande) throw new ApiError(404, "Commande introuvable", "NOT_FOUND");
    const existant = commande.issues.find((i) => i.category === entree.category);
    if (existant) return existant;
    if (!categoriesPossibles(commande, maintenant).includes(entree.category)) throw new ApiError(409, "Ce signalement n'est pas disponible pour cette commande", "ISSUE_NOT_AVAILABLE");
    if (entree.requestRefund && commande.paymentStatus !== "SUCCEEDED") throw new ApiError(409, "Aucun paiement encaissé à examiner pour remboursement", "REFUND_NOT_AVAILABLE");
    if (entree.category === "MISSING_ITEM" ? entree.items.length === 0 : entree.items.length !== 0) throw new ApiError(400, "Sélection d'articles invalide", "INVALID_ISSUE_ITEMS");
    const parId = new Map(articles(commande).map((i) => [i.id, i]));
    const uniques = new Set<string>();
    const items = entree.items.map((i) => {
      const article = parId.get(i.lineId);
      if (!article || uniques.has(i.lineId) || i.quantity > article.quantity) throw new ApiError(400, "Cet article ou cette quantité n'appartient pas à la commande", "INVALID_ISSUE_ITEMS");
      uniques.add(i.lineId);
      return { lineId: i.lineId, name: article.name, quantity: i.quantity };
    });
    try {
      return await db.orderIssue.create({ data: { orderId, category: entree.category, message: entree.message,
        items, requestRefund: entree.requestRefund }, select: CHAMPS_PUBLICS });
    } catch (err) {
      // Deux envois simultanés restent un seul dossier par motif.
      if (codeErreur(err) !== "P2002") throw err;
      return db.orderIssue.findUniqueOrThrow({ where: { orderId_category: { orderId, category: entree.category } }, select: CHAMPS_PUBLICS });
    }
  },
  async lister(status: "OPEN" | "RESOLVED" | "REJECTED" | undefined, skip: number, take: number) {
    const where = { ...(status ? { status } : {}), order: { deletedAt: null } };
    const [dossiers, total] = await Promise.all([
      db.orderIssue.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take,
        include: { refundOperation: CHAMPS_PUBLICS.refundOperation, order: { select: { id: true, status: true, paymentStatus: true, store: { select: { name: true } } } } } }),
      db.orderIssue.count({ where }),
    ]);
    return { dossiers, total };
  },
  async repondre(id: string, adminId: string, status: "RESOLVED" | "REJECTED", response: string) {
    return db.$transaction(async (tx) => {
      const initial = await tx.orderIssue.findUnique({ where: { id } });
      if (!initial) throw new ApiError(404, "Dossier introuvable", "NOT_FOUND");
      await tx.order.updateMany({ where: { id: initial.orderId }, data: { updatedAt: new Date() } });
      const dossier = await tx.orderIssue.findUnique({ where: { id }, include: { refundOperation: { select: { id: true } } } });
      if (!dossier) throw new ApiError(404, "Dossier introuvable", "NOT_FOUND");
      if (status === "REJECTED" && dossier.refundOperation) throw new ApiError(409, "Un remboursement est déjà engagé pour ce dossier.", "ISSUE_REFUND_ALREADY_REQUESTED");
      if (dossier.status !== "OPEN") {
        if (dossier.status === status && dossier.response === response) return dossier;
        throw new ApiError(409, "Ce dossier a déjà reçu une réponse", "ISSUE_ALREADY_HANDLED");
      }
      const change = await tx.orderIssue.updateMany({ where: { id, status: "OPEN" }, data: { status, response, resolvedAt: new Date() } });
      if (change.count !== 1) throw new ApiError(409, "Ce dossier vient d'être traité", "ISSUE_ALREADY_HANDLED");
      await tx.systemAuditLog.create({ data: { adminId, action: "ORDER_ISSUE_RESPONSE", target: id, changes: { status, orderId: dossier.orderId } } });
      return tx.orderIssue.findUniqueOrThrow({ where: { id } });
    });
  },
};
