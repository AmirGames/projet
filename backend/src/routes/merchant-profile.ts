import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import {
  MerchantProfileService,
  TYPES_DOCUMENT_COMMERCANT,
} from "../services/merchant-profile.service";

const router = Router();

/**
 * Le profil du commerçant, vu de son côté.
 *
 * La plateforme lui facturait une commission et lui devait des versements sans
 * rien savoir de lui. Ces routes lui donnent la main sur ce qui le décrit :
 * son identité de facturation, son propriétaire, son compte, ses pièces.
 */

/** Un membre ne gère que le profil de son organisation. */
async function verifierAppartenance(orgId: string, req: Request) {
  const appartenance = await db.membership.findFirst({
    where: { userId: req.userId, orgId },
    select: { id: true },
  });

  if (!appartenance) {
    throw new ApiError(403, "Accès refusé à ce commerçant", "FORBIDDEN");
  }
}

// GET /merchant-profile/:orgId - Le profil
router.get("/:orgId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    await verifierAppartenance(orgId, req);

    res.json({ success: true, data: await MerchantProfileService.profil(orgId) });
  } catch (err) {
    next(err);
  }
});

const profilSchema = z
  .object({
    legalName: z.string().max(200).nullable().optional(),
    vatNumber: z.string().max(30).nullable().optional(),
    registrationNumber: z.string().max(30).nullable().optional(),
    billingAddress: z.string().max(200).nullable().optional(),
    billingPostalCode: z.string().max(12).nullable().optional(),
    billingCity: z.string().max(100).nullable().optional(),
    billingCountry: z.string().max(50).nullable().optional(),
    ownerFirstName: z.string().max(80).nullable().optional(),
    ownerLastName: z.string().max(80).nullable().optional(),
    ownerEmail: z.string().max(150).nullable().optional(),
    ownerPhone: z.string().max(30).nullable().optional(),
    ownerBirthDate: z.string().max(40).nullable().optional(),
    iban: z.string().max(40).nullable().optional(),
    bic: z.string().max(15).nullable().optional(),
    accountHolder: z.string().max(150).nullable().optional(),
  })
  .strict();

// PUT /merchant-profile/:orgId - Enregistrer le profil
router.put("/:orgId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    await verifierAppartenance(orgId, req);

    const corps = profilSchema.parse(req.body);

    res.json({
      success: true,
      message: "Profil enregistré",
      data: await MerchantProfileService.enregistrer(orgId, corps),
    });
  } catch (err) {
    next(err);
  }
});

const pieceSchema = z.object({
  type: z.enum(TYPES_DOCUMENT_COMMERCANT),
  documentUrl: z.string().min(1, "Donnez un lien vers le document").max(500),
  fileName: z.string().max(200).optional(),
  expiryDate: z.string().max(40).nullable().optional(),
});

// POST /merchant-profile/:orgId/documents - Déposer une pièce
router.post(
  "/:orgId/documents",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      await verifierAppartenance(orgId, req);

      const piece = pieceSchema.parse(req.body);

      res.status(201).json({
        success: true,
        message: "Document déposé, il sera examiné par la plateforme",
        document: await MerchantProfileService.deposerPiece(orgId, piece),
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /merchant-profile/:orgId/documents/:documentId - Retirer une pièce
router.delete(
  "/:orgId/documents/:documentId",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      await verifierAppartenance(orgId, req);

      await MerchantProfileService.retirerPiece(orgId, req.params.documentId as string);

      res.json({ success: true, message: "Document retiré" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
