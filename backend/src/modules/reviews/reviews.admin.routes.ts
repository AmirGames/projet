import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { ReviewModerationService } from "./review-moderation.service";
import { isSuperOwner } from "../superowner/shared";

const router = Router();

// GET /superowner/review-reports?etat=EN_ATTENTE|TRAITES - Les avis signalés
router.get("/review-reports", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const etat = req.query.etat === "TRAITES" ? "TRAITES" : "EN_ATTENTE";
    const skip = parseInt((req.query.skip as string) || "0") || 0;
    const take = Math.min(parseInt((req.query.take as string) || "50") || 50, 100);

    res.json(await ReviewModerationService.lister(etat, skip, take));
  } catch (err) {
    next(err);
  }
});

// POST /superowner/review-reports/:reportId/decision - Conserver ou retirer l'avis
router.post(
  "/review-reports/:reportId/decision",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          decision: z.enum(["KEPT", "REMOVED"]),
          note: z.string().max(1000).optional(),
        })
        .parse(req.body);

      const signalement = await ReviewModerationService.decider(
        req.params.reportId as string,
        body.decision,
        body.note,
        req.userId as string
      );

      res.json({ success: true, signalement });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
