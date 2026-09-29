import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "./auth.middleware";
import { ApiKeyService } from "./api-key.service";
import { SecurityEventService } from "./security-event.service";
import { isSuperOwner } from "../superowner/shared";

const router = Router();

// GET /superowner/api-keys - Clés existantes (valeur masquée)
router.get("/api-keys", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    res.json(await ApiKeyService.list(limit, offset));
  } catch (err) {
    next(err);
  }
});

// POST /superowner/api-keys - Générer une clé (visible une seule fois)
router.post("/api-keys", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ name: z.string().min(1).max(100) });
    const body = schema.parse(req.body);

    const cle = await ApiKeyService.create(body.name, req.userId);

    SecurityEventService.record({
      action: "API_KEY_CREATED",
      actor: (req as any).actorEmail || "inconnu",
      target: cle.id,
      severity: "MEDIUM",
      details: `Clé « ${body.name} » générée`,
    });

    res.status(201).json({ success: true, key: cle });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/api-keys/:keyId/revoke - Révoquer une clé
router.post("/api-keys/:keyId/revoke", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyId = req.params.keyId as string;
    const cle = await ApiKeyService.revoke(keyId);

    SecurityEventService.record({
      action: "API_KEY_REVOKED",
      actor: (req as any).actorEmail || "inconnu",
      target: keyId,
      severity: "HIGH",
      details: `Clé « ${cle.name} » révoquée`,
    });

    res.json({ success: true, message: "Clé révoquée" });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/security-audit - Journal des événements de sécurité
router.get("/security-audit", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resultat = await SecurityEventService.list({
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
      severity: (req.query.severity as string) || undefined,
    });

    res.json(resultat);
  } catch (err) {
    next(err);
  }
});

export default router;
