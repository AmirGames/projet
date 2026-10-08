import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { limiterCadence } from "../../middleware/throttle";
import { AdresseFavoriteDriveService, TYPES_ADRESSE_FAVORITE } from "./adresse-favorite-drive.service";
import { adresseSchema } from "./course-drive.routes";

/**
 * /api/zupdrive/adresses — les adresses « Domicile » et « Travail » du
 * passager connecté. Jamais celles d'un autre compte : l'identité vient du
 * jeton, le client ne fournit que le type.
 */
const router = Router();

router.use(authMiddleware);

const typeSchema = z.object({ type: z.enum(TYPES_ADRESSE_FAVORITE) });

const limiterEcritures = limiterCadence({
  nom: "zupdrive-adresses",
  max: 30,
  fenetreMs: 10 * 60_000,
  cle: (req) => `${req.userId}`,
});

// GET /api/zupdrive/adresses — mes adresses enregistrées
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await AdresseFavoriteDriveService.lister(req.userId as string) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/zupdrive/adresses/:type — enregistrer (ou remplacer) l'adresse du type
router.put("/:type", limiterEcritures, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = typeSchema.parse(req.params);
    const adresse = adresseSchema.strict().parse(req.body);
    res.json({ success: true, data: await AdresseFavoriteDriveService.enregistrer(req.userId as string, type, adresse) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/zupdrive/adresses/:type — retirer l'adresse du type
router.delete("/:type", limiterEcritures, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = typeSchema.parse(req.params);
    await AdresseFavoriteDriveService.supprimer(req.userId as string, type);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
