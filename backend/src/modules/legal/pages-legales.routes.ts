import { Router, Request, Response, NextFunction } from "express";
import { PagesLegalesService } from "./pages-legales.service";
import { authFacultative } from "../auth/auth.middleware";
import { acceptationAJour, versionsEnVigueur } from "./acceptation-conditions.service";

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

// GET /pages-legales/acceptation/commande - Les conditions de commande sont-elles
// déjà acceptées dans leur version en vigueur ? Réponse propre à l'appelant
// connecté ; `versions` permet à un visiteur de comparer avec ce que son
// navigateur a mémorisé.
router.get("/acceptation/commande", authFacultative, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ data: { aJour: await acceptationAJour(req.userId), versions: await versionsEnVigueur() } });
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
