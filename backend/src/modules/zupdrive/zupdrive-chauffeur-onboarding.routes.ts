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
import { UnifiedRolesService } from "../auth/unified-roles.service";
import { ApiError } from "../../middleware/api-error";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";

// Middleware d'authentification simple (à utiliser avec un vrai JWT en production)
const authenticate = authMiddleware;

const router = Router();

// Déclaration des types pour que TypeScript accepte userId
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validation manuelle
      const schema = z.object({
        nomComplet: z.string().min(2),
        telephone: z.string().min(9),
        region: z.enum(["BRUXELLES", "WALLONIE", "FLANDRE"]),
      });

      const validated = schema.parse(req.body);
      const userId = req.userId!;

      const context = await UnifiedRolesService.createChauffeurCandidacy({
        userId,
        nomComplet: validated.nomComplet,
        telephone: validated.telephone,
        region: validated.region,
      });

      return res.json({
        success: true,
        message: "Dossier créé avec succès",
        roles: context.roles,
        chauffeurId: context.chauffeurId,
        chauffeurStatus: context.chauffeurStatus,
      });
    } catch (error) {
      return next(error);
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

      return res.json({
        success: true,
        message: "Dossier soumis pour validation",
        chauffeurStatus: context.chauffeurStatus,
      });
    } catch (error) {
      return next(error);
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

      return res.json({
        success: true,
        candidacy: chauffeur,
        roleActive: context.roles.includes("CHAUFFEUR_VTCZTC"),
      });
    } catch (error) {
      return next(error);
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
      const candidateId = (req.params.id as string) || "";

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

      return res.json({
        success: true,
        message: "Dossier approuvé",
        chauffeurStatus: context.chauffeurStatus,
        roles: context.roles,
      });
    } catch (error) {
      return next(error);
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validation manuelle
      const schema = z.object({
        reason: z.string().min(10, "Raison requise (min 10 chars)"),
      });

      const validated = schema.parse(req.body);
      const adminId = (req as any).userId!;
      const candidateId = (req.params.id as string) || "";

      // Vérifier que c'est admin
      const adminContext =
        await UnifiedRolesService.loadUserRoleContext(adminId);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        throw new ApiError(403, "Accès réservé aux admins ZupDrive");
      }

      await UnifiedRolesService.rejectChauffeur({
        chauffeurId: candidateId,
        rejectionReason: validated.reason,
        rejectedBy: adminId,
      });

      // Notification au chauffeur
      // TODO: envoyer email/notification

      return res.json({
        success: true,
        message: "Dossier refusé",
      });
    } catch (error) {
      return next(error);
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

      return res.json({
        success: true,
        count: pending.length,
        candidates: pending,
      });
    } catch (error) {
      return next(error);
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
      const candidateId = (req.params.id as string) || "";

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
              statut: true,
              dateExpiration: true,
              examineLe: true,
            },
          },
        },
      });

      if (!chauffeur) {
        throw new ApiError(404, "Candidature non trouvée");
      }

      return res.json({
        success: true,
        chauffeur,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
