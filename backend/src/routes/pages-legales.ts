import { Router, Request, Response, NextFunction } from "express";
import { PagesLegalesService } from "../services/pages-legales.service";

/** Lecture publique des pages légales en vigueur. */
const router = Router();

// GET /pages-legales - Titres et versions en vigueur
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pages = await PagesLegalesService.toutes();
    res.json({ data: pages.map(({ contenu: _contenu, ...page }) => page) });
  } catch (err) {
    next(err);
  }
});

// GET /pages-legales/:slug - Texte en vigueur d'une page
router.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ data: await PagesLegalesService.enVigueur(req.params.slug as string) });
  } catch (err) {
    next(err);
  }
});

export default router;
