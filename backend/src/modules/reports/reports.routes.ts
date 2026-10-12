import { OrderStatus, PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { Router, Request, Response, NextFunction } from "express";
import { ReportsService } from "./reports.service";
import { montantCommercant } from "../delivery/delivery-mode.service";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { logger } from "../../config/logger";

const router = Router();

const parsePeriod = (query: Request["query"], exportRoute = false) => {
  const parseDate = (value: unknown, field: string): Date | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
      throw new ApiError(400, `Paramètre ${field} invalide`, "INVALID_REPORT_DATE");
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || ( /^\d{4}-\d{2}-\d{2}$/.test(value) && parsed.toISOString().slice(0, 10) !== value)) throw new ApiError(400, `Paramètre ${field} invalide`, "INVALID_REPORT_DATE");
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) parsed.setUTCHours(field === "endDate" ? 23 : 0, field === "endDate" ? 59 : 0, field === "endDate" ? 59 : 0, field === "endDate" ? 999 : 0);
    return parsed;
  };
  const endDate = parseDate(query.endDate, "endDate") ?? new Date();
  const startDate = parseDate(query.startDate, "startDate") ?? new Date(endDate.getTime() - (exportRoute ? 30 : 90) * 86_400_000);
  const daysMax = exportRoute ? 31 : 366;
  if (startDate > endDate || endDate.getTime() - startDate.getTime() > daysMax * 86_400_000) {
    throw new ApiError(400, `La période doit être comprise entre 0 et ${daysMax} jours`, "REPORT_PERIOD_OUT_OF_RANGE");
  }
  return { startDate, endDate };
};

const pagination = (query: Request["query"], defaultLimit = 50, maximum = 100) => {
  const number = (value: unknown, fallback: number, name: string) => {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new ApiError(400, `Paramètre ${name} invalide`, "INVALID_PAGINATION");
    return n;
  };
  const limit = number(query.limit, defaultLimit, "limit");
  const offset = number(query.offset, 0, "offset");
  if (limit < 1 || limit > maximum || offset > 100_000) throw new ApiError(400, `Pagination limitée à ${maximum} lignes et un décalage de 100000`, "INVALID_PAGINATION");
  return { limit, offset };
};

// GET /reports/sales - Get sales report (protected)
router.get("/sales", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string;
    const orgId = req.query.orgId as string;
    const { startDate, endDate } = parsePeriod(req.query);
    const page = pagination(req.query);
    const status = req.query.status ? z.enum(OrderStatus).parse(req.query.status) : undefined;
    const paymentStatus = req.query.paymentStatus ? z.enum(PaymentStatus).parse(req.query.paymentStatus) : undefined;

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
      ...page,
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
    const { startDate, endDate } = parsePeriod(req.query);

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

    const products = await ReportsService.getProductPerformance(storeId, { ...parsePeriod(req.query), ...pagination(req.query) });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// GET /reports/customers/:storeId - Get customer analytics (protected)
router.get("/customers/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Generating customer analytics report", { storeId });

    const customers = await ReportsService.getCustomerAnalytics(storeId, { ...parsePeriod(req.query), ...pagination(req.query) });
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

// GET /reports/export/:type - Export report data (protected)
router.get("/export/:type", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type as string;
    const storeId = req.query.storeId as string;
    const { startDate, endDate } = parsePeriod(req.query, true);
    const { offset } = pagination(req.query, 5000, 5000);

    if (!storeId) {
      throw new ApiError(400, "Parameter 'storeId' required", "MISSING_PARAM");
    }

    logger.info("Exporting report", { type, storeId });

    let data: Record<string, unknown>[] = [];
    let filename = "";

    if (type === "sales") {
      const report = await ReportsService.getSalesReport({
        storeId,
        startDate,
        endDate,
        limit: 5000,
        offset,
      });
      data = report.orders.map((o) => ({
        ID: o.id,
        Date: new Date(o.createdAt).toISOString().split("T")[0],
        Customer: o.customerName,
        Email: o.customerEmail,
        Total: montantCommercant(o),
        Tax: o.taxAmount,
        Status: o.status,
        PaymentStatus: o.paymentStatus,
      }));
      if (report.pagination.hasMore) throw new ApiError(413, "Export supérieur à 5000 lignes : réduisez la période", "REPORT_EXPORT_TOO_LARGE");
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
      const products = await ReportsService.getProductPerformance(storeId, { startDate, endDate, limit: 5000, offset });
      data = products.products;
      if (products.pagination.hasMore) throw new ApiError(413, "Export supérieur à 5000 lignes : réduisez la période", "REPORT_EXPORT_TOO_LARGE");
      filename = "products_report.csv";
    } else if (type === "customers") {
      const customers = await ReportsService.getCustomerAnalytics(storeId, { startDate, endDate, limit: 5000, offset });
      data = customers.customers;
      if (customers.pagination.hasMore) throw new ApiError(413, "Export supérieur à 5000 lignes : réduisez la période", "REPORT_EXPORT_TOO_LARGE");
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
