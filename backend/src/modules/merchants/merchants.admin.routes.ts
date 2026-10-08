import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { MerchantClosureService } from "./merchant-closure.service";
import { promoSansCommissionActive, aDesConditionsNegociees } from "../plans/plan.service";
import { MerchantProfileService } from "./merchant-profile.service";
import { MerchantApprovalService } from "./merchant-approval.service";
import { logger } from "../../config/logger";
import { isSuperOwner, journaliser } from "../superowner/shared";
import { limiteBornee, decalage } from "../../utils/pagination";
import { MerchantAdminService, conditionsDe } from "./merchants.admin.service";

const router = Router();

// GET /superowner/organizations - Commerçants avec leur activité réelle
router.get("/organizations", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);
    const status = req.query.status as string;
    // « ?validation=attente » : les commerces qui attendent qu'on examine
    // leur dossier, ce que la plateforme cherche en premier.
    const enAttente = req.query.validation === "attente";

    res.json(await MerchantAdminService.lister({ limit, offset, status, enAttente }));
  } catch (err) {
    next(err);
  }
});

// ---- Actions de gestion sur un commerçant ----
// Elles s'appuient sur le même service que l'espace d'administration, pour que
// suspension et fermeture se comportent exactement de la même façon.

// PATCH /superowner/organizations/:orgId/tier - Changer la formule
router.patch("/organizations/:orgId/tier", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({ tier: z.enum(["FREE", "PREMIUM", "PRO"]) });
    const body = schema.parse(req.body);

    const { avant, organisation, formuleCible } = await MerchantAdminService.changerFormule(orgId, body.tier);

    await journaliser(req, "MERCHANT_TIER_CHANGED", orgId, {
      avant,
      apres: body.tier,
      commandesFigees: true,
    });

    res.json({
      message: `Formule passée en ${formuleCible.libelle}`,
      organization: { id: organisation.id, tier: organisation.tier },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /superowner/organizations/:orgId/conditions
 *
 * Fixe des conditions négociées à la main avec un commerçant (une enseigne, une
 * chaîne) : commission, commission avec les livreurs de la plateforme, quota de
 * boutiques, prix mensuel. Chaque valeur remplace celle de sa formule ; `null`
 * la rend à la formule. Les commandes déjà passées ce mois-ci gardent le taux
 * d'avant.
 */
router.patch("/organizations/:orgId/conditions", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const pourcentage = z.number().min(0).max(100).nullable();
    const schema = z.object({
      commission: pourcentage,
      commissionLivreursPlateforme: pourcentage,
      maxBoutiques: z.number().int().min(1).max(1000).nullable(),
      prixMensuel: z.number().min(0).max(100000).nullable(),
      note: z.string().max(500).nullable().optional(),
    });
    const body = schema.parse(req.body);

    const { avant: existante, organisation } = await MerchantAdminService.fixerConditions(orgId, body);

    await journaliser(req, "MERCHANT_CUSTOM_TERMS_SET", orgId, {
      avant: conditionsDe(existante),
      apres: conditionsDe(organisation),
    });

    res.json({
      message: aDesConditionsNegociees(organisation)
        ? "Conditions négociées enregistrées"
        : "Le commerçant retrouve les conditions de sa formule",
      customTerms: conditionsDe(organisation),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /superowner/organizations/:orgId/commission-promo
 *
 * Offre (ou retire) la promo « zéro commission » à un commerçant. Seules les
 * commandes passées pendant la promo en profitent : celles d'avant gardent
 * leur commission.
 */
router.patch("/organizations/:orgId/commission-promo", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      active: z.boolean(),
      // Date de fin incluse (AAAA-MM-JJ). Absente : jusqu'à nouvel ordre.
      until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide")
        .nullable()
        .optional(),
      note: z.string().max(200).nullable().optional(),
    });
    const body = schema.parse(req.body);

    const { avant: existante, organisation, fin } = await MerchantAdminService.changerPromoCommission(orgId, body);

    await journaliser(req, body.active ? "COMMISSION_PROMO_GRANTED" : "COMMISSION_PROMO_REMOVED", orgId, {
      avant: existante,
      apres: { active: body.active, until: fin, note: organisation.commissionFreeNote },
    });

    res.json({
      message: body.active ? "Promo zéro commission activée" : "Promo zéro commission retirée",
      commissionFree: {
        active: organisation.commissionFreeActive,
        until: organisation.commissionFreeUntil,
        note: organisation.commissionFreeNote,
        enCours: promoSansCommissionActive(organisation),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/organizations/:orgId/suspend", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({ reason: z.string().min(1, "La raison est requise") });
    const body = schema.parse(req.body);

    const organisation = await MerchantClosureService.suspend(orgId, body.reason);
    await journaliser(req, "SUSPEND_MERCHANT", orgId, { reason: body.reason });

    logger.info("Merchant suspended by superowner", { orgId, reason: body.reason });
    res.json(organisation);
  } catch (err) {
    next(err);
  }
});

router.post("/organizations/:orgId/unsuspend", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;

    const organisation = await MerchantClosureService.unsuspend(orgId);
    await journaliser(req, "UNSUSPEND_MERCHANT", orgId);

    res.json(organisation);
  } catch (err) {
    next(err);
  }
});

router.post("/organizations/:orgId/close", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({ reason: z.string().min(1, "La raison est requise") });
    const body = schema.parse(req.body);

    const organisation = await MerchantClosureService.close(orgId, body.reason);
    await journaliser(req, "CLOSE_MERCHANT", orgId, { reason: body.reason });

    logger.info("Merchant closed by superowner", { orgId, reason: body.reason });
    res.json(organisation);
  } catch (err) {
    next(err);
  }
});

/**
 * Le dossier d'un commerçant : son identité de facturation et ses pièces.
 *
 * La plateforme lui facture une commission sans jamais avoir vu un
 * justificatif. Ces routes lui permettent de statuer sur ce qu'il a déposé.
 */

// GET /superowner/organizations/:orgId/profile - Le dossier d'un commerçant
router.get(
  "/organizations/:orgId/profile",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: await MerchantProfileService.dossier(req.params.orgId as string),
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /superowner/organizations/:orgId/documents/:documentId/expiry - Corriger l'échéance d'une pièce
router.patch(
  "/organizations/:orgId/documents/:documentId/expiry",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        expiryDate: z.string().min(1, "Donnez une date d'expiration"),
      });
      const body = schema.parse(req.body);

      const { avant, piece } = await MerchantProfileService.changerEcheance(
        req.params.orgId as string,
        req.params.documentId as string,
        body.expiryDate
      );

      await journaliser(req, "UPDATE_MERCHANT_DOCUMENT_EXPIRY", req.params.orgId as string, {
        type: piece.type,
        avant,
        apres: piece.expiryDate,
      });

      res.json({ success: true, document: piece });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /superowner/organizations/:orgId/documents/:documentId - Statuer sur une pièce
router.patch(
  "/organizations/:orgId/documents/:documentId",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        approuve: z.boolean(),
        note: z.string().max(500).optional(),
      });
      const body = schema.parse(req.body);

      const piece = await MerchantProfileService.examinerPiece(
        req.params.orgId as string,
        req.params.documentId as string,
        body
      );

      await journaliser(
        req,
        body.approuve ? "APPROVE_MERCHANT_DOCUMENT" : "REJECT_MERCHANT_DOCUMENT",
        req.params.orgId as string,
        { type: piece.type, note: body.note }
      );

      res.json({ success: true, document: piece });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /superowner/organizations/:orgId/approve - Valider un commerce
 *
 * Il pourra ouvrir sa boutique et recevoir des commandes. Refusé tant qu'une
 * pièce exigée n'est pas validée.
 */
router.post(
  "/organizations/:orgId/approve",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const org = await MerchantApprovalService.valider(orgId, req.userId as string);

      await journaliser(req, "APPROVE_MERCHANT", orgId, { approvedAt: org.approvedAt });

      res.json({ success: true, message: "Commerce validé", organization: org });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
