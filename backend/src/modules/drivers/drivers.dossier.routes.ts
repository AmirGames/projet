import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { uploadMiddleware } from "../files/file-upload.middleware";
import { logger } from "../../config/logger";
import { DriverApprovalService, TYPES_DOCUMENT, libelleDuDocument } from "./driver-approval.service";
import { Notifier } from "../notifications/notifier.service";
import { DriverSupportService, LONGUEUR_MAX } from "./driver-support.service";
import { DriverAccountService } from "./driver-account.service";
import { cheminRelatif } from "../files/fichiers-prives.service";
import { servirFichierPrive } from "../files/files.routes";
import { livreurConnecte } from "./driver-ownership.service";

// Dossier du livreur (pièces), notifications push et fil avec le support.
// Monté sur /api/drivers (voir app.ts).
const router = Router();

// GET /drivers/push/config - Clé publique VAPID pour s'abonner aux notifications
router.get("/push/config", authMiddleware, async (_req: Request, res: Response) => {
  res.json({ success: true, data: { enabled: Notifier.canaux.push, publicKey: Notifier.canaux.vapidPublicKey } });
});

// POST /drivers/push/subscribe - Enregistre l'abonnement push du navigateur
router.post("/push/subscribe", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const abonnement = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      })
      .passthrough()
      .parse(req.body);

    await DriverAccountService.abonnerPush(livreur.id, abonnement);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /drivers/push/subscribe - Désactive les notifications push
router.delete("/push/subscribe", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    await DriverAccountService.desabonnerPush(livreur.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/push/test - Envoie une notification d'essai
router.post("/push/test", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const envoye = await Notifier.pushLivreur(livreur.id, {
      title: "Notifications activées",
      body: "Vous serez prévenu de chaque nouvelle course, même l'application en arrière-plan.",
      url: "/driver",
    });
    res.json({ success: true, envoye });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/support/messages - Le fil du livreur avec le support
router.get("/support/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const messages = await DriverSupportService.fil(livreur.id);
    // Ouvrir le fil vaut lecture des réponses du support.
    await DriverSupportService.marquerLu(livreur.id, "DRIVER");
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/support/messages - Écrire au support
router.post("/support/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const body = z.object({ body: z.string().min(1).max(LONGUEUR_MAX) }).parse(req.body);
    const message = await DriverSupportService.envoyer(livreur.id, "DRIVER", body.body);
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/support/read - Marquer les réponses du support comme lues
router.post("/support/read", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    await DriverSupportService.marquerLu(livreur.id, "DRIVER");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/support/unread - Nombre de réponses non lues (pastille du menu)
router.get("/support/unread", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    res.json({ success: true, data: { unread: await DriverSupportService.nonLusPourLivreur(livreur.id) } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /drivers/documents - Les pièces du dossier du livreur connecté
 *
 * Le modèle existait sans qu'aucune route ne l'écrive ni ne le lise : le
 * livreur n'avait aucun moyen de déposer son permis, ni de savoir ce qu'on
 * attendait de lui.
 */
router.get("/documents", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const dossier = await DriverApprovalService.dossier(livreur.id);

    res.json({
      success: true,
      data: {
        status: dossier.status,
        statusReason: dossier.statusReason,
        dossierComplet: dossier.dossierComplet,
        piecesAttendues: dossier.piecesAttendues.map((type) => ({
          type,
          libelle: libelleDuDocument(type),
        })),
        piecesManquantes: dossier.piecesManquantes,
        documents: dossier.documents.map((piece) => ({
          id: piece.id,
          type: piece.type,
          libelle: libelleDuDocument(piece.type),
          documentUrl: piece.documentUrl,
          expiryDate: piece.expiryDate,
          status: piece.status,
          reviewNote: piece.reviewNote,
          reviewedAt: piece.reviewedAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

const pieceSchema = z.object({
  type: z.enum(TYPES_DOCUMENT),
  documentUrl: z.string().url("Donnez un lien vers le document"),
  expiryDate: z.string().optional().nullable(),
});

// POST /drivers/documents - Déposer une pièce du dossier par URL
router.post("/documents", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const body = pieceSchema.parse(req.body);

    const piece = await DriverApprovalService.deposerPiece(livreur.id, body);

    res.status(201).json({
      message: `${libelleDuDocument(piece.type)} déposée, en attente de validation`,
      data: piece,
    });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/documents/upload - Déposer une pièce du dossier par upload de fichier
router.post(
  "/documents/upload",
  authMiddleware,
  uploadMiddleware.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);

      if (!req.file) {
        throw new ApiError(400, "Aucun fichier fourni", "NO_FILE");
      }

      const schema = z.object({
        type: z.enum(TYPES_DOCUMENT),
        expiryDate: z.string().optional().nullable(),
      });

      const body = schema.parse(req.body);

      logger.info("Driver file upload", {
        driverId: livreur.id,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      const piece = await DriverApprovalService.deposerFichier(livreur.id, {
        type: body.type,
        file: req.file.buffer,
        filename: req.file.originalname || `document.${req.file.mimetype.split("/")[1]}`,
        mimeType: req.file.mimetype,
        expiryDate: body.expiryDate,
      });

      res.status(201).json({
        message: `${libelleDuDocument(piece.type)} déposée, en attente de validation`,
        data: piece,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /drivers/documents/file/<dossier>/<fichier> - L'ancienne adresse des
 * pièces, gardée pour les écrans qui s'en servent encore. Elle était publique
 * et répondait « Access-Control-Allow-Origin: * » : n'importe quel site lisait
 * un permis ou un RIB. Elle passe maintenant par le même contrôle que
 * /api/files (voir modules/files/files.routes.ts).
 */
router.get(/^\/documents\/file\/(.+)$/, (req: Request, res: Response, next: NextFunction) =>
  servirFichierPrive(cheminRelatif(String(req.params[0] ?? "")), req, res, next)
);

export default router;
