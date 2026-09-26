import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { OrganizationService } from "../services/organization.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createOrgSchema = z.object({
  name: z.string().min(2, "Nom minimum 2 caractères"),
  slug: z.string().min(2, "Slug minimum 2 caractères").regex(/^[a-z0-9-]+$/),
});

const updateOrgSchema = z.object({
  name: z.string().min(2).optional(),
  tier: z.enum(["FREE", "PREMIUM", "PRO"]).optional(),
});

// POST /organizations - Create organization (protected)
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createOrgSchema.parse(req.body);
    // L'organisation revient toujours à l'appelant. La route prenait le
    // compte dans le corps : n'importe quel compte connecté pouvait en faire
    // administrateur un autre, à son insu.
    const userId = req.userId as string;

    logger.info("Creating organization", { name: body.name, slug: body.slug });

    const org = await OrganizationService.create({
      name: body.name,
      slug: body.slug,
      userId,
    });

    res.status(201).json({
      message: "Organization créée",
      org,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /organizations/:id - Get organization by ID
 *
 * Protégée : une organisation porte la formule et les coordonnées du
 * commerçant. La route était ouverte, ce qui laissait le cloisonnement sans
 * effet — il suffisait d'omettre son jeton pour lire le voisin.
 */
router.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const org = await OrganizationService.getById(id);

    if (!org) {
      throw new ApiError(404, "Organization non trouvée", "NOT_FOUND");
    }

    res.json(org);
  } catch (err) {
    next(err);
  }
});

// GET /organizations/slug/:slug - Get by slug
router.get("/slug/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;

    const org = await OrganizationService.getBySlug(slug);

    if (!org) {
      throw new ApiError(404, "Organization non trouvée", "NOT_FOUND");
    }

    res.json(org);
  } catch (err) {
    next(err);
  }
});

// GET /organizations - Get all for current user
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.body.userId || "user-123";

    const orgs = await OrganizationService.getByUserId(userId);

    res.json(orgs);
  } catch (err) {
    next(err);
  }
});

// PUT /organizations/:id - Update organization (protected)
router.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updateOrgSchema.parse(req.body);

    logger.info("Updating organization", { id });

    const org = await OrganizationService.update(id, body);

    if (!org) {
      throw new ApiError(404, "Organization non trouvée", "NOT_FOUND");
    }

    res.json({
      message: "Organization mise à jour",
      org,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /organizations/:id - Delete organization (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const org = await OrganizationService.getById(id);

    if (!org) {
      throw new ApiError(404, "Organization non trouvée", "NOT_FOUND");
    }

    logger.info("Deleting organization", { id });

    await OrganizationService.delete(id);

    res.json({
      message: "Organization supprimée",
    });
  } catch (err) {
    next(err);
  }
});

export default router;