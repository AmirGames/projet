import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { limiterCadence } from "../../middleware/throttle";
import { CourseDriveService } from "./course-drive.service";

/**
 * /api/zupdrive/courses — le passager commande et suit ses trajets
 * (zupdrive.com/trajet), avec son compte ZupOne.
 *
 * Toujours les courses du compte connecté : une course d'un autre répond 404,
 * comme une course inexistante.
 */
const router = Router();

router.use(authMiddleware);

export const adresseSchema = z.object({
  adresse: z.string().trim().min(3).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  codePostal: z.string().trim().min(4).max(10),
});

const trajetSchema = z.object({ depart: adresseSchema, arrivee: adresseSchema }).strict();

// Un devis par seconde au plus en moyenne ; une commande toutes les minutes.
const limiterDevis = limiterCadence({
  nom: "zupdrive-devis",
  max: 60,
  fenetreMs: 60_000,
  cle: (req) => `${req.userId}`,
});
const limiterCommandes = limiterCadence({
  nom: "zupdrive-commandes",
  max: 10,
  fenetreMs: 10 * 60_000,
  message: "Trop de trajets commandés. Réessayez dans quelques minutes.",
  cle: (req) => `${req.userId}`,
});

// POST /api/zupdrive/courses/devis — distance, durée et prix fixe d'un trajet
router.post("/devis", limiterDevis, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { depart, arrivee } = trajetSchema.parse(req.body);
    const devis = await CourseDriveService.devis(depart, arrivee);
    res.json({
      success: true,
      data: {
        region: devis.region,
        distanceMetres: devis.distanceMetres,
        dureeSecondes: devis.dureeSecondes,
        prixCentimes: devis.prixCentimes,
        devise: devis.devise,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/courses — commander (idempotent par cleIdempotence)
router.post("/", limiterCommandes, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const demande = trajetSchema
      .extend({
        cleIdempotence: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
        prixAnnonceCentimes: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    const course = await CourseDriveService.commander(req.userId as string, demande);
    res.status(201).json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/courses — mes trajets
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await CourseDriveService.mesCourses(req.userId as string) });
  } catch (err) {
    next(err);
  }
});

const idSchema = z.string().min(1).max(64);

// GET /api/zupdrive/courses/:id — un trajet et son chauffeur
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: await CourseDriveService.maCourse(req.userId as string, idSchema.parse(req.params.id)),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/courses/:id/annuler — tant que le passager n'est pas à bord
router.post("/:id/annuler", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { motif } = z.object({ motif: z.string().trim().max(300).optional() }).strict().parse(req.body ?? {});
    res.json({
      success: true,
      data: await CourseDriveService.annulerParPassager(req.userId as string, idSchema.parse(req.params.id), motif),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
