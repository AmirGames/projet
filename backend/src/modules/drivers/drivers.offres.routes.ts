import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../auth/auth.middleware";
import { DriverCoursesService } from "./driver-courses.service";
import { DriverRechercheService } from "./driver-recherche.service";
import { livreurConnecte } from "./driver-ownership.service";

// Propositions, tournée et recherche de livreurs par le commerçant.
// Monté sur /api/drivers (voir app.ts).
const router = Router();

// GET /drivers/offers - Courses proposées, en attente de réponse
router.get("/offers", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    res.json({ success: true, data: await DriverCoursesService.propositions(livreur) });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/tournee - Les arrêts du livreur, dans l'ordre (retrait avant remise)
router.get("/tournee", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    res.json({ success: true, data: await DriverCoursesService.tournee(livreur) });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/available - Get available delivery drivers within radius
router.get("/available", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Désactiver le cache pour cette route (elle retourne des données dynamiques)
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const resultat = await DriverRechercheService.disponibles({
      userId: req.userId as string,
      administrateur: Boolean(req.compte?.isSuperOwner || req.compte?.isSystemAdmin),
      storeId: req.query.storeId,
      rayon: req.query.radius,
    });

    res.json({ success: true, ...resultat });
  } catch (err) {
    next(err);
  }
});

export default router;
