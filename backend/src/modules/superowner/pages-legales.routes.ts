import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
import { PagesLegalesService } from "../legal/pages-legales.service";
import { isSuperOwner, journaliser } from "./shared";

const router = Router();

// GET /superowner/pages-legales - Pages en vigueur et historique des versions
router.get("/pages-legales", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pages = await PagesLegalesService.toutes();
    const data = await Promise.all(
      pages.map(async (page) => ({ ...page, historique: await PagesLegalesService.historique(page.slug) }))
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

const publicationPageLegaleSchema = z.object({
  titre: z.string().trim().min(1, "Titre requis").max(200),
  contenu: z.string().trim().min(1, "Le texte ne peut pas être vide").max(100_000),
  version: z
    .string()
    .trim()
    .min(1, "Version requise")
    .max(40)
    .regex(/^[\w.\-]+$/, "Lettres, chiffres, points, tirets uniquement"),
});

// POST /superowner/pages-legales/:slug - Publier une nouvelle version
router.post("/pages-legales/:slug", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = publicationPageLegaleSchema.parse(req.body);
    const slug = req.params.slug as string;
    const publiee = await PagesLegalesService.publier(slug, body, (req as any).actorEmail);
    await journaliser(req, "PAGE_LEGALE_PUBLIEE", slug, { version: publiee.version, titre: publiee.titre });
    res.status(201).json({ data: publiee });
  } catch (err) {
    next(err);
  }
});

export default router;
