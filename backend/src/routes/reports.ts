import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ReportsService } from "../services/reports.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

const router = Router();

// GET /reports/sales - Get sales report (protected)
router.get("/sales", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string;
    const orgId = req.query.orgId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const status = req.query.status as string;
    const paymentStatus = req.query.paymentStatus as string;

    if (!storeId && !orgId) {
      throw new ApiError(400, "Parameter 'storeId' or 'orgId' required", "MISSING_PARAM");
    }

    logger.info("Generating sales report", { storeId, orgId });

    const report = await ReportsService.getSalesReport({
      storeId,
      orgId,
      startDate,
      endDate,
      status,
      paymentStatus,
    });

    res.json(report);
  } catch (err) {
    next(err);
  }
});

// GET /reports/revenue - Get revenue by date (protected)
router.get("/revenue", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string;
    const orgId = req.query.orgId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    if (!storeId && !orgId) {
      throw new ApiError(400, "Parameter 'storeId' or 'orgId' required", "MISSING_PARAM");
    }

    logger.info("Generating revenue report", { storeId, orgId });

    const revenueData = await ReportsService.getRevenueByDate({
      storeId,
      orgId,
      startDate,
      endDate,
    });

    res.json({ data: revenueData });
  } catch (err) {
    next(err);
  }
});

// GET /reports/products/:storeId - Get product performance (protected)
router.get("/products/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Generating product performance report", { storeId });

    const products = await ReportsService.getProductPerformance(storeId);

    res.json({ products });
  } catch (err) {
    next(err);
  }
});

// GET /reports/customers/:storeId - Get customer analytics (protected)
router.get("/customers/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Generating customer analytics report", { storeId });

    const customers = await ReportsService.getCustomerAnalytics(storeId);

    res.json({ customers });
  } catch (err) {
    next(err);
  }
});

// GET /reports/export/:type - Export report data (protected)
router.get("/export/:type", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type as string;
    const storeId = req.query.storeId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    if (!storeId) {
      throw new ApiError(400, "Parameter 'storeId' required", "MISSING_PARAM");
    }

    logger.info("Exporting report", { type, storeId });

    let data: any[] = [];
    let filename = "";

    if (type === "sales") {
      const report = await ReportsService.getSalesReport({
        storeId,
        startDate,
        endDate,
      });
      data = report.orders.map((o: any) => ({
        ID: o.id,
        Date: new Date(o.createdAt).toISOString().split("T")[0],
        Customer: o.customerName,
        Email: o.customerEmail,
        Total: o.totalAmount,
        Tax: o.taxAmount,
        Status: o.status,
        PaymentStatus: o.paymentStatus,
      }));
      filename = "sales_report.csv";
    } else if (type === "revenue") {
      const revenueData = await ReportsService.getRevenueByDate({
        storeId,
        startDate,
        endDate,
      });
      data = revenueData;
      filename = "revenue_report.csv";
    } else if (type === "products") {
      const products = await ReportsService.getProductPerformance(storeId);
      data = products;
      filename = "products_report.csv";
    } else if (type === "customers") {
      const customers = await ReportsService.getCustomerAnalytics(storeId);
      data = customers;
      filename = "customers_report.csv";
    } else {
      throw new ApiError(400, "Invalid export type", "INVALID_TYPE");
    }

    const csv = ReportsService.exportToCSV(data, filename);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
