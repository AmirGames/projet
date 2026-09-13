import { Router, Request, Response, NextFunction } from "express";
import { InvoiceService } from "../services/invoice.service";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

// GET /invoices/:storeId - List all invoices
router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;

    logger.info("Fetching invoices", { storeId, skip, take });

    const result = await InvoiceService.getInvoices(storeId, { skip, take });

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
