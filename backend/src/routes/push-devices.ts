import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { db } from "../services/db";
import { logger } from "../config/logger";

const router = Router();

const jeton = z
  .string()
  .max(200)
  .regex(/^Expo(nent)?PushToken\[.+\]$/, "Jeton Expo Push invalide");

const enregistrementSchema = z.object({
  token: jeton,
  platform: z.enum(["ios", "android"]).optional(),
  app: z.enum(["merchant", "delivery", "customer"]).default("merchant"),
});

// POST /push-devices - Enregistre le téléphone du compte connecté
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId as string;
    const body = enregistrementSchema.parse(req.body);

    // Un téléphone n'a qu'un compte à la fois : s'il change de mains, le
    // jeton passe au nouveau compte et l'ancien cesse d'être prévenu.
    await db.pushDevice.upsert({
      where: { token: body.token },
      create: { token: body.token, userId, platform: body.platform, app: body.app },
      update: { userId, platform: body.platform, app: body.app },
    });

    logger.info("Push device registered", { userId, platform: body.platform, app: body.app });
    res.status(201).json({ message: "Appareil enregistré" });
  } catch (err) {
    next(err);
  }
});

// DELETE /push-devices - Retire le téléphone (déconnexion)
router.delete("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId as string;
    const { token } = z.object({ token: jeton }).parse(req.body);

    await db.pushDevice.deleteMany({ where: { token, userId } });

    res.json({ message: "Appareil retiré" });
  } catch (err) {
    next(err);
  }
});

export default router;
