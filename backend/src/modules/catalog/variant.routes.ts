import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../../middleware/auth";
import { logger } from "../../config/logger";
import { VariantService } from "./variant.service";
import { SupplementService, schemaGroupes } from "./supplement.service";

const router = Router();

/**
 * Les déclinaisons d'un plat, côté commerçant.
 *
 * Le modèle dormait en base : ni route, ni écran. « Pâtes 4 fromages » ne
 * pouvait pas se commander en penne plutôt qu'en spaghetti.
 */

/**
 * Le plat appartient-il bien à l'organisation de l'appelant.
 *
 * Les routes produits ne le vérifient pas : il suffisait d'un storeId pour
 * écrire chez le voisin. On ne reproduit pas l'omission ici.
 */
async function exigerLePlat(productId: string, req: Request) {
  const produit = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, deletedAt: true, store: { select: { orgId: true } } },
  });

  if (!produit || produit.deletedAt) {
    throw new ApiError(404, "Produit introuvable", "PRODUCT_NOT_FOUND");
  }

  const appartenance = await db.membership.findFirst({
    where: { userId: req.userId, orgId: produit.store.orgId },
    select: { id: true },
  });

  if (!appartenance) {
    throw new ApiError(403, "Ce produit n'est pas le vôtre", "FORBIDDEN");
  }

  return produit;
}

/** Idem, en partant de la déclinaison. */
async function exigerLaVariante(variantId: string, req: Request) {
  const variante = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true },
  });

  if (!variante) {
    throw new ApiError(404, "Déclinaison introuvable", "VARIANT_NOT_FOUND");
  }

  await exigerLePlat(variante.productId, req);

  return variante;
}

const schemaVariante = z.object({
  label: z.string().min(1, "Une déclinaison a besoin d'un nom").max(60),
  // Vide, la déclinaison est au prix du plat.
  price: z.number().min(0, "Un prix ne peut pas être négatif").nullable().optional(),
  isAvailable: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

// GET /products/:productId/variants - Les déclinaisons d'un plat (public)
//
// Publique : la vitrine en a besoin, et un visiteur n'a pas de compte.
router.get("/:productId/variants", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;

    const [variantes, produit] = await Promise.all([
      VariantService.lister(productId),
      db.product.findUnique({ where: { id: productId }, select: { variantLabel: true } }),
    ]);

    res.json({ success: true, data: { libelleDuChoix: produit?.variantLabel || null, variantes } });
  } catch (err) {
    next(err);
  }
});

// POST /products/:productId/variants - Ajouter une déclinaison
router.post("/:productId/variants", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    await exigerLePlat(productId, req);

    const body = schemaVariante.parse(req.body);
    const variante = await VariantService.creer(productId, body);

    logger.info("Déclinaison créée", { productId, label: body.label });

    res.status(201).json({ message: `« ${variante.label} » ajoutée`, data: variante });
  } catch (err) {
    next(err);
  }
});

// PUT /products/variants/:variantId - Modifier une déclinaison
router.put("/variants/:variantId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const variantId = req.params.variantId as string;
    await exigerLaVariante(variantId, req);

    const body = schemaVariante.partial().parse(req.body);
    const variante = await VariantService.modifier(variantId, body);

    res.json({ message: "Déclinaison enregistrée", data: variante });
  } catch (err) {
    next(err);
  }
});

// PATCH /products/variants/:variantId/availability - Épuisée ou de retour
router.patch("/variants/:variantId/availability", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const variantId = req.params.variantId as string;
    await exigerLaVariante(variantId, req);

    const body = z.object({ isAvailable: z.boolean() }).parse(req.body);
    const variante = await VariantService.modifier(variantId, { isAvailable: body.isAvailable });

    res.json({
      message: body.isAvailable ? "Déclinaison de retour" : "Déclinaison épuisée",
      data: variante,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /products/variants/:variantId - Retirer une déclinaison
router.delete("/variants/:variantId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const variantId = req.params.variantId as string;
    await exigerLaVariante(variantId, req);

    const resultat = await VariantService.supprimer(variantId);

    res.json({
      message: resultat.retiree
        ? "Déclinaison déjà commandée : retirée de la vente, l'historique est conservé"
        : "Déclinaison supprimée",
      data: resultat,
    });
  } catch (err) {
    next(err);
  }
});

// GET /products/:productId/supplements - Les groupes de suppléments d'un plat
//
// Côté commerçant : les prix tels qu'il les a saisis (HT s'il travaille hors
// taxe). La vitrine les reçoit TTC avec le menu (/api/client/stores/:id).
router.get("/:productId/supplements", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    await exigerLePlat(productId, req);

    res.json({ success: true, data: await SupplementService.lister(productId) });
  } catch (err) {
    next(err);
  }
});

// PUT /products/:productId/supplements - Remplace tous les groupes du plat
router.put("/:productId/supplements", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    await exigerLePlat(productId, req);

    const groupes = schemaGroupes.parse(req.body?.groupes);
    const enregistres = await SupplementService.remplacer(productId, groupes);

    // La vitrine ouverte relit son menu : le relais (middleware/diffusion.ts)
    // annonce toute écriture sous /api/products.
    logger.info("Suppléments enregistrés", { productId, groupes: enregistres.length });

    res.json({ message: "Suppléments enregistrés", data: enregistres });
  } catch (err) {
    next(err);
  }
});

// POST /products/:productId/variants/reorder - L'ordre voulu par le commerçant
router.post("/:productId/variants/reorder", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    await exigerLePlat(productId, req);

    const body = z
      .object({
        ordering: z.array(z.object({ id: z.string().min(1), displayOrder: z.number().int().min(0) })),
      })
      .parse(req.body);

    const variantes = await VariantService.reordonner(productId, body.ordering);

    res.json({ message: "Ordre enregistré", data: variantes });
  } catch (err) {
    next(err);
  }
});

// PUT /products/:productId/variant-label - La question posée au client
router.put("/:productId/variant-label", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.productId as string;
    await exigerLePlat(productId, req);

    const body = z
      .object({ libelle: z.string().max(60).nullable() })
      .parse(req.body);

    const produit = await VariantService.nommerLeChoix(productId, body.libelle);

    res.json({ message: "Intitulé enregistré", data: produit });
  } catch (err) {
    next(err);
  }
});

export default router;
