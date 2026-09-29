import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../../middleware/auth";
import { MerchantPayoutService } from "./merchant-payout.service";

const router = Router();

/**
 * Les relevés de reversement, vus du commerçant : ce que la plateforme lui a
 * versé chaque semaine, ligne par ligne, avec l'explication des codes.
 */

async function verifierAppartenance(orgId: string, req: Request) {
  const appartenance = await db.membership.findFirst({
    where: { userId: req.userId, orgId },
    select: { id: true },
  });

  if (!appartenance) {
    throw new ApiError(403, "Accès refusé à ce commerçant", "FORBIDDEN");
  }
}

// GET /merchant-payouts?orgId= - Ses relevés
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.query.orgId as string;
    if (!orgId) throw new ApiError(400, "Paramètre orgId requis", "MISSING_PARAM");
    await verifierAppartenance(orgId, req);

    res.json({ success: true, data: await MerchantPayoutService.lister({ orgId, take: 60 }) });
  } catch (err) {
    next(err);
  }
});

// GET /merchant-payouts/:id - Un relevé, ses lignes et leur légende
router.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const releve = await MerchantPayoutService.detail(req.params.id as string);
    await verifierAppartenance(releve.orgId, req);

    res.json({ success: true, data: releve });
  } catch (err) {
    next(err);
  }
});

export default router;
