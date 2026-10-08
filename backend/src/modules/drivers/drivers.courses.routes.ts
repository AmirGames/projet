import { Router, Request, Response, NextFunction } from "express";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { uploadMiddleware } from "../files/file-upload.middleware";
import { DispatchService } from "./dispatch.service";
import { DriverCoursesService } from "./driver-courses.service";
import { DriverCourseActionsService } from "./driver-course-actions.service";
import { livreurConnecte } from "./driver-ownership.service";

// Courses du livreur : liste, détail et étapes. Monté sur /api/drivers (voir app.ts).
const router = Router();

// GET /drivers/deliveries - Get deliveries for driver (protected)
router.get("/deliveries", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const status = (req.query.status as string) || "PENDING";

    res.json({
      success: true,
      data: await DriverCoursesService.lister(livreur, status),
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/deliveries/:id - Get specific delivery (protected)
router.get("/deliveries/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: await DriverCoursesService.detail(req.user?.userId as string, req.params.id as string),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/deliveries/:id/accept - Accept delivery (protected)
router.patch(
  "/deliveries/:id/accept",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const delivery = await DriverCoursesService.accepterParCourse(req.user?.userId as string, req.params.id as string);

      res.json({
        success: true,
        message: "Course acceptée",
        data: delivery
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/deliveries/:id - Update delivery status (protected)
router.patch(
  "/deliveries/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body;

      const STATUTS = ["PENDING", "ACCEPTED", "PICKED_UP", "DELIVERED", "FAILED"];
      if (!status || !STATUTS.includes(status)) {
        throw new ApiError(400, `Statut invalide (attendu : ${STATUTS.join(", ")})`, "INVALID_INPUT");
      }

      const delivery = await DriverCourseActionsService.changerStatut(
        req.user?.userId as string,
        req.params.id as string,
        status,
        req.body
      );

      res.json({
        success: true,
        message: "Delivery updated",
        data: delivery
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drivers/deliveries/:id/photo - La photo du dépôt, prise sur place
// (retenue comme preuve à la clôture, PATCH /deliveries/:id avec `photoUrl`).
router.post(
  "/deliveries/:id/photo",
  authMiddleware,
  uploadMiddleware.single("photo"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await DriverCourseActionsService.deposerPhoto(req.user?.userId as string, req.params.id as string, req.file);

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drivers/deliveries/:id/attente - Le client ne répond pas : l'attente de 6 minutes commence
router.post(
  "/deliveries/:id/attente",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await DriverCourseActionsService.lancerAttente(req.user?.userId as string, req.params.id as string);

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/deliveries/:id/location - Update driver location (protected)
router.patch(
  "/deliveries/:id/location",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { latitude, longitude } = req.body;

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        throw new ApiError(400, "Latitude et longitude requises", "INVALID_INPUT");
      }

      await DriverCourseActionsService.enregistrerPositionDeCourse(
        req.user?.userId as string,
        req.params.id as string,
        { latitude, longitude }
      );

      res.json({
        success: true,
        message: "Position enregistrée",
        data: { latitude, longitude }
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/deliveries/:id/cancel - Annuler une course acceptée
router.patch(
  "/deliveries/:id/cancel",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body;
      const deliveryId = req.params.id as string;

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        throw new ApiError(400, "La raison d'annulation est requise", "MISSING_REASON");
      }

      const data = await DriverCourseActionsService.annuler(req.user?.userId as string, deliveryId, reason);

      res.json({
        success: true,
        message: "Course annulée. Un autre livreur sera proposé au restaurant.",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drivers/offers/:id/accept - Accepter une course proposée
router.post(
  "/offers/:id/accept",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);
      const course = await DispatchService.accepter(req.params.id as string, livreur.id);

      res.json({
        success: true,
        message: course.lot.length > 1 ? `${course.lot.length} courses acceptées` : "Course acceptée",
        data: course,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drivers/offers/:id/decline - Refuser, la course part au suivant
router.post(
  "/offers/:id/decline",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);
      const suivante = await DispatchService.refuser(req.params.id as string, livreur.id);

      res.json({
        success: true,
        message: "Course refusée",
        // Dit au commerçant si quelqu'un d'autre a été sollicité.
        reproposee: Boolean(suivante),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
