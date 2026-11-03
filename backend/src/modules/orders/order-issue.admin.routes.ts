import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { isSuperOwner } from "../superowner/shared";
import { userIdRequis } from "../auth/utilisateur-requis";
import { OrderIssueService } from "./order-issue.service";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();
router.get('/support-tickets/order-issues', authMiddleware, isSuperOwner, async (req, res, next) => {
  try {
    const status = z.enum(['OPEN', 'RESOLVED', 'REJECTED']).optional().parse(req.query.status);
    res.set('Cache-Control', 'no-store');
    res.json(await OrderIssueService.lister(status, decalage(req.query.offset), limiteBornee(req.query.limit, 20, 100)));
  } catch (err) { next(err); }
});
router.put('/support-tickets/order-issues/:id/response', authMiddleware, isSuperOwner, async (req, res, next) => {
  try {
    const body = z.object({ status: z.enum(['RESOLVED', 'REJECTED']), response: z.string().trim().min(5).max(2000) }).strict().parse(req.body);
    res.json({ data: await OrderIssueService.repondre(String(req.params.id), userIdRequis(req), body.status, body.response) });
  } catch (err) { next(err); }
});
export default router;
