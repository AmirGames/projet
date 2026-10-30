import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { userIdRequis } from "../auth/utilisateur-requis";
import { DriverApprovalService, libelleDuDocument } from "./driver-approval.service";
import { DriverPayoutService } from "../payouts/driver-payout.service";
import { DriverSupportService, LONGUEUR_MAX } from "./driver-support.service";
import { isSuperOwner, journaliser } from "../superowner/shared";
import { DriversAdminService } from "./drivers-admin.service";
import { DriverAccountService } from "./driver-account.service";
import { DriverVehicleChangeService } from "./driver-vehicle-change.service";
import { numeroBceNormalise } from "../../utils/bce";
import { db } from "../../services/db";
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
        bceNumber: dossier.bceNumber,
        bceStatus: dossier.bceStatus,
        bceReviewedAt: dossier.bceReviewedAt,
        bceReviewReason: dossier.bceReviewReason,
        statusReason: dossier.statusReason,
        approvedAt: dossier.approvedAt,
        isOnline: dossier.isOnline,
        currentOrderId: dossier.currentOrderId,
        rating: dossier.totalRatings > 0 ? Number(dossier.rating) : null,
        avis: dossier.totalRatings,
        totalDeliveries: dossier.totalDeliveries,
        totalEarnings: Number(dossier.totalEarnings),
        createdAt: dossier.createdAt,
      },
      suppression,
      vehicleChangeRequests: (await DriverVehicleChangeService.historiqueAdmin(dossier.id)).map((request) => ({
        id: request.id,
        currentVehicleType: request.currentVehicleType,
        requestedVehicleType: request.requestedVehicleType,
        requestedVehiclePlate: request.requestedVehiclePlate,
        status: request.status,
        reviewNote: request.reviewNote,
        reviewedAt: request.reviewedAt,
        createdAt: request.createdAt,
        requiredDocuments: request.requiredDocuments,
        documents: request.documents.map((piece) => ({
          id: piece.id,
          type: piece.type,
          libelle: libelleDuDocument(piece.type),
          documentUrl: piece.documentUrl,
          expiryDate: piece.expiryDate,
          status: piece.status,
          reviewNote: piece.reviewNote,
          createdAt: piece.createdAt,
        })),
      })),
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

// PATCH /superowner/drivers/:driverId/profile - Corriger les coordonnées du livreur.
// L'email de connexion, le statut et le véhicule suivent leurs circuits dédiés.
router.patch("/drivers/:driverId/profile", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().trim().min(7).max(32).regex(/^[+\d\s().-]+$/, "Numéro de téléphone invalide"),
      reason: z.string().trim().min(3).max(500),
    }).strict().parse(req.body);
    const driverId = req.params.driverId as string;
    const existing = await db.courier.findUnique({
      where: { id: driverId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: "Livreur introuvable" });
      return;
    }

    const driver = await db.$transaction(async (tx) => {
      const updated = await tx.courier.update({
        where: { id: driverId },
        data: { name: body.name, phone: body.phone },
        select: { id: true, name: true, email: true, phone: true, status: true },
      });
      if (existing.userId) {
        await tx.user.update({ where: { id: existing.userId }, data: { name: body.name } });
      }
      return updated;
    });

    await journaliser(req, "UPDATE_DRIVER_PROFILE", driver.id, {
      fields: ["name", "phone"],
      reason: body.reason,
    });
    res.json({ success: true, driver });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/drivers/:driverId/vehicle-change-requests/:requestId
router.patch(
  "/drivers/:driverId/vehicle-change-requests/:requestId",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({
        status: z.enum(["APPROVED", "REJECTED"]),
        reason: z.string().min(3).max(500).optional(),
      }).parse(req.body);
      const result = await DriverVehicleChangeService.examiner(
        req.params.driverId as string,
        req.params.requestId as string,
        req.userId as string,
        body
      );
      await journaliser(req, body.status === "APPROVED" ? "APPROVE_DRIVER_VEHICLE_CHANGE" : "REJECT_DRIVER_VEHICLE_CHANGE", req.params.driverId as string, {
        requestId: req.params.requestId as string,
        status: body.status,
        reason: body.status === "REJECTED" ? body.reason : undefined,
        vehicleType: result.vehicleType,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /superowner/drivers/:driverId/bce - décision humaine après consultation du registre BCE
router.patch("/drivers/:driverId/bce", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      status: z.enum(["VERIFIED", "REJECTED"]),
      reason: z.string().max(500).optional(),
    }).parse(req.body);
    const livreur = await DriverApprovalService.examinerBce(
      req.params.driverId as string,
      req.userId as string,
      body
    );

    await journaliser(req, body.status === "VERIFIED" ? "VERIFY_DRIVER_BCE" : "REJECT_DRIVER_BCE", livreur.id, {
      status: body.status,
      reason: body.status === "REJECTED" ? body.reason : undefined,
    });

    res.json({ success: true, bceStatus: livreur.bceStatus, bceReviewedAt: livreur.bceReviewedAt });
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

// PATCH /superowner/driver-support/:driverId/bce - enregistrer un BCE communiqué au support.
// La saisie relance le contrôle humain ; le support ne peut pas la déclarer vérifiée.
router.patch("/driver-support/:driverId/bce", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ bceNumber: z.string().min(1).max(32) }).parse(req.body);
    if (!numeroBceNormalise(body.bceNumber)) {
      res.status(400).json({ success: false, error: "Numéro BCE invalide" });
      return;
    }
    const livreur = await db.courier.findUnique({
      where: { id: req.params.driverId as string },
      select: { id: true, currentOrderId: true },
    });
    if (!livreur) {
      res.status(404).json({ success: false, error: "Livreur introuvable" });
      return;
    }
    const misAJour = await DriverAccountService.modifierNumeroBce(livreur, body.bceNumber);
    await journaliser(req, "UPDATE_DRIVER_BCE_FROM_SUPPORT", livreur.id, { bceStatus: misAJour.bceStatus });
    res.json({ success: true, data: { bceNumber: misAJour.bceNumber, bceStatus: misAJour.bceStatus } });
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
