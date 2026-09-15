import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../services/db";
import { DeliveryZoneService } from "../services/delivery-zone.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

/**
 * Les zones de livraison d'une boutique : des anneaux avec leurs frais et leur
 * montant minimum de commande.
 */

/** La boutique appartient-elle bien à l'organisation de l'appelant. */
async function exigerLaBoutique(storeId: string, req: Request) {
  const boutique = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, orgId: true, deletedAt: true },
  });

  if (!boutique || boutique.deletedAt) {
    throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
  }

  const appartenance = await db.membership.findFirst({
    where: { userId: req.userId, orgId: boutique.orgId },
    select: { id: true },
  });

  if (!appartenance) {
    throw new ApiError(403, "Cette boutique n'est pas la vôtre", "FORBIDDEN");
  }

  return boutique;
}

/** Idem, en partant de la zone. */
async function exigerLaZone(id: string, req: Request) {
  const zone = await DeliveryZoneService.getById(id);
  await exigerLaBoutique(zone.storeId, req);
  return zone;
}

const schemaZone = z.object({
  storeId: z.string().min(1),
  name: z.string().min(2, "Nom de zone : deux caractères minimum").max(50),
  // Le rayon fait la zone : sans lui, aucune adresse ne peut être rattachée.
  radiusKm: z.number().positive("Le rayon doit être supérieur à zéro").max(200),
  baseFee: z.number().nonnegative("Les frais ne peuvent pas être négatifs"),
  minOrder: z.number().nonnegative("Le minimum ne peut pas être négatif").optional(),
  deliveryMinutes: z.number().int().positive().max(600).nullable().optional(),
  isActive: z.boolean().optional(),
});

// POST /delivery-zones - Créer une zone
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schemaZone.parse(req.body);
    await exigerLaBoutique(body.storeId, req);

    const zone = await DeliveryZoneService.create({ ...body, minOrder: body.minOrder ?? 0 });

    logger.info("Zone de livraison créée", { name: body.name, storeId: body.storeId });

    res.status(201).json({ message: `Zone « ${zone.name} » créée`, zone });
  } catch (err) {
    next(err);
  }
});

// GET /delivery-zones/:id - Une zone
router.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const zone = await exigerLaZone(req.params.id as string, req);
    res.json(zone);
  } catch (err) {
    next(err);
  }
});

// GET /delivery-zones?storeId= ou ?orgId= - Les zones d'une boutique
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string;
    const orgId = req.query.orgId as string;

    if (orgId) {
      const appartenance = await db.membership.findFirst({
        where: { userId: req.userId, orgId },
        select: { id: true },
      });

      if (!appartenance) {
        throw new ApiError(403, "Ce commerçant n'est pas le vôtre", "FORBIDDEN");
      }

      const zones = await DeliveryZoneService.getByOrgId(orgId);
      return res.json({ zones, total: zones.length });
    }

    if (!storeId) {
      throw new ApiError(400, "Paramètre « storeId » ou « orgId » requis", "MISSING_PARAM");
    }

    await exigerLaBoutique(storeId, req);
    const zones = await DeliveryZoneService.getByStoreId(storeId);

    return res.json({ zones, total: zones.length });
  } catch (err) {
    return next(err);
  }
});

// PUT /delivery-zones/:id - Modifier une zone
router.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await exigerLaZone(id, req);

    const body = schemaZone.omit({ storeId: true }).partial().parse(req.body);
    const zone = await DeliveryZoneService.update(id, body);

    logger.info("Zone de livraison modifiée", { id });

    res.json({ message: "Zone enregistrée", zone });
  } catch (err) {
    next(err);
  }
});

// DELETE /delivery-zones/:id - Supprimer une zone
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const zone = await exigerLaZone(id, req);

    await DeliveryZoneService.delete(id);

    logger.info("Zone de livraison supprimée", { id });

    res.json({ message: `Zone « ${zone.name} » supprimée` });
  } catch (err) {
    next(err);
  }
});

export default router;
