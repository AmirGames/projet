import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { limiterCadence } from "../../middleware/throttle";
import { ChatCourseDriveService, TEXTE_MAX } from "./chat-course-drive.service";

/**
 * /api/zupdrive/courses/:id/messages — le chat du passager avec son chauffeur.
 * Toujours le compte du jeton : la course d'un autre répond 404.
 * (Le côté chauffeur est dans chauffeur.routes : /me/courses/:id/messages.)
 */
const router = Router();

router.use(authMiddleware);

export const messageSchema = z
  .object({
    texte: z.string().trim().min(1).max(TEXTE_MAX),
    cleIdempotence: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export const lectureSchema = z.object({ depuis: z.coerce.date().optional() });

// Relecture toutes les 4 s : 30 par minute laissent de la marge sans laisser noyer le serveur.
const limiterLecture = limiterCadence({ nom: "zupdrive-chat-lecture", max: 60, fenetreMs: 60_000, cle: (req) => `${req.userId}` });
const limiterEnvoi = limiterCadence({
  nom: "zupdrive-chat-envoi",
  max: 20,
  fenetreMs: 60_000,
  message: "Vous écrivez trop vite. Réessayez dans un instant.",
  cle: (req) => `${req.userId}`,
});

// GET /api/zupdrive/courses/:id/messages?depuis=ISO
router.get("/:id/messages", limiterLecture, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { depuis } = lectureSchema.parse(req.query);
    const data = await ChatCourseDriveService.lister({ auteur: "PASSAGER", userId: req.userId as string }, z.string().min(1).parse(req.params.id), depuis);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/courses/:id/messages { texte, cleIdempotence }
router.post("/:id/messages", limiterEnvoi, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { texte, cleIdempotence } = messageSchema.parse(req.body);
    const data = await ChatCourseDriveService.envoyer({ auteur: "PASSAGER", userId: req.userId as string }, z.string().min(1).parse(req.params.id), texte, cleIdempotence);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
