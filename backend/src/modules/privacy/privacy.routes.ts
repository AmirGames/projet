import { Router } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { AuthService } from "../auth/auth.service";
import { limiterCadence } from "../../middleware/throttle";
import { collectExport, exportSummary, exportZip } from "./export.service";
import { recordAudit } from "./audit";
import { requestErasure } from "./erasure.service";
import { actorHash } from "./audit";
import { HOLD_MODELS } from "./legal-holds";

const router = Router();
router.use(authMiddleware);
router.use(limiterCadence({ max: 5, fenetreMs: 3600000, cle: (req) => `privacy|${req.userId}`, message: "Trop de demandes : réessayez dans une heure" }));
async function reauthenticate(userId: string, password: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, status: true } });
  if (!user || user.status !== "ACTIVE" || !(await AuthService.comparePassword(password, user.passwordHash))) throw new ApiError(403, "Mot de passe incorrect ou compte indisponible", "REAUTHENTICATION_REQUIRED");
}
router.post("/export", async (req, res, next) => {
  try {
    const input = z.object({ password: z.string().min(1).max(200), format: z.enum(["json", "zip", "pdf"]).default("zip") }).strict().parse(req.body);
    await reauthenticate(req.userId!, input.password);
    await recordAudit(req.userId!, "PERSONAL_DATA_EXPORT", req.userId!, "ATTEMPT");
    const data = await collectExport(req.userId!);
    const content = input.format === "json" ? Buffer.from(JSON.stringify(data, null, 2)) : input.format === "pdf" ? exportSummary(data) : await exportZip(data, { userId: req.userId!, compte: req.compte });
    await recordAudit(req.userId!, "PERSONAL_DATA_EXPORT", req.userId!, "SUCCESS");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", input.format === "json" ? "application/json" : input.format === "pdf" ? "application/pdf" : "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="zupone-donnees.${input.format}"`);
    return res.send(content);
  } catch (error) { return next(error); }
});
router.delete("/account", async (req, res, next) => {
  try {
    const input = z.object({ password: z.string().min(1).max(200) }).strict().parse(req.body);
    await reauthenticate(req.userId!, input.password);
    const result = await requestErasure(req.userId!);
    res.setHeader("Cache-Control", "no-store");
    return res.status(result.status === "COMPLETED" ? 200 : 202).json({ success: true, data: result, message: result.status === "COMPLETED" ? "Vos données personnelles sont effacées. Les pièces comptables légalement obligatoires restent archivées avec un accès limité." : "Votre accès est révoqué. L'effacement est en cours ; les coordonnées nécessaires au dernier versement sont conservées jusqu'à son règlement." });
  } catch (error) { return next(error); }
});
router.post("/legal-holds", async (req, res, next) => {
  try {
    if (!req.compte?.isSuperOwner) throw new ApiError(403, "Accès réservé au superowner", "FORBIDDEN");
    const input = z.object({ password: z.string().min(1).max(200), model: z.enum(HOLD_MODELS), recordId: z.string().min(1).max(100), reason: z.enum(["LITIGATION", "LEGAL_OBLIGATION", "SECURITY_INCIDENT"]), days: z.number().int().min(1).max(365) }).strict().parse(req.body);
    await reauthenticate(req.userId!, input.password);
    const expiresAt = new Date(Date.now() + input.days * 86400000);
    await recordAudit(req.userId!, "LEGAL_HOLD_CREATE", `${input.model}:${input.recordId}`, "ATTEMPT");
    const data = await db.privacyLegalHold.upsert({ where: { model_recordId: { model: input.model, recordId: input.recordId } }, create: { model: input.model, recordId: input.recordId, reason: input.reason, expiresAt, createdBy: actorHash(req.userId!) }, update: { reason: input.reason, expiresAt, createdBy: actorHash(req.userId!) } });
    await recordAudit(req.userId!, "LEGAL_HOLD_CREATE", data.id, "SUCCESS");
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
});
export default router;
