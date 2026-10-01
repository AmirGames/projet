import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { DriverApprovalService, libelleDuDocument, piecesAttendues } from "./driver-approval.service";
import { DriverPayoutService } from "../payouts/driver-payout.service";
import { DriverSupportService, LONGUEUR_MAX } from "./driver-support.service";
import { isSuperOwner, journaliser } from "../superowner/shared";
import { SurveillanceCoursesService } from "./surveillance-courses.service";
import { DossierIncidentService } from "./dossier-incident.service";

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
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const statut = req.query.status as string;

    const where = statut && statut !== "ALL" ? { status: statut } : {};

    const [livreurs, total, parEtat] = await Promise.all([
      db.courier.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          documents: { select: { type: true, status: true, expiryDate: true } },
          _count: { select: { deliveries: true } },
        },
        // Les dossiers à traiter d'abord : c'est ce que la plateforme vient
        // faire ici.
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      db.courier.count({ where }),
      db.courier.groupBy({ by: ["status"], _count: true }),
    ]);

    res.json({
      drivers: livreurs.map((livreur) => {
        const attendues = piecesAttendues(livreur.vehicleType);
        const validees = new Set(
          livreur.documents.filter((piece) => piece.status === "APPROVED").map((p) => p.type)
        );

        return {
          id: livreur.id,
          name: livreur.name,
          email: livreur.email,
          phone: livreur.phone,
          vehicleType: livreur.vehicleType,
          vehiclePlate: livreur.vehiclePlate,
          status: livreur.status,
          statusReason: livreur.statusReason,
          approvedAt: livreur.approvedAt,
          isOnline: livreur.isOnline,
          // Nul tant que personne ne l'a noté : classer les livreurs sur un 5
          // par défaut revenait à ne pas les classer du tout.
          rating: livreur.totalRatings > 0 ? Number(livreur.rating) : null,
          avis: livreur.totalRatings,
          totalDeliveries: livreur.totalDeliveries,
          totalEarnings: Number(livreur.totalEarnings),
          courses: livreur._count.deliveries,
          // De quoi voir d'un coup d'œil ce qu'il reste à examiner.
          piecesDeposees: livreur.documents.length,
          piecesValidees: validees.size,
          piecesAttendues: attendues.length,
          dossierComplet: attendues.every((type) => validees.has(type)),
          suppressionDemandeeLe: livreur.suppressionDemandeeLe,
          createdAt: livreur.createdAt,
        };
      }),
      counts: Object.fromEntries(parEtat.map((ligne) => [ligne.status, ligne._count])),
      pagination: { total, limit, offset },
    });
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

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: "UPDATE_DRIVER_DOCUMENT_EXPIRY",
          target: req.params.driverId as string,
          changes: { type: piece.type, avant, apres: piece.expiryDate } as any,
        },
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

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: body.approuve ? "APPROVE_DRIVER_DOCUMENT" : "REJECT_DRIVER_DOCUMENT",
          target: req.params.driverId as string,
          changes: { type: piece.type, note: body.note } as any,
        },
      });

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

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "APPROVE_DRIVER",
        target: livreur.id,
        changes: { status: "ACTIVE" } as any,
      },
    });

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

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "SET_ASIDE_DRIVER",
        target: livreur.id,
        changes: { status: body.etat, raison: body.raison } as any,
      },
    });

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

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "REACTIVATE_DRIVER",
        target: livreur.id,
        changes: { status: "ACTIVE" } as any,
      },
    });

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
    const [messages, livreur] = await Promise.all([
      DriverSupportService.fil(driverId),
      db.courier.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isOnline: true,
          currentOrderId: true,
          latitude: true,
          longitude: true,
          lastLocationUpdate: true,
          gpsLostAt: true,
        },
      }),
    ]);

    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");

    await DriverSupportService.marquerLu(driverId, "SUPPORT");
    res.json({ success: true, data: { driver: livreur, messages } });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/driver-support/:driverId - Répondre à un livreur
router.post("/driver-support/:driverId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ body: z.string().min(1).max(LONGUEUR_MAX) }).parse(req.body);
    const message = await DriverSupportService.envoyer(req.params.driverId as string, "SUPPORT", body.body, {
      authorId: (req as any).userId,
    });
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /superowner/delivery-incidents?etat=ouverts|tous - Les courses qui dérapent
 *
 * Livreur qui ne vient pas au commerce, qui s'éloigne, livraison en retard,
 * courses retirées : ce que la surveillance a constaté (voir
 * surveillance-courses.service.ts), les ouverts d'abord.
 */
router.get("/delivery-incidents", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { etat } = z.object({ etat: z.enum(["ouverts", "tous"]).default("ouverts") }).parse(req.query);
    res.json({ success: true, data: await SurveillanceCoursesService.liste({ ouverts: etat === "ouverts" }) });
  } catch (err) {
    next(err);
  }
});

const motif = z.object({ motif: z.string().trim().min(3, "Donnez le motif").max(500) });

/**
 * POST /superowner/delivery-incidents/courses/:deliveryId/retirer - Retirer la course au livreur
 *
 * Commande encore au commerce (ACCEPTED) : la course repart chercher un autre
 * livreur, et ne sera plus proposée d'office à celui-ci. 409 si elle a déjà
 * été récupérée (DELIVERY_NOT_WITHDRAWABLE) ou a changé entre-temps.
 */
router.post(
  "/delivery-incidents/courses/:deliveryId/retirer",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = motif.parse(req.body);
      const resultat = await SurveillanceCoursesService.retirerCourse(req.params.deliveryId as string, {
        par: { userId: req.userId as string },
        motif: body.motif,
      });

      await journaliser(req, "WITHDRAW_DELIVERY_FROM_DRIVER", req.params.deliveryId as string, {
        driverId: resultat?.driverId,
        orderId: resultat?.orderId,
        avant: { status: "ACCEPTED", driverId: resultat?.driverId },
        apres: { status: "PENDING", driverId: null },
        motif: body.motif,
      });

      res.json({ success: true, data: resultat });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /superowner/delivery-incidents/courses/:deliveryId/echec - Déclarer la course échouée
 *
 * Commande partie avec le livreur (PICKED_UP) et qui n'arrivera pas : la
 * course passe à FAILED, le livreur est libéré et n'est pas payé.
 * Body : { motif, rembourser = true, suspendre = true }. Rembourse le client
 * (paiement en ligne) et suspend le livreur, ses courses encore au commerce
 * reproposées. Réponse : `remboursement` (REMBOURSEE, DEJA_REMBOURSEE,
 * SANS_PAIEMENT_EN_LIGNE, ECHEC, NON_DEMANDE), `suspendu`, `coursesRetirees`.
 */
router.post(
  "/delivery-incidents/courses/:deliveryId/echec",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = motif
        .extend({
          // Cochés par défaut : un client qui n'a rien reçu est remboursé, et
          // le livreur ne roule plus tant que l'équipe n'a pas examiné le cas.
          rembourser: z.boolean().default(true),
          suspendre: z.boolean().default(true),
        })
        .parse(req.body);
      const resultat = await SurveillanceCoursesService.declarerEchec(req.params.deliveryId as string, {
        par: { userId: req.userId as string },
        motif: body.motif,
        rembourser: body.rembourser,
        suspendre: body.suspendre,
      });

      await journaliser(req, "FAIL_DELIVERY", req.params.deliveryId as string, {
        driverId: resultat.driverId,
        orderId: resultat.orderId,
        avant: { status: "PICKED_UP" },
        apres: { status: "FAILED" },
        motif: body.motif,
        remboursement: resultat.remboursement,
        livreurSuspendu: resultat.suspendu,
        coursesRetirees: resultat.coursesRetirees,
      });

      res.json({ success: true, data: resultat });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /superowner/delivery-incidents/courses/:deliveryId/depot - Trancher un dépôt contesté
 *
 * Dépôt en photo fait pendant un incident, ou réclamation du client : le
 * paiement au livreur attend cette décision. Body : { decision: VALIDER |
 * REFUSER, motif, rembourser = true, suspendre = true } (les deux derniers ne
 * servent qu'au refus). VALIDER : la course est payée avec le relevé de la
 * semaine. REFUSER : jamais payée, commande annulée (DELIVERY_FAILED, due au
 * commerçant), client remboursé, livreur suspendu.
 */
router.post(
  "/delivery-incidents/courses/:deliveryId/depot",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = motif
        .extend({
          decision: z.enum(["VALIDER", "REFUSER"]),
          rembourser: z.boolean().default(true),
          suspendre: z.boolean().default(true),
        })
        .parse(req.body);
      const resultat = await SurveillanceCoursesService.deciderDepot(req.params.deliveryId as string, {
        par: { userId: req.userId as string },
        decision: body.decision,
        motif: body.motif,
        rembourser: body.rembourser,
        suspendre: body.suspendre,
      });

      await journaliser(req, body.decision === "VALIDER" ? "VALIDATE_DELIVERY_DEPOSIT" : "REFUSE_DELIVERY_DEPOSIT", req.params.deliveryId as string, {
        driverId: resultat.driverId,
        orderId: resultat.orderId,
        avant: { payoutHold: "REVIEW" },
        apres: { payoutHold: body.decision === "VALIDER" ? null : "REFUSED" },
        motif: body.motif,
        ...("remboursement" in resultat
          ? { remboursement: resultat.remboursement, livreurSuspendu: resultat.suspendu, coursesRetirees: resultat.coursesRetirees }
          : {}),
        dejaSurUnReleve: resultat.dejaSurUnReleve,
      });

      res.json({ success: true, data: resultat });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /superowner/delivery-incidents/:id/dossier - Le dossier complet d'un incident
 *
 * Chronologie, preuves (photo et position, attente), échanges avec le
 * support, décisions et conséquences financières : de quoi déposer plainte,
 * consulter un avocat, ou répondre au livreur qui conteste (droit d'accès).
 * Données personnelles : section à part (incidents-export, SuperAdmin et
 * Administrateur par défaut), et chaque export est journalisé.
 */
router.get("/delivery-incidents/:id/dossier", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dossier = await DossierIncidentService.construire(req.params.id as string);

    await journaliser(req, "EXPORT_INCIDENT_FILE", dossier.incident.id, {
      deliveryId: dossier.course.id,
      orderId: dossier.commande.id,
      livreurs: dossier.livreurs.map((l) => l.id),
    });

    res.set("Cache-Control", "no-store");
    res.json({ success: true, data: dossier });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/delivery-incidents/:id/clore - Marquer un incident comme traité
router.post(
  "/delivery-incidents/:id/clore",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({ resolution: z.string().trim().min(3, "Dites ce qui a été fait").max(500) })
        .parse(req.body);
      const { avant, apres } = await SurveillanceCoursesService.clore(
        req.params.id as string,
        { userId: req.userId as string },
        body.resolution
      );

      await journaliser(req, "CLOSE_DELIVERY_INCIDENT", apres.id, {
        deliveryId: apres.deliveryId,
        driverId: apres.driverId,
        avant: { closedAt: avant.closedAt },
        apres: { closedAt: apres.closedAt, resolution: apres.resolution },
      });

      res.json({ success: true, data: apres });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
