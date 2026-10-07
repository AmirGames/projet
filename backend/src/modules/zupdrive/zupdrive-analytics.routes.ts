import { Router } from "express";
import { z } from "zod";
import { adminAuthSection, validateRequest } from "./zupdrive-garde";
import { ZupDriveAnalyticsService } from "./zupdrive-analytics.service";

const router = Router();

/** Statistiques : section « courses-drive » de la plateforme DRIVE (lecture seule). */
const adminAuth = adminAuthSection("courses-drive");

/** Une période ne dépasse pas un an : les agrégats parcourent les courses de la période. */
const UN_AN_MS = 366 * 24 * 60 * 60 * 1000;
const periodeValide = (debut: string, fin: string) => {
  const ecart = new Date(fin).getTime() - new Date(debut).getTime();
  return ecart >= 0 && ecart <= UN_AN_MS;
};
const MESSAGE_PERIODE = { message: "La période doit finir après son début et durer au plus un an", path: ["endDate"] };

const periodeSchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  })
  .refine((p) => periodeValide(p.startDate, p.endDate), MESSAGE_PERIODE);
type Periode = z.infer<typeof periodeSchema>;

const performanceSchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    limit: z.coerce.number().min(1).max(100).default(50),
  })
  .refine((p) => periodeValide(p.startDate, p.endDate), MESSAGE_PERIODE);

const comparaisonSchema = z
  .object({
    period1Start: z.string().datetime(),
    period1End: z.string().datetime(),
    period2Start: z.string().datetime(),
    period2End: z.string().datetime(),
  })
  .refine((p) => periodeValide(p.period1Start, p.period1End) && periodeValide(p.period2Start, p.period2End), {
    message: "Chaque période doit finir après son début et durer au plus un an",
    path: ["period1End"],
  });

/**
 * GET /api/zupdrive/analytics/period
 * Rapport analytique pour une période donnée
 */
router.get(
  "/period",
  ...adminAuth,
  validateRequest({ query: periodeSchema }),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as unknown as Periode;

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
  validateRequest({ query: performanceSchema }),
  async (req, res, next) => {
    try {
      const { startDate, endDate, limit } = req.query as unknown as z.infer<typeof performanceSchema>;

      const performance = await ZupDriveAnalyticsService.getDriverPerformance(
        new Date(startDate),
        new Date(endDate),
        limit
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
  validateRequest({ query: periodeSchema }),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as unknown as Periode;

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
  validateRequest({ query: periodeSchema }),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as unknown as Periode;

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
  validateRequest({ query: comparaisonSchema }),
  async (req, res, next) => {
    try {
      const { period1Start, period1End, period2Start, period2End } = req.query as unknown as z.infer<typeof comparaisonSchema>;

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
router.get("/dashboard", ...adminAuth, async (_req, res, next) => {
  try {
    const summary = await ZupDriveAnalyticsService.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
