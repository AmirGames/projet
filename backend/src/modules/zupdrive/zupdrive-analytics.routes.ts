import { Router } from "express";
import { z } from "zod";
import { adminAuth, validateRequest } from "./zupdrive-garde";
import { ZupDriveAnalyticsService } from "./zupdrive-analytics.service";

const router = Router();

/**
 * GET /api/zupdrive/analytics/period
 * Rapport analytique pour une période donnée
 */
router.get(
  "/period",
  ...adminAuth,
  validateRequest({
    query: z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as any;

      const analytics = await ZupDriveAnalyticsService.getPeriodAnalytics(
        new Date(startDate),
        new Date(endDate)
      );

      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/analytics/drivers
 * Performance des drivers pour une période
 */
router.get(
  "/drivers",
  ...adminAuth,
  validateRequest({
    query: z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      limit: z.coerce.number().min(1).max(100).optional().default("50"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { startDate, endDate, limit } = req.query as any;

      const performance = await ZupDriveAnalyticsService.getDriverPerformance(
        new Date(startDate),
        new Date(endDate),
        parseInt(limit)
      );

      res.json(performance);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/analytics/regions
 * Analytics par région
 */
router.get(
  "/regions",
  ...adminAuth,
  validateRequest({
    query: z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as any;

      const regionalAnalytics = await ZupDriveAnalyticsService.getRegionalAnalytics(
        new Date(startDate),
        new Date(endDate)
      );

      res.json(regionalAnalytics);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/analytics/payments
 * Rapport sur les paiements
 */
router.get(
  "/payments",
  ...adminAuth,
  validateRequest({
    query: z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as any;

      const paymentAnalytics = await ZupDriveAnalyticsService.getPaymentAnalytics(
        new Date(startDate),
        new Date(endDate)
      );

      res.json(paymentAnalytics);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/analytics/compare
 * Comparaison de deux périodes
 */
router.get(
  "/compare",
  ...adminAuth,
  validateRequest({
    query: z.object({
      period1Start: z.string().datetime(),
      period1End: z.string().datetime(),
      period2Start: z.string().datetime(),
      period2End: z.string().datetime(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { period1Start, period1End, period2Start, period2End } = req.query as any;

      const comparison = await ZupDriveAnalyticsService.comparePeriods(
        new Date(period1Start),
        new Date(period1End),
        new Date(period2Start),
        new Date(period2End)
      );

      res.json(comparison);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/analytics/dashboard
 * Summary dashboard pour admins
 */
router.get("/dashboard", adminAuth, async (req, res, next) => {
  try {
    const summary = await ZupDriveAnalyticsService.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
