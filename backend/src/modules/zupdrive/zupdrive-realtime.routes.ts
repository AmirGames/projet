import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { ZupDriveRealtimeService } from "./zupdrive-realtime.service";
import { CourseDriveService } from "./course-drive.service";
import { ApiError } from "../../middleware/errorHandler";
import { adminAuthSection } from "./zupdrive-garde";

/**
 * /api/zupdrive/realtime — Événements temps réel ZupDrive.
 *
 * Ces routes permettent aux clients de s'abonner aux mises à jour
 * d'une course en temps réel (GPS, statut, ETA, chat).
 */

const router = Router();

// Middleware d'authentification
router.use(authMiddleware);

// POST /api/zupdrive/realtime/join/:courseId
// Le client se connecte au suivi d'une course
router.post("/join/:courseId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = z.object({ courseId: z.string() }).parse(req.params);
    const userId = req.userId as string;
    const socketId = req.socketId;

    if (!socketId) {
      throw new ApiError(400, "Socket non disponible", "NO_SOCKET");
    }

    // Vérifier que l'utilisateur a accès à cette course
    const course = await CourseDriveService.maCourse(userId, courseId);
    if (!course) {
      throw new ApiError(404, "Trajet introuvable", "COURSE_NOT_FOUND");
    }

    // Rejoindre le salon
    const joined = await ZupDriveRealtimeService.joinCourse(socketId, courseId, userId);
    if (!joined) {
      throw new ApiError(403, "Impossible de rejoindre ce trajet", "FORBIDDEN");
    }

    res.json({
      success: true,
      message: "Connecté au suivi du trajet",
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/realtime/leave/:courseId
// Le client se déconnecte du suivi d'une course
router.post("/leave/:courseId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = z.object({ courseId: z.string() }).parse(req.params);
    const socketId = req.socketId;

    if (!socketId) {
      throw new ApiError(400, "Socket non disponible", "NO_SOCKET");
    }

    await ZupDriveRealtimeService.leaveCourse(socketId, courseId);

    res.json({
      success: true,
      message: "Déconnecté du suivi du trajet",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/realtime/stats
// Stats du système temps réel
// Compteurs de connexions de la plateforme : réservés à l'équipe (section « courses-drive »), pas à tout compte connecté.
router.get("/stats", ...adminAuthSection("courses-drive"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = ZupDriveRealtimeService.getStats();

    res.json({
      success: true,
      data: stats || {
        totalConnections: 0,
        activeRooms: 0,
        message: "Socket.io non initialisé",
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
