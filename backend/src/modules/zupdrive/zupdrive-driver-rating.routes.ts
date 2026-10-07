/**
 * Routes: Driver Rating & Reputation System
 *
 * Passengers: Rate drivers, view reputation
 * Drivers: View their reputation, get feedback
 * Admin: Monitor ratings, identify issues
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ZupDriveDriverRatingService } from "./zupdrive-driver-rating.service";
import { UnifiedRolesService } from "../auth/unified-roles.service";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";

const router = Router();

// Identité vérifiée par le jeton d'accès et la session (req.userId est posé
// par authMiddleware ; jamais lu tel quel dans un en-tête).
const authenticate = authMiddleware;

const noteSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

// ============================================================================
// PASSENGER ENDPOINTS
// ============================================================================

/**
 * Passenger note un chauffeur après une course
 * POST /api/zupdrive/ratings/submit
 */
router.post(
  "/ratings/submit",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        courseId: z.string(),
        chauffeurId: z.string(),
        rating: noteSchema,
        comment: z.string().optional(),
        categories: z
          .object({
            cleanliness: noteSchema.optional(),
            driving: noteSchema.optional(),
            communication: noteSchema.optional(),
            comfort: noteSchema.optional(),
          })
          .optional(),
        tags: z
          .array(
            z.enum(["safe_driving", "friendly", "clean_car", "good_music", "quiet"])
          )
          .optional(),
      });

      const validated = schema.parse(req.body);

      await ZupDriveDriverRatingService.submitRating({
        chauffeurId: validated.chauffeurId,
        passengerId: req.userId!,
        courseId: validated.courseId,
        rating: validated.rating,
        comment: validated.comment,
        categories: validated.categories,
        tags: validated.tags,
      });

      return res.json({
        success: true,
        message: "Thank you for your rating!",
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Passenger/Driver consulte la réputation d'un chauffeur
 * GET /api/zupdrive/ratings/chauffeur/:chauffeurId
 */
router.get(
  "/ratings/chauffeur/:chauffeurId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";

      const reputation = await ZupDriveDriverRatingService.getReputationScore(
        chauffeurId
      );

      return res.json({
        success: true,
        reputation,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Consulter les avis pour un chauffeur
 * GET /api/zupdrive/ratings/chauffeur/:chauffeurId/reviews?limit=10&offset=0&sortBy=recent
 */
router.get(
  "/ratings/chauffeur/:chauffeurId/reviews",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";
      const limit = Math.min(parseInt((req.query.limit as string) || "10"), 50);
      const offset = parseInt((req.query.offset as string) || "0");
      const sortBy = (req.query.sortBy as string || "recent") as "recent" | "highest" | "lowest";

      const reviews = await ZupDriveDriverRatingService.getReviews(
        chauffeurId,
        limit,
        offset,
        sortBy
      );

      return res.json({
        success: true,
        reviews,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// DRIVER ENDPOINTS
// ============================================================================

/**
 * Chauffeur consulte sa propre réputation
 * GET /api/zupdrive/ratings/my-reputation
 */
router.get(
  "/ratings/my-reputation",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Trouver le chauffeur associé à cet utilisateur
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Chauffeur profile not found" });
      }

      const reputation = await ZupDriveDriverRatingService.getReputationScore(
        chauffeur.id
      );

      return res.json({
        success: true,
        reputation,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Chauffeur consulte les avis reçus
 * GET /api/zupdrive/ratings/my-reviews?limit=20&sortBy=recent
 */
router.get(
  "/ratings/my-reviews",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Chauffeur profile not found" });
      }

      const limit = Math.min(parseInt((req.query.limit as string) || "20"), 100);
      const sortBy = (req.query.sortBy as string || "recent") as "recent" | "highest" | "lowest";

      const reviews = await ZupDriveDriverRatingService.getReviews(
        chauffeur.id,
        limit,
        0,
        sortBy
      );

      return res.json({
        success: true,
        reviews,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Admin consulte les chauffeurs top-rated
 * GET /api/zupdrive/admin/ratings/top-drivers?limit=10
 */
router.get(
  "/admin/ratings/top-drivers",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const limit = Math.min(parseInt((req.query.limit as string) || "10"), 50);

      const topDrivers = await ZupDriveDriverRatingService.getTopRatedDrivers(limit);

      return res.json({
        success: true,
        drivers: topDrivers,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin consulte les chauffeurs ayant besoin d'amélioration
 * GET /api/zupdrive/admin/ratings/drivers-need-improvement?limit=10
 */
router.get(
  "/admin/ratings/drivers-need-improvement",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const limit = Math.min(parseInt((req.query.limit as string) || "10"), 50);

      const driverstNeedingHelp =
        await ZupDriveDriverRatingService.getDriversNeedingImprovement(limit);

      return res.json({
        success: true,
        drivers: driverstNeedingHelp,
        message: "Consider outreach programs for these drivers",
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Dashboard: Rating analytics
 * GET /api/zupdrive/admin/ratings/dashboard
 */
router.get(
  "/admin/ratings/dashboard",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const [totalDrivers, avgRating, topDrivers, driversNeedingHelp] = await Promise.all([
        db.chauffeurDrive.count(),
        // Moyenne générale des notes des passagers (NoteCourseDrive).
        db.noteCourseDrive.aggregate({
          where: { auteur: "PASSAGER" },
          _avg: { note: true },
        }),
        ZupDriveDriverRatingService.getTopRatedDrivers(5),
        ZupDriveDriverRatingService.getDriversNeedingImprovement(5),
      ]);

      return res.json({
        success: true,
        dashboard: {
          totalDrivers,
          averageRating: Math.round((avgRating._avg.note || 0) * 100) / 100,
          topDrivers,
          driversNeedingHelp,
          message: "Rating system dashboard",
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
