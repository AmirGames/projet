import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { champAcceptation } from "../legal/acceptation-conditions.service";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { limiterInscriptions } from "../../middleware/throttle";
import { champEmail, champMotDePasse } from "../../utils/validation";
import { DriverPayoutService } from "../payouts/driver-payout.service";
import { notesDuLivreur } from "./driver-rating.service";
import { DriverActivityService, FiltreHistorique } from "./driver-activity.service";
import { DriverAvailabilityService } from "./driver-availability.service";
import { DispatchService } from "./dispatch.service";
import { DriverAccountService } from "./driver-account.service";
import { livreurConnecte } from "./driver-ownership.service";

// Compte du livreur : inscription, profil, revenus, disponibilité, versements.
// Le dossier, les notifications et le support sont dans drivers.dossier.routes.ts,
// les courses dans drivers.courses.routes.ts et drivers.offres.routes.ts ; tous
// sont montés sur /api/drivers (voir app.ts).
const router = Router();

const inscriptionSchema = z.object({
  name: z.string().min(2, "Nom minimum 2 caractères"),
  email: champEmail(),
  password: champMotDePasse(),
  phone: z.string().min(9, "Téléphone invalide"),
  vehicleType: z.enum(["car", "scooter", "bike"]),
  vehiclePlate: z.string().optional(),
  ...champAcceptation,
});

// POST /drivers/register - Inscription d'un livreur
router.post("/register", limiterInscriptions, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = inscriptionSchema.parse(req.body);
    const inscrit = await DriverAccountService.inscrire(req, body);

    res.status(201).json({ message: "Inscription réussie", ...inscrit });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/earnings - Revenus du livreur connecté
router.get("/earnings", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    res.json(await DriverAccountService.revenus(livreur));
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/availability - Se déclarer disponible ou non
router.patch("/availability", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    // isOnline est ce que le livreur décide ; isAvailable, l'ancien nom du même geste.
    const { isOnline, isAvailable } = req.body;
    const voulu = typeof isOnline === "boolean" ? isOnline : isAvailable;

    if (typeof voulu !== "boolean") {
      throw new ApiError(400, "Le champ isOnline doit être un booléen", "INVALID_INPUT");
    }

    const misAJour = await DriverAccountService.definirEnLigne(livreur, voulu);

    res.json({
      isAvailable: misAJour.isAvailable,
      isOnline: misAJour.isOnline,
      pausedUntil: misAJour.pausedUntil,
    });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/pause - Pause temporaire { minutes, reason? }
router.post("/pause", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const body = z
      .object({ minutes: z.number(), reason: z.string().max(200).optional() })
      .parse(req.body);

    const misAJour = await DriverAvailabilityService.mettreEnPause(livreur.id, body.minutes, body.reason);

    res.json({
      success: true,
      isAvailable: misAJour.isAvailable,
      isOnline: misAJour.isOnline,
      pausedUntil: misAJour.pausedUntil,
      pauseReason: misAJour.pauseReason,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /drivers/pause - Reprendre avant la fin de la pause
router.delete("/pause", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const misAJour = await DriverAvailabilityService.reprendre(livreur.id);

    res.json({
      success: true,
      isAvailable: misAJour.isAvailable,
      isOnline: misAJour.isOnline,
      pausedUntil: null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/me/suppression - Ce que la suppression implique, avant de confirmer
router.get("/me/suppression", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    res.json({
      success: true,
      data: { ...(await DriverAccountService.apercuSuppression(livreur)), demandeeLe: livreur.suppressionDemandeeLe },
    });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/me/suppression - Le livreur demande la suppression de son compte
// (désactivation immédiate, effacement des données après le dernier versement :
// voir DriverAccountService.demanderSuppression).
router.post("/me/suppression", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const { motif } = z.object({ motif: z.string().max(500).optional() }).parse(req.body ?? {});

    const { apercu, message } = await DriverAccountService.demanderSuppression(livreur, motif);

    res.json({ success: true, data: apercu, message });
  } catch (err) {
    next(err);
  }
});

const compteSchema = z.object({
  iban: z.string().min(15).max(40),
  bic: z.string().max(11).optional().nullable(),
  accountHolder: z.string().min(2).max(70),
});

// PUT /drivers/me/bank-account - Le compte où recevoir ses versements du lundi
router.put("/me/bank-account", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const corps = compteSchema.parse(req.body);

    await DriverAccountService.enregistrerCompte(livreur.id, corps);

    res.json({ success: true, message: "Compte enregistré" });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/me - Get current driver info (protected)
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await DriverAccountService.profil(req.user?.userId as string);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /drivers/payouts - Ce qui est dû au livreur, et ce qui lui a été versé
 *
 * Ses gains s'accumulaient dans un seul total, sans qu'il puisse savoir si
 * l'argent était arrivé.
 */
router.get("/payouts", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    res.json({ success: true, data: await DriverPayoutService.situation(livreur.id) });
  } catch (err) {
    next(err);
  }
});

/** GET /drivers/payouts/:id - Le détail d'un relevé, course par course */
router.get(
  "/payouts/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);
      const releve = await DriverPayoutService.detail(req.params.id as string);

      // Le relevé d'un autre livreur ne le regarde pas.
      if (releve.driverId !== livreur.id) {
        throw new ApiError(404, "Relevé introuvable", "PAYOUT_NOT_FOUND");
      }

      res.json({ success: true, data: releve });
    } catch (err) {
      next(err);
    }
  }
);

// GET /drivers/history - Historique paginé des courses du livreur
router.get("/history", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    const query = z
      .object({
        filtre: z.enum(["ALL", "ACTIVE", "DELIVERED", "CANCELLED"]).optional(),
        depuis: z.coerce.date().optional(),
        jusqua: z.coerce.date().optional(),
        page: z.coerce.number().int().min(1).optional(),
        parPage: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query);

    res.json({
      success: true,
      ...(await DriverActivityService.historique(livreur.id, {
        ...query,
        filtre: query.filtre as FiltreHistorique | undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/analytics?jours=7|30|90 - Statistiques du livreur
router.get("/analytics", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const { jours } = z
      .object({ jours: z.coerce.number().refine((j) => [7, 30, 90].includes(j)).default(7) })
      .parse(req.query);

    res.json({ success: true, data: await DriverActivityService.analytics(livreur.id, jours) });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/ratings - Ce que les clients ont dit de ses courses
router.get("/ratings", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    res.json({ success: true, data: await notesDuLivreur(livreur.id) });
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/location - Position du livreur, course ou non
router.patch("/location", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .parse(req.body);

    const livreur = await livreurConnecte(req);

    // La position compte même sans course en cours : c'est elle qui décide à
    // qui la prochaine sera proposée.
    const resultat = await DispatchService.enregistrerPosition(livreur.id, body);

    res.json({ success: true, ...resultat });
  } catch (err) {
    next(err);
  }
});

export default router;
