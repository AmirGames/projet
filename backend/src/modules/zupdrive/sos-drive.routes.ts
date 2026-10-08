import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { limiterCadence } from "../../middleware/throttle";
import { SosDriveService } from "./sos-drive.service";

/**
 * /api/zupdrive/sos — l'alerte SOS du passager et sa personne de confiance.
 * Toujours le compte du jeton : une course d'un autre répond 404.
 */
const router = Router();

router.use(authMiddleware);

// Une alerte réelle est rare ; la limite protège l'équipe et les e-mails d'un compte qui s'acharne.
const limiterAlertes = limiterCadence({
  nom: "zupdrive-sos",
  max: 5,
  fenetreMs: 10 * 60_000,
  message: "Trop d'alertes envoyées. Si vous êtes en danger, appelez le 17 ou le 112.",
  cle: (req) => `${req.userId}`,
});
const limiterContact = limiterCadence({ nom: "zupdrive-sos-contact", max: 10, fenetreMs: 3_600_000, cle: (req) => `${req.userId}` });

const alerteSchema = z
  .object({
    courseId: z.string().min(1).max(64),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), "latitude et longitude vont ensemble");

const contactSchema = z
  .object({
    nom: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    /** Le passager confirme avoir informé cette personne : sans cela, on n'enregistre rien. */
    consentement: z.literal(true),
  })
  .strict();

// POST /api/zupdrive/sos — déclencher l'alerte d'un trajet en cours
router.post("/", limiterAlertes, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId, latitude, longitude } = alerteSchema.parse(req.body);
    const position = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
    const alerte = await SosDriveService.declencher(req.userId as string, courseId, position);
    res.status(201).json({ success: true, data: alerte });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/sos/contact — ma personne de confiance (null si aucune)
router.get("/contact", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await SosDriveService.lireContact(req.userId as string) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/zupdrive/sos/contact — enregistrer ou remplacer
router.put("/contact", limiterContact, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nom, email } = contactSchema.parse(req.body);
    res.json({ success: true, data: await SosDriveService.enregistrerContact(req.userId as string, { nom, email }) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/zupdrive/sos/contact — retirer
router.delete("/contact", limiterContact, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await SosDriveService.supprimerContact(req.userId as string);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
