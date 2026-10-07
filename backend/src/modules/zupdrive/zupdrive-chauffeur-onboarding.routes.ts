/**
 * Routes: Onboarding Chauffeur ZupDrive
 *
 * Workflow client → chauffeur:
 * POST   /chauffeur/candidacy/create     - Client crée dossier (BROUILLON)
 * POST   /chauffeur/candidacy/submit     - Client soumet dossier (SOUMIS)
 * GET    /chauffeur/candidacy/status     - Vérifier statut dossier
 *
 * Admin ZupDrive:
 * POST   /admin/candidates/:id/approve   - Valider dossier (VALIDE)
 * POST   /admin/candidates/:id/reject    - Refuser dossier (REFUSE)
 * GET    /admin/candidates/pending       - Lister dossiers en attente (SOUMIS)
 * GET    /admin/candidates/:id/details   - Détail dossier + pièces jointes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { validateRequest } from "../../middlewares/validation.middleware";
import { authenticate } from "../../middlewares/auth.middleware";
import { UnifiedRolesService } from "../auth/unified-roles.service";
import { ApiError } from "../../utils/errors";
import { db } from "../../services/db";

const router = Router();

// ============================================================================
// CLIENT ENDPOINTS
// ============================================================================

/**
 * Client crée un dossier de candidature chauffeur
 * POST /chauffeur/candidacy/create
 */
router.post(
  "/chauffeur/candidacy/create",
  authenticate,
  validateRequest(
    z.object({
      nomComplet: z.string().min(2),
      telephone: z.string().min(9),
      region: z.enum(["BRUXELLES", "WALLONIE", "FLANDRE"]),
    })
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;

      const context = await UnifiedRolesService.createChauffeurCandidacy({
        userId,
        nomComplet: req.body.nomComplet,
        telephone: req.body.telephone,
        region: req.body.region,
      });

      res.json({
        success: true,
        message: "Dossier créé avec succès",
        roles: context.roles,
        chauffeurId: context.chauffeurId,
        chauffeurStatus: context.chauffeurStatus,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Client soumet son dossier pour validation
 * POST /chauffeur/candidacy/submit
 */
router.post(
  "/chauffeur/candidacy/submit",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;

      const context = await UnifiedRolesService.submitChauffeurApplication(
        userId
      );

      res.json({
        success: true,
        message: "Dossier soumis pour validation",
        chauffeurStatus: context.chauffeurStatus,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Client consulte le statut de son dossier
 * GET /chauffeur/candidacy/status
 */
router.get(
  "/chauffeur/candidacy/status",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;

      const context = await UnifiedRolesService.loadUserRoleContext(userId);

      if (!context.chauffeurId) {
        return res.status(404).json({
          error: "Pas de dossier chauffeur",
        });
      }

      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { id: context.chauffeurId },
        select: {
          id: true,
          statut: true,
          soumisLe: true,
          valideLe: true,
          validePar: true,
          motifStatut: true,
          nomComplet: true,
          region: true,
        },
      });

      res.json({
        success: true,
        candidacy: chauffeur,
        roleActive: context.roles.includes("CHAUFFEUR_VTCZTC"),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS (ZupDrive)
// ============================================================================

/**
 * Admin approuve un dossier chauffeur
 * POST /admin/candidates/:id/approve
 */
router.post(
  "/admin/candidates/:id/approve",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = req.userId!;
      const candidateId = req.params.id;

      // Vérifier que c'est admin
      const adminContext =
        await UnifiedRolesService.loadUserRoleContext(adminId);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        throw new ApiError(403, "Accès réservé aux admins ZupDrive");
      }

      const context = await UnifiedRolesService.approveChauffeur({
        chauffeurId: candidateId,
        approvedBy: adminId,
      });

      // Notification au chauffeur
      // TODO: envoyer email/notification

      res.json({
        success: true,
        message: "Dossier approuvé",
        chauffeurStatus: context.chauffeurStatus,
        roles: context.roles,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Admin refuse un dossier chauffeur
 * POST /admin/candidates/:id/reject
 */
router.post(
  "/admin/candidates/:id/reject",
  authenticate,
  validateRequest(
    z.object({
      reason: z.string().min(10, "Raison requise (min 10 chars)"),
    })
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = req.userId!;
      const candidateId = req.params.id;

      // Vérifier que c'est admin
      const adminContext =
        await UnifiedRolesService.loadUserRoleContext(adminId);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        throw new ApiError(403, "Accès réservé aux admins ZupDrive");
      }

      await UnifiedRolesService.rejectChauffeur({
        chauffeurId: candidateId,
        rejectionReason: req.body.reason,
        rejectedBy: adminId,
      });

      // Notification au chauffeur
      // TODO: envoyer email/notification

      res.json({
        success: true,
        message: "Dossier refusé",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Lister les dossiers en attente de validation
 * GET /admin/candidates/pending
 */
router.get(
  "/admin/candidates/pending",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = req.userId!;

      // Vérifier que c'est admin
      const adminContext =
        await UnifiedRolesService.loadUserRoleContext(adminId);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        throw new ApiError(403, "Accès réservé aux admins ZupDrive");
      }

      const pending = await db.chauffeurDrive.findMany({
        where: { statut: "SOUMIS" },
        select: {
          id: true,
          nomComplet: true,
          region: true,
          soumisLe: true,
          user: { select: { email: true } },
        },
        orderBy: { soumisLe: "asc" },
      });

      res.json({
        success: true,
        count: pending.length,
        candidates: pending,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Détail d'un dossier de candidature avec documents
 * GET /admin/candidates/:id/details
 */
router.get(
  "/admin/candidates/:id/details",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = req.userId!;
      const candidateId = req.params.id;

      // Vérifier que c'est admin
      const adminContext =
        await UnifiedRolesService.loadUserRoleContext(adminId);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        throw new ApiError(403, "Accès réservé aux admins ZupDrive");
      }

      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { id: candidateId },
        select: {
          id: true,
          userId: true,
          nomComplet: true,
          telephone: true,
          region: true,
          numeroEntreprise: true,
          raisonSociale: true,
          numeroLicence: true,
          vehiculeMarque: true,
          vehiculeModele: true,
          vehiculePlaque: true,
          statut: true,
          motifStatut: true,
          soumisLe: true,
          valideLe: true,
          validePar: true,
          user: {
            select: {
              email: true,
              name: true,
            },
          },
          documents: {
            select: {
              id: true,
              type: true,
              url: true,
              verified: true,
              expiresAt: true,
              createdAt: true,
            },
          },
        },
      });

      if (!chauffeur) {
        throw new ApiError(404, "Candidature non trouvée");
      }

      res.json({
        success: true,
        chauffeur,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
