import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { isSuperOwner, journaliser } from "../superowner/shared";
import { SurveillanceCoursesService } from "./surveillance-courses.service";
import { DossierIncidentService } from "./dossier-incident.service";

// Incidents de livraison : ce que la surveillance des courses a constaté et les
// décisions de la plateforme. Monté sur /api/superowner avec drivers.admin.routes.ts
// (voir superowner.routes.ts).
const router = Router();

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
