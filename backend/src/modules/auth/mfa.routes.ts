import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "./auth.middleware";
import { ApiError } from "../../middleware/errorHandler";
import { limiterCadence } from "../../middleware/throttle";
import { MfaService } from "./mfa.service";

const router = Router();
router.use(authMiddleware, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const limiterMfa = limiterCadence({ nom: "mfa-account", max: 20, fenetreMs: 15 * 60_000, cle: (req) => req.userId! });
router.use((req, res, next) => req.method === "POST" ? limiterMfa(req, res, next) : next());
router.get("/", async (req, res, next) => {
  try { res.json(await MfaService.status(req.userId!, req.user?.sid)); } catch (e) { next(e); }
});
router.post("/:action", async (req, res, next) => {
  try {
    const sid = req.user?.sid;
    if (!sid) throw new ApiError(401, "Reconnectez-vous avant la MFA.", "SESSION_INVALIDE");
    const userId = req.userId!;
    const action = z.enum(["begin", "confirm", "verify", "recover", "revoke"]).parse(req.params.action);
    if (action === "begin") {
      const { password } = z.object({ password: z.string().min(1).max(200) }).strict().parse(req.body);
      res.json(await MfaService.begin(userId, sid, password));
    } else if (action === "revoke") {
      z.object({}).strict().parse(req.body);
      res.json(await MfaService.revoke(userId, sid));
    } else {
      const { code } = z.object({ code: action === "recover" ? z.string().regex(/^[a-f0-9]{32}$/) : z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
      res.json(await MfaService.check(userId, sid, code, action === "confirm" ? "confirm" : action === "recover" ? "recovery" : "totp"));
    }
  } catch (e) { next(e); }
});
export default router;
