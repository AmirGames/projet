/**
 * Routes: Document Validation Workflow
 *
 * Chauffeur: Upload documents
 * Admin: Validate each document
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ZupDriveDocumentValidationService } from "./zupdrive-document-validation.service";
import { UnifiedRolesService } from "../auth/unified-roles.service";
import { ApiError } from "../../middleware/api-error";
import { db } from "../../services/db";

const router = Router();

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = token;
  next();
};

// ============================================================================
// CHAUFFEUR ENDPOINTS
// ============================================================================

/**
 * Chauffeur upload un document
 * POST /api/zupdrive/documents/upload
 */
router.post(
  "/documents/upload",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        chauffeurId: z.string(),
        type: z.enum(["PERMIS", "ASSURANCE", "INSPECTION", "IDENTITE", "CONTRAT", "BCE", "AUTRE"]),
        url: z.string().url(),
        expiresAt: z.string().datetime().optional(),
      });

      const validated = schema.parse(req.body);

      // Vérifier que c'est le chauffeur qui upload ses propres docs
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { id: validated.chauffeurId },
        select: { userId: true },
      });

      if (!chauffeur || chauffeur.userId !== req.userId!) {
        return res.status(403).json({ error: "Forbidden - cannot upload for other chauffeur" });
      }

      const result = await ZupDriveDocumentValidationService.uploadDocument({
        chauffeurId: validated.chauffeurId,
        type: validated.type as any,
        url: validated.url,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
      });

      return res.json({
        success: true,
        message: "Document uploaded",
        document: result,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Chauffeur consulte ses documents
 * GET /api/zupdrive/documents/my-documents/:chauffeurId
 */
router.get(
  "/documents/my-documents/:chauffeurId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";

      // Vérifier que c'est ses propres documents
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { id: chauffeurId },
        select: { userId: true },
      });

      if (!chauffeur || chauffeur.userId !== req.userId!) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const summary = await ZupDriveDocumentValidationService.getChauffeurDocuments(chauffeurId);

      return res.json({
        success: true,
        summary,
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
 * Admin valide un document
 * POST /api/zupdrive/admin/documents/:id/approve
 */
router.post(
  "/admin/documents/:id/approve",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const documentId = (req.params.id as string) || "";

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const result = await ZupDriveDocumentValidationService.approveDocument({
        documentId,
        approvedBy: req.userId!,
      });

      return res.json({
        success: true,
        message: "Document approved",
        document: result,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin refuse un document
 * POST /api/zupdrive/admin/documents/:id/reject
 */
router.post(
  "/admin/documents/:id/reject",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        reason: z.string().min(10),
      });

      const validated = schema.parse(req.body);
      const documentId = (req.params.id as string) || "";

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const result = await ZupDriveDocumentValidationService.rejectDocument({
        documentId,
        reason: validated.reason,
        rejectedBy: req.userId!,
      });

      return res.json({
        success: true,
        message: "Document rejected",
        document: result,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin consulte tous les documents d'un chauffeur
 * GET /api/zupdrive/admin/documents/:chauffeurId/review
 */
router.get(
  "/admin/documents/:chauffeurId/review",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const summary = await ZupDriveDocumentValidationService.getChauffeurDocuments(chauffeurId);

      return res.json({
        success: true,
        summary,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin vérifie si chauffeur peut être approuvé
 * GET /api/zupdrive/admin/documents/:chauffeurId/ready-for-approval
 */
router.get(
  "/admin/documents/:chauffeurId/ready-for-approval",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const readiness = await ZupDriveDocumentValidationService.canApproveChauffeur(chauffeurId);

      return res.json({
        success: true,
        canApprove: readiness.canApprove,
        reason: readiness.reason,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Lister tous les documents en attente de validation
 * GET /api/zupdrive/admin/documents/pending
 */
router.get(
  "/admin/documents/pending",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const pending = await db.documentChauffeurDrive.findMany({
        where: { statut: "PENDING" },
        select: {
          id: true,
          type: true,
          chauffeurId: true,
          dateExpiration: true,
          chauffeur: {
            select: {
              nomComplet: true,
              region: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });

      return res.json({
        success: true,
        count: pending.length,
        documents: pending,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
