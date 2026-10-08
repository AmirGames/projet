import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { userIdRequis } from "../auth/utilisateur-requis";
import { DriverApprovalService, libelleDuDocument } from "./driver-approval.service";
import { DriverPayoutService } from "../payouts/driver-payout.service";
import { DriverSupportService, LONGUEUR_MAX } from "./driver-support.service";
import { isSuperOwner, journaliser } from "../superowner/shared";
import { DriversAdminService } from "./drivers-admin.service";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

/**
 * GET /superowner/drivers - Les livreurs, et où en est leur dossier
 *
 * La plateforme n'avait aucune page sur ses livreurs : elle ne pouvait ni les
 * voir, ni les valider, ni les écarter. N'importe qui s'inscrivait et recevait
 * une course dans la minute.
 */
router.get("/drivers", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);
    const statut = req.query.status as string;

    res.json(await DriversAdminService.lister({ limit, offset, statut }));
  } catch (err) {
    next(err);
  }
});

// GET /superowner/drivers/:driverId - Le dossier complet d'un livreur
router.get("/drivers/:driverId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dossier = await DriverApprovalService.dossier(req.params.driverId as string);
    // Suppression demandée : ce qui reste à lui verser avant d'effacer quoi que ce soit.
    const suppression = dossier.suppressionDemandeeLe
      ? { demandeeLe: dossier.suppressionDemandeeLe, ...(await DriverPayoutService.soldeFinal(dossier.id)) }
      : null;

    res.json({
      driver: {
        id: dossier.id,
        name: dossier.name,
        email: dossier.email,
        phone: dossier.phone,
        vehicleType: dossier.vehicleType,
        vehiclePlate: dossier.vehiclePlate,
        status: dossier.status,
        statusReason: dossier.statusReason,
        approvedAt: dossier.approvedAt,
        isOnline: dossier.isOnline,
        rating: dossier.totalRatings > 0 ? Number(dossier.rating) : null,
        avis: dossier.totalRatings,
        totalDeliveries: dossier.totalDeliveries,
        totalEarnings: Number(dossier.totalEarnings),
        createdAt: dossier.createdAt,
      },
      suppression,
      documents: dossier.documents.map((piece) => ({
        id: piece.id,
        type: piece.type,
        libelle: libelleDuDocument(piece.type),
        documentUrl: piece.documentUrl,
        expiryDate: piece.expiryDate,
        status: piece.status,
        reviewNote: piece.reviewNote,
        reviewedAt: piece.reviewedAt,
        createdAt: piece.createdAt,
      })),
      piecesAttendues: dossier.piecesAttendues.map((type) => ({
        type,
        libelle: libelleDuDocument(type),
      })),
      piecesManquantes: dossier.piecesManquantes,
      dossierComplet: dossier.dossierComplet,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/drivers/:driverId/documents/:documentId/expiry - Corriger l'échéance d'une pièce
router.patch(
  "/drivers/:driverId/documents/:documentId/expiry",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        expiryDate: z.string().min(1, "Donnez une date d'expiration"),
      });
      const body = schema.parse(req.body);

      const { avant, piece } = await DriverApprovalService.changerEcheance(
        req.params.driverId as string,
        req.params.documentId as string,
        body.expiryDate
      );

      await journaliser(req, "UPDATE_DRIVER_DOCUMENT_EXPIRY", req.params.driverId as string, {
        type: piece.type,
        avant,
        apres: piece.expiryDate,
      });

      res.json({ success: true, document: piece });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /superowner/drivers/:driverId/documents/:documentId - Statuer sur une pièce
router.patch(
  "/drivers/:driverId/documents/:documentId",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        approuve: z.boolean(),
        note: z.string().max(500).optional(),
      });
      const body = schema.parse(req.body);

      const piece = await DriverApprovalService.examinerPiece(
        req.params.driverId as string,
        req.params.documentId as string,
        body
      );

      await journaliser(
        req,
        body.approuve ? "APPROVE_DRIVER_DOCUMENT" : "REJECT_DRIVER_DOCUMENT",
        req.params.driverId as string,
        { type: piece.type, note: body.note }
      );

      res.json({ success: true, document: piece });
    } catch (err) {
      next(err);
    }
  }
);

// POST /superowner/drivers/:driverId/approve - Valider le livreur
router.post("/drivers/:driverId/approve", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await DriverApprovalService.valider(
      req.params.driverId as string,
      req.userId as string
    );

    await journaliser(req, "APPROVE_DRIVER", livreur.id, { status: "ACTIVE" });

    res.json({ success: true, driver: livreur });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/drivers/:driverId/reject - Refuser ou suspendre
router.post("/drivers/:driverId/reject", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      // Refus d'un dossier, suspension d'un livreur en activité, ou mise en
      // sommeil : trois gestes, une seule mécanique.
      etat: z.enum(["REJECTED", "SUSPENDED", "INACTIVE"]).default("REJECTED"),
      raison: z.string().min(3, "Dites au livreur pourquoi"),
    });
    const body = schema.parse(req.body);

    const livreur = await DriverApprovalService.ecarter(
      req.params.driverId as string,
      body.etat,
      body.raison,
      req.userId as string
    );

    await journaliser(req, "SET_ASIDE_DRIVER", livreur.id, { status: body.etat, raison: body.raison });

    res.json({ success: true, driver: livreur });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/drivers/:driverId/reactivate - Rétablir un livreur suspendu
router.post("/drivers/:driverId/reactivate", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await DriverApprovalService.reactiver(
      req.params.driverId as string,
      req.userId as string
    );

    await journaliser(req, "REACTIVATE_DRIVER", livreur.id, { status: "ACTIVE" });

    res.json({ success: true, driver: livreur });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/driver-support - Conversations avec les livreurs
router.get("/driver-support", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await DriverSupportService.conversations() });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/driver-support/:driverId - Le fil d'un livreur
router.get("/driver-support/:driverId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driverId = req.params.driverId as string;
    res.json({ success: true, data: await DriversAdminService.filDeSupport(driverId) });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/driver-support/:driverId - Répondre à un livreur
router.post("/driver-support/:driverId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ body: z.string().min(1).max(LONGUEUR_MAX) }).parse(req.body);
    const message = await DriverSupportService.envoyer(req.params.driverId as string, "SUPPORT", body.body, {
      authorId: userIdRequis(req),
    });
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
});

export default router;
