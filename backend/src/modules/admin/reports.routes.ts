import { Router, Request, Response, NextFunction } from "express";
import { voitLesFinances } from "../auth/permissions-plateforme.service";
import { authMiddleware } from "../auth/auth.middleware";
import { getQueryString, isSystemAdmin } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";
import { AdminReportsService } from "./admin-reports.service";

const router = Router();

// GET /admin/commissions - Get commission history
router.get("/commissions", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 10000);
    const offset = decalage(req.query.offset);
    const period = getQueryString(req.query.period, "");

    res.json(await AdminReportsService.commissions({ period, limit, offset }));
  } catch (err) {
    next(err);
  }
});

// GET /admin/access-logs - Journal des accès (connexions, actions sensibles)
router.get("/access-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 100, 500);
    const offset = decalage(req.query.offset);
    const statut = req.query.status as string | undefined;

    res.json(await AdminReportsService.journalDesAcces({ statut, limit, offset }));
  } catch (err) {
    next(err);
  }
});

// GET /admin/stats - Get system statistics
router.get("/stats", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AdminReportsService.statistiques(() => voitLesFinances(req.compte)));
  } catch (err) {
    next(err);
  }
});

// GET /admin/audit-logs - Get audit logs
router.get("/audit-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 50, 200);
    const offset = decalage(req.query.offset);

    res.json(await AdminReportsService.journalDAudit({ limit, offset }));
  } catch (err) {
    next(err);
  }
});

export default router;
