import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { SecurityEventService } from "../auth/security-event.service";
import { paymentService } from "./payment.service";
import { userIdRequis } from "../auth/utilisateur-requis";
import { RefundService } from "./refund.service";
import { isSuperOwner } from "../superowner/shared";

const router = Router();

// POST /superowner/orders/:id/refund - Rembourser une commande annulée par le support
//
// Le refus par le commerçant rembourse de lui-même. Ce qui reste passe par le
// support : une commande qu'un livreur a déjà prise, un litige après la
// remise. Le remboursement est total ; Stripe ne le refait pas s'il est rejoué.
router.post("/orders/:id/refund", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { raison } = z.object({ raison: z.string().trim().min(3).max(300) }).parse(req.body);
    const orderId = req.params.id as string;

    const commande = await db.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } });
    if (!commande) throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    if (commande.paymentStatus === "REFUNDED") {
      throw new ApiError(409, "Cette commande est déjà remboursée.", "ORDER_ALREADY_REFUNDED");
    }
    if (commande.paymentStatus !== "SUCCEEDED") {
      throw new ApiError(400, "Cette commande n'a pas été payée en ligne.", "ORDER_NOT_PAID");
    }

    const remboursement = await paymentService.rembourserCommande(orderId, raison, userIdRequis(req));

    SecurityEventService.record({
      action: remboursement?.status === "succeeded" ? "ORDER_REFUNDED" : "REFUND_REQUESTED",
      actor: req.actorEmail || "inconnu",
      target: orderId,
      severity: "MEDIUM",
      details: `Demande de remboursement de ${(remboursement?.amount ?? 0) / 100} € : ${raison}`,
    });

    res.json({
      success: true,
      refundId: remboursement?.id,
      operationId: remboursement?.operationId,
      operationStatus: remboursement?.operationStatus,
      amount: (remboursement?.amount ?? 0) / 100,
      status: remboursement?.status,
    });
  } catch (err) {
    next(err);
  }
});

// Préfixe /orders : permission d'équipe « billing » existante, pas un rôle inventé.
router.get("/orders/refunds/review", authMiddleware, isSuperOwner, async (req, res, next) => {
  try {
    const { cursor, limit } = z.object({ cursor: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const refunds = await RefundService.aExaminer(cursor, limit);
    res.json({ success: true, refunds, nextCursor: refunds.length === limit ? refunds.at(-1)?.id : null });
  } catch (err) { next(err); }
});

router.post("/orders/:id/refund/retry", authMiddleware, isSuperOwner, async (req, res, next) => {
  try {
    const { raison } = z.object({ raison: z.string().trim().min(3).max(300) }).parse(req.body);
    const operation = await RefundService.reprendre(req.params.id as string, raison, userIdRequis(req));
    res.status(202).json({ success: true, operationId: operation.id, operationStatus: operation.status });
  } catch (err) { next(err); }
});

export default router;
