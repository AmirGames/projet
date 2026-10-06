import { Router, Request, Response, NextFunction } from "express";
import { InvoiceService } from "./invoice.service";
import { authMiddleware } from "../auth/auth.middleware";
import { logger } from "../../config/logger";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

// GET /invoices/:storeId - List all invoices
router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = decalage(req.query.skip);
    const take = limiteBornee(req.query.take, 50, 200);

    logger.info("Fetching invoices", { storeId, skip, take });

    const paymentStatus = typeof req.query.status === "string" ? req.query.status : undefined;

    const result = await InvoiceService.getInvoices(storeId, { skip, take, paymentStatus });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /invoices/:storeId/:orderId - Generate invoice for specific order
router.get("/:storeId/:orderId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const orderId = req.params.orderId as string;

    logger.info("Generating invoice", { storeId, orderId });

    const invoice = await InvoiceService.generateInvoice(storeId, orderId);

    res.json(invoice);
  } catch (err) {
    next(err);
  }
});

// GET /invoices/:storeId/stats/revenue - Get revenue statistics
router.get("/:storeId/stats/revenue", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const days = req.query.days ? parseInt(req.query.days as string) : 30;

    logger.info("Fetching revenue stats", { storeId, days });

    const stats = await InvoiceService.getRevenueStats(storeId, days);

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
