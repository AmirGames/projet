import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { OrderManagementService } from "../services/order-management.service";
import { OrderAcceptanceService, MOTIFS_DU_COMMERCANT } from "../services/order-acceptance.service";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "PREPARING", "REJECTED", "READY", "COMPLETED"]),
});

const acceptSchema = z.object({
  preparationMinutes: z.number().int().min(1).max(240),
});

const rejectSchema = z.object({
  motif: z.enum(MOTIFS_DU_COMMERCANT),
  note: z.string().max(300).optional(),
});

const addNoteSchema = z.object({
  notes: z.string().max(1000),
});

// GET /orders/:storeId - List all orders
router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;
    const status = req.query.status as string | undefined;

    logger.info("Fetching orders", { storeId, skip, take, status });

    const result = await OrderManagementService.getOrders(storeId, { skip, take, status });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /orders/:storeId/today - Get today's orders
 *
 * Déclarée avant `/:storeId/:orderId`, sinon Express lit « today » comme un
 * identifiant de commande et la route ne répond jamais.
 */
router.get("/:storeId/today", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Fetching today's orders", { storeId });

    const orders = await OrderManagementService.getTodayOrders(storeId);

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// GET /orders/:storeId/:orderId - Get single order
router.get("/:storeId/:orderId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const orderId = req.params.orderId as string;

    logger.info("Fetching order", { storeId, orderId });

    const order = await OrderManagementService.getOrder(storeId, orderId);

    res.json(order);
  } catch (err) {
    next(err);
  }
});

// PATCH /orders/:storeId/:orderId/status - Update order status
router.patch("/:storeId/:orderId/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const orderId = req.params.orderId as string;
    const body = updateStatusSchema.parse(req.body);

    logger.info("Updating order status", { storeId, orderId, status: body.status });

    const order = await OrderManagementService.updateOrderStatus(storeId, orderId, body.status);

    res.json({
      message: "Order status updated",
      order,
    });
  } catch (err) {
    next(err);
  }
});

// POST /orders/:storeId/:orderId/accept - Accepter, avec le temps de préparation
router.post("/:storeId/:orderId/accept", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const orderId = req.params.orderId as string;
    const body = acceptSchema.parse(req.body);

    logger.info("Accepting order", { storeId, orderId, preparationMinutes: body.preparationMinutes });

    const order = await OrderAcceptanceService.accepter(storeId, orderId, body.preparationMinutes);

    res.json({ message: "Commande acceptée", order });
  } catch (err) {
    next(err);
  }
});

// POST /orders/:storeId/:orderId/reject - Refuser, avec un motif
router.post("/:storeId/:orderId/reject", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const orderId = req.params.orderId as string;
    const body = rejectSchema.parse(req.body);

    logger.info("Rejecting order", { storeId, orderId, motif: body.motif });

    const order = await OrderAcceptanceService.refuser(storeId, orderId, body.motif, body.note);

    res.json({ message: "Commande refusée", order });
  } catch (err) {
    next(err);
  }
});

// POST /orders/:storeId/:orderId/notes - Add notes to order
router.post("/:storeId/:orderId/notes", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const orderId = req.params.orderId as string;
    const body = addNoteSchema.parse(req.body);

    logger.info("Adding notes to order", { storeId, orderId });

    const order = await OrderManagementService.addOrderNote(storeId, orderId, body.notes);

    res.json({
      message: "Notes added to order",
      order,
    });
  } catch (err) {
    next(err);
  }
});

// GET /orders/:storeId/stats - Get order statistics
router.get("/:storeId/stats/overview", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const days = req.query.days ? parseInt(req.query.days as string) : 30;

    logger.info("Fetching order stats", { storeId, days });

    const stats = await OrderManagementService.getOrderStats(storeId, days);

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
