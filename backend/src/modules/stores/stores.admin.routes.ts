import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { StoreSupportService, libelleDuChamp } from "./store-support.service";
import { isSuperOwner } from "../superowner/shared";

const router = Router();

/**
 * La liste des boutiques était un cul-de-sac : des noms et des compteurs, sans
 * pouvoir ouvrir une fiche ni corriger quoi que ce soit.
 *
 * La plateforme corrige une liste courte et assumée — adresse, coordonnées,
 * adresse publique, téléphone, e-mail. Le catalogue, les prix et les horaires
 * restent au commerçant : c'est lui qui répond de ce que paie un client.
 *
 * Ces routes vivent ici, et non sous /api/stores, parce que le cloisonnement y
 * refuse — à raison — un compte qui n'appartient pas à l'organisation.
 */

// GET /superowner/stores/:storeId - La fiche d'une boutique
router.get("/stores/:storeId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, store: await StoreSupportService.fiche(req.params.storeId as string) });
  } catch (err) {
    next(err);
  }
});

const correctionSchema = z
  .object({
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    latitude: z.union([z.number(), z.string()]).optional().nullable(),
    longitude: z.union([z.number(), z.string()]).optional().nullable(),
    slug: z.string().optional(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
  })
  // Les champs inconnus ne sont pas retirés en silence : le service les refuse
  // en nommant celui qui appartient au commerçant.
  .passthrough();

// PATCH /superowner/stores/:storeId - Corriger les champs de support
router.patch("/stores/:storeId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = correctionSchema.parse(req.body);

    if (Object.keys(corps).length === 0) {
      throw new ApiError(400, "Aucun champ à corriger", "NOTHING_TO_CHANGE");
    }

    const { boutique, changements, situeeAutomatiquement } = await StoreSupportService.corriger(
      req.params.storeId as string,
      corps,
      req.userId as string
    );

    // Le journal garde l'avant et l'après : une correction de la plateforme doit
    // pouvoir se retrouver et s'expliquer.
    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "CORRECT_STORE",
        target: boutique.id,
        changes: changements,
      },
    });

    res.json({
      success: true,
      message: `${Object.keys(changements).map(libelleDuChamp).join(", ")} corrigé${
        Object.keys(changements).length > 1 ? "s" : ""
      }${situeeAutomatiquement ? ", et la boutique a été située" : ""}`,
      store: boutique,
      changements,
      situeeAutomatiquement,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /superowner/stores/:storeId/ouverture - Ouvrir ou fermer un commerce
 *
 * Le commerçant a ce bouton dans son espace ; la plateforme n'avait que le tout
 * ou rien de la suspension du compte, qui est autre chose.
 */
router.post(
  "/stores/:storeId/ouverture",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ ouvert: z.boolean(), motif: z.string().max(300).optional() });
      const body = schema.parse(req.body);

      const { boutique, ouvert, motif } = await StoreSupportService.basculerLOuverture(
        req.params.storeId as string,
        body.ouvert,
        body.motif
      );

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: ouvert ? "OPEN_STORE" : "CLOSE_STORE",
          target: boutique.id,
          changes: { isOpen: ouvert, motif },
        },
      });

      res.json({
        success: true,
        message: ouvert ? "Boutique rouverte" : "Boutique fermée",
        store: boutique,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
