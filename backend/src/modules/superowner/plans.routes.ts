import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { PlanService } from "../plans/plan.service";
import { isSuperOwner, journaliser } from "./shared";

const router = Router();

// ---- La grille des formules ----
// Tarifs, quotas et arguments de vente étaient écrits dans le code : changer
// un prix demandait une mise en production.

// GET /superowner/plans - La grille complète
router.get("/plans", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const grille = await PlanService.grille();

    // Combien de commerçants sur chaque formule : baisser un quota sans le
    // savoir se paie en tickets de support.
    const repartition = await db.organization.groupBy({
      by: ["tier"],
      _count: { _all: true },
    });

    res.json({
      success: true,
      data: grille.map((formule) => ({
        ...formule,
        abonnes: repartition.find((ligne) => ligne.tier === formule.code)?._count._all ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/plans/:code - Régler une formule
router.patch("/plans/:code", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schemaCode = z.enum(["FREE", "PREMIUM", "PRO"]);
    const code = schemaCode.parse((req.params.code as string)?.toUpperCase());

    const schema = z.object({
      libelle: z.string().min(2, "Nom minimum 2 caractères").optional(),
      maxBoutiques: z.number().int().min(1, "Au moins une boutique").optional(),
      prixMensuel: z.number().min(0, "Tarif négatif impossible").optional(),
      commission: z
        .number()
        .min(0, "Commission négative impossible")
        .max(100, "Une commission ne dépasse pas 100 %")
        .optional(),
      commissionLivreursPlateforme: z
        .number()
        .min(0, "Commission négative impossible")
        .max(100, "Une commission ne dépasse pas 100 %")
        .optional(),
      avantages: z.array(z.string().min(1)).max(12, "Douze arguments suffisent").optional(),
      ordre: z.number().int().min(0).optional(),
    });

    const analyse = schema.safeParse(req.body);

    if (!analyse.success) {
      throw new ApiError(
        400,
        analyse.error.issues[0]?.message || "Réglage invalide",
        "INVALID_PLAN"
      );
    }

    const body = analyse.data;
    const formule = await PlanService.enregistrer(code, body);

    await journaliser(req, "PLAN_TIER_UPDATED", code, body);

    res.json({ message: `Formule ${formule.libelle} enregistrée`, data: formule });
  } catch (err) {
    next(err);
  }
});

export default router;
