import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { userIdRequis } from "../auth/utilisateur-requis";
import { MerchantClosureService } from "../merchants/merchant-closure.service";
import { logger } from "../../config/logger";
import { getQueryString, isSystemAdmin } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";
import { journaliser } from "../superowner/shared";
import { AdminMerchantsService } from "./admin-merchants.service";

const router = Router();

// GET /admin/merchants - List all merchants
router.get("/merchants", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 10000);
    const offset = decalage(req.query.offset);
    const status = getQueryString(req.query.status, "");

    res.json(await AdminMerchantsService.lister({ limit, offset, status }));
  } catch (err) {
    next(err);
  }
});

// GET /admin/merchants/:orgId - Get merchant details
router.get("/merchants/:orgId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;

    res.json(await AdminMerchantsService.detail(orgId));
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/merchants/:orgId - Update merchant tier
// Le statut passe obligatoirement par /suspend, /unsuspend et /close : eux seuls
// créent le backup, la raison et l'échéance de suppression.
router.patch("/merchants/:orgId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      tier: z.enum(["FREE", "PREMIUM", "PRO"]).optional(),
    });

    if (req.body?.status !== undefined) {
      throw new ApiError(
        400,
        "Le statut se change via /suspend, /unsuspend, /close ou /restore-from-backup",
        "USE_STATUS_ENDPOINTS"
      );
    }

    const body = schema.parse(req.body);
    userIdRequis(req); // identité exigée avant d'agir (le journal la relit)

    const merchant = await AdminMerchantsService.changerFormule(orgId, body);

    await journaliser(req, "UPDATE_MERCHANT", orgId, body);

    res.json(merchant);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/suspend - Suspend merchant account
router.post("/merchants/:orgId/suspend", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      reason: z.string().min(1, "La raison est requise"),
    });

    const body = schema.parse(req.body);
    const adminId = userIdRequis(req);

    const updated = await MerchantClosureService.suspend(orgId, body.reason);

    await journaliser(req, "SUSPEND_MERCHANT", orgId, { reason: body.reason });

    logger.info("Merchant suspended by admin", { orgId, adminId, reason: body.reason });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/unsuspend - Unsuspend merchant account
router.post("/merchants/:orgId/unsuspend", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const adminId = userIdRequis(req);

    const updated = await MerchantClosureService.unsuspend(orgId);

    await journaliser(req, "UNSUSPEND_MERCHANT", orgId);

    logger.info("Merchant unsuspended by admin", { orgId, adminId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/close - Close merchant account
router.post("/merchants/:orgId/close", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      reason: z.string().min(1, "La raison est requise"),
    });

    const body = schema.parse(req.body);
    const adminId = userIdRequis(req);

    const result = await MerchantClosureService.close(orgId, body.reason);

    await journaliser(req, "CLOSE_MERCHANT", orgId, {
      reason: body.reason,
      archiveId: result.archive.id,
    });

    logger.info("Merchant closed by admin", { orgId, adminId, reason: body.reason, archiveId: result.archive.id });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/restore-from-backup - Restore merchant from backup
router.post("/merchants/:orgId/restore-from-backup", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const adminId = userIdRequis(req);

    const updated = await MerchantClosureService.restoreFromBackup(orgId, adminId);

    await journaliser(req, "RESTORE_MERCHANT", orgId);

    logger.info("Merchant restored from backup by admin", { orgId, adminId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /admin/tickets - List all tickets
// GET /admin/stores - Toutes les boutiques de la plateforme
router.get("/stores", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recherche = (req.query.search as string) || "";
    const limit = limiteBornee(req.query.limit, 50, 200);
    const offset = decalage(req.query.offset);

    res.json(await AdminMerchantsService.boutiques({ recherche, limit, offset }));
  } catch (err) {
    next(err);
  }
});

export default router;
