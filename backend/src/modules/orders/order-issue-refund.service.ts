import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, type ClientTransaction } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { montantAEncaisser } from "../delivery/delivery-mode.service";

const ligneSchema = z.object({ lineId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(1000) }).strict();
export const remboursementIncidentSchema = z.object({
  mode: z.enum(["ITEMS", "BALANCE"]),
  items: z.array(ligneSchema).max(50).default([]),
  reason: z.string().trim().min(5).max(300),
  expectedAmountCents: z.number().int().positive().max(2_147_483_647),
}).strict();
type Demande = z.infer<typeof remboursementIncidentSchema>;
const cents = (value: unknown) => Math.round(Number(value) * 100);
const conflit = (message: string, code = "ISSUE_REFUND_UNAVAILABLE") => new ApiError(409, message, code);

/** Répartition déterministe de la remise au centime, puis entre les unités. */
export function repartirArticles(items: { id: string; quantity: number; total: unknown }[], discountAmount: unknown) {
  const lignes = items.map((i) => ({ ...i, grossCents: cents(i.total) }));
  const brut = lignes.reduce((s, i) => s + i.grossCents, 0);
  const remise = cents(discountAmount);
  if (!Number.isSafeInteger(brut) || brut < 0 || !Number.isSafeInteger(remise) || remise < 0 || remise > brut ||
      lignes.some((i) => !Number.isSafeInteger(i.grossCents) || i.grossCents < 0 || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 1000)) {
    throw conflit("Les montants des articles nécessitent une vérification.", "REFUND_AMOUNT_MISMATCH");
  }
  if (brut === 0) return lignes.map(({ id, quantity }) => ({ id, quantity, netCents: 0 }));
  const net = BigInt(brut - remise);
  const reparties = lignes.map((i) => {
    const numerateur = BigInt(i.grossCents) * net;
    return { ...i, netCents: Number(numerateur / BigInt(brut)), reste: numerateur % BigInt(brut) };
  });
  let surplus = Number(net) - reparties.reduce((s, i) => s + i.netCents, 0);
  for (const i of [...reparties].sort((a, b) => a.reste === b.reste ? a.id.localeCompare(b.id) : a.reste > b.reste ? -1 : 1)) {
    if (surplus-- <= 0) break;
    i.netCents++;
  }
  return reparties.map(({ id, quantity, netCents }) => ({ id, quantity, netCents }));
}
export const montantQuantite = (netCents: number, quantity: number, n: number) =>
  Math.floor(netCents / quantity) * n + Math.min(netCents % quantity, n);

const itemsEnregistres = z.array(ligneSchema.extend({ amountCents: z.number().int().nonnegative() }).strict());
const operationPublique = (operation: { id: string; kind: string; amountCents: number; currency: string; status: string; items: unknown; createdAt: Date; completedAt: Date | null }) => ({
  id: operation.id, kind: operation.kind, amountCents: operation.amountCents, currency: operation.currency,
  status: operation.status, items: operation.items, createdAt: operation.createdAt, completedAt: operation.completedAt,
});

async function contexte(tx: ClientTransaction, issueId: string) {
  const dossier = await tx.orderIssue.findUnique({ where: { id: issueId }, include: { order: {
    include: { payments: { include: { refundOperations: true } }, items: { include: { product: { select: { name: true } }, variant: { select: { label: true } } } } },
  } } });
  if (!dossier || dossier.order.deletedAt) throw new ApiError(404, "Dossier introuvable", "NOT_FOUND");
  return dossier;
}
type Contexte = Awaited<ReturnType<typeof contexte>>;

function preparer(dossier: Contexte) {
  const commande = dossier.order;
  const paiement = commande.payments[0];
  const existante = paiement?.refundOperations.find((o) => o.supportIssueId === dossier.id);
  if (existante) return { operation: operationPublique(existante), available: false as const, items: [], remainingCents: 0 };
  if (!dossier.requestRefund || dossier.status === "REJECTED") throw conflit("Ce dossier ne permet pas de décision de remboursement.");
  if (commande.status !== "COMPLETED") throw conflit("Traitez d'abord la commande en cours. Le remboursement d'un incident est disponible après sa clôture.");
  if (commande.paymentStatus !== "SUCCEEDED" || paiement?.status !== "SUCCEEDED" || !paiement.stripePaymentIntentId) throw conflit("Aucun paiement en ligne restant à rembourser.");
  const total = cents(paiement.amount);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 2_147_483_647 || total !== cents(montantAEncaisser(commande)) || paiement.currency.toLowerCase() !== "eur") throw conflit("Montant ou devise du paiement incohérent.", "REFUND_AMOUNT_MISMATCH");
  if (paiement.refundOperations.some((o) => o.kind === "FULL_ORDER" || o.status !== "SUCCEEDED")) throw conflit("Un remboursement précédent nécessite d'abord une vérification.", "REFUND_PREVIOUS_OPERATION");
  const rendu = paiement.refundOperations.reduce((s, o) => s + o.amountCents, 0);
  if (rendu !== cents(paiement.refundedAmount ?? 0) || rendu >= total) throw conflit("Le cumul des remboursements nécessite une vérification.", "REFUND_AMOUNT_MISMATCH");
  const quantites = new Map<string, number>();
  for (const op of paiement.refundOperations) {
    if (op.kind === "ISSUE_BALANCE") throw conflit("Le solde de cette commande a déjà été remboursé.");
    for (const i of itemsEnregistres.parse(op.items)) quantites.set(i.lineId, (quantites.get(i.lineId) ?? 0) + i.quantity);
  }
  const reparties = repartirArticles(commande.items, commande.discountAmount);
  const items = reparties.map((i) => {
    const article = commande.items.find((l) => l.id === i.id)!;
    const refundedQuantity = quantites.get(i.id) ?? 0;
    if (refundedQuantity > i.quantity) throw conflit("Quantités déjà remboursées incohérentes.", "REFUND_AMOUNT_MISMATCH");
    return { lineId: i.id, name: [article.product.name, article.variant?.label].filter(Boolean).join(" · "),
      quantity: i.quantity, refundedQuantity, netCents: i.netCents };
  });
  return { operation: null, available: true as const, items, remainingCents: total - rendu };
}

function calculer(dossier: Contexte, demande: Demande) {
  const etat = preparer(dossier);
  if (!etat.available) throw conflit("Ce dossier possède déjà un remboursement.", "REFUND_ALREADY_REQUESTED");
  if (demande.mode === "BALANCE") {
    if (demande.items.length) throw new ApiError(400, "Le remboursement du solde ne prend pas d'articles.", "INVALID_REFUND_ITEMS");
    return { amountCents: etat.remainingCents, items: [], kind: "ISSUE_BALANCE" as const };
  }
  if (!demande.items.length) throw new ApiError(400, "Sélectionnez au moins un article.", "INVALID_REFUND_ITEMS");
  const uniques = new Set<string>();
  const items = demande.items.map((i) => {
    const ligne = etat.items.find((l) => l.lineId === i.lineId);
    if (!ligne || uniques.has(i.lineId) || i.quantity > ligne.quantity - ligne.refundedQuantity) throw new ApiError(400, "Article ou quantité non remboursable.", "INVALID_REFUND_ITEMS");
    uniques.add(i.lineId);
    return { ...i, amountCents: montantQuantite(ligne.netCents, ligne.quantity, ligne.refundedQuantity + i.quantity) - montantQuantite(ligne.netCents, ligne.quantity, ligne.refundedQuantity) };
  }).sort((a, b) => a.lineId.localeCompare(b.lineId));
  const amountCents = items.reduce((s, i) => s + i.amountCents, 0);
  if (amountCents <= 0 || amountCents > etat.remainingCents) throw conflit("Montant sélectionné non remboursable.", "REFUND_AMOUNT_MISMATCH");
  return { amountCents, items, kind: "ISSUE_ITEMS" as const };
}

export const OrderIssueRefundService = {
  async reprendre(issueId: string, adminId: string, reason: string) {
    return db.$transaction(async (tx) => {
      const initial = await contexte(tx, issueId);
      await tx.order.updateMany({ where: { id: initial.orderId }, data: { updatedAt: new Date() } });
      const operation = await tx.refundOperation.findUnique({ where: { supportIssueId: issueId } });
      if (!operation) throw conflit("Aucun remboursement à vérifier.", "REFUND_NOT_RETRYABLE");
      if (operation.status === "PROCESSING" && operation.lockedUntil && operation.lockedUntil > new Date()) throw conflit("Un worker traite ce remboursement.", "REFUND_BUSY");
      if (operation.status === "SUCCEEDED") return operationPublique(operation);
      const reprise = await tx.refundOperation.update({ where: { id: operation.id }, data: {
        status: "RETRY", version: { increment: 1 }, nextAttemptAt: new Date(), lockedUntil: null,
      } });
      await tx.refundOperationEvent.create({ data: { operationId: operation.id, status: "RETRY", code: "ADMIN_RETRY" } });
      await tx.systemAuditLog.create({ data: { adminId, action: "ORDER_ISSUE_REFUND_RETRY", target: issueId, changes: { operationId: operation.id, reason } } });
      return operationPublique(reprise);
    });
  },
  async apercu(issueId: string) {
    const dossier = await contexte(db, issueId);
    try { return { ...preparer(dossier), currency: "eur" }; }
    catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 409) throw err;
      return { available: false, operation: null, items: [], remainingCents: 0, currency: "eur", explanation: err.message };
    }
  },
  async demander(issueId: string, adminId: string, demande: Demande) {
    return db.$transaction(async (tx) => {
      const initial = await contexte(tx, issueId);
      // Même verrou que les refus, réponses au dossier et webhooks financiers.
      await tx.order.updateMany({ where: { id: initial.orderId }, data: { updatedAt: new Date() } });
      const dossier = await contexte(tx, issueId);
      const paiement = dossier.order.payments[0];
      const existante = paiement?.refundOperations.find((o) => o.supportIssueId === issueId);
      if (existante) {
        const kind = demande.mode === "ITEMS" ? "ISSUE_ITEMS" : "ISSUE_BALANCE";
        const items = [...demande.items].sort((a, b) => a.lineId.localeCompare(b.lineId));
        const connus = itemsEnregistres.parse(existante.items).map(({ lineId, quantity }) => ({ lineId, quantity }));
        if (existante.kind !== kind || existante.amountCents !== demande.expectedAmountCents || existante.reason !== demande.reason || JSON.stringify(connus) !== JSON.stringify(items)) throw conflit("Une autre décision de remboursement existe déjà pour ce dossier.", "REFUND_ALREADY_REQUESTED");
        return operationPublique(existante);
      }
      const calcul = calculer(dossier, demande);
      if (calcul.amountCents !== demande.expectedAmountCents) throw conflit("Le montant a changé. Actualisez et vérifiez la nouvelle proposition.", "REFUND_QUOTE_CHANGED");
      const operation = await tx.refundOperation.create({ data: {
        id: randomUUID(), paymentId: paiement.id, paymentIntentId: paiement.stripePaymentIntentId!,
        supportIssueId: issueId, ...calcul, refundedBeforeCents: cents(paiement.refundedAmount ?? 0),
        currency: paiement.currency.toLowerCase(), reason: demande.reason, idempotencyKey: `incident-remboursement-${issueId}`,
      } });
      await tx.refundOperationEvent.create({ data: { operationId: operation.id, status: "REQUESTED" } });
      await tx.systemAuditLog.create({ data: { adminId, action: "ORDER_ISSUE_REFUND_REQUESTED", target: issueId,
        changes: { orderId: dossier.orderId, operationId: operation.id, ...calcul } } });
      return operationPublique(operation);
    });
  },
};
