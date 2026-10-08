import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { MerchantClosureService } from "./merchant-closure.service";
import {
  PlanService,
  promoSansCommissionActive,
  appliquerConditions,
  aDesConditionsNegociees,
  CHAMPS_CONDITIONS,
} from "../plans/plan.service";
import { MerchantProfileService } from "./merchant-profile.service";
import { MerchantApprovalService } from "./merchant-approval.service";
import { logger } from "../../config/logger";
import { isSuperOwner, journaliser } from "../superowner/shared";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

/** Les conditions négociées d'un commerçant, sous la forme que lit l'interface. */
function conditionsDe(org: {
  customCommissionPercent: unknown;
  customPlatformDeliveryCommissionPercent: unknown;
  customMaxStores: number | null;
  customMonthlyPrice: unknown;
  customTermsNote: string | null;
}) {
  const nombre = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    actives: aDesConditionsNegociees(org),
    commission: nombre(org.customCommissionPercent),
    commissionLivreursPlateforme: nombre(org.customPlatformDeliveryCommissionPercent),
    maxBoutiques: org.customMaxStores,
    prixMensuel: nombre(org.customMonthlyPrice),
    note: org.customTermsNote,
  };
}

/**
 * Fige, au taux actuellement appliqué, les commandes du mois qui n'ont pas
 * encore de commission : un changement de formule ou de conditions ne doit pas
 * refacturer le début du mois au nouveau taux.
 */
async function figerCommissionsDuMois(orgId: string, taux: number, tier: string) {
  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);

  const storeIds = (await db.store.findMany({ where: { orgId }, select: { id: true } })).map(
    (s) => s.id
  );

  if (storeIds.length === 0) return;

  const commandes = await db.order.findMany({
    where: { storeId: { in: storeIds }, createdAt: { gte: debutMois } },
    select: { id: true, totalAmount: true, commissionAmount: true, commissionWaived: true },
  });

  // Les commandes offertes par une promo restent à 0.
  const nonFigees = commandes.filter(
    (c) => Number(c.commissionAmount) === 0 && !c.commissionWaived
  );

  await Promise.all(
    nonFigees.map((c) =>
      db.order.update({
        where: { id: c.id },
        data: {
          commissionPercent: taux,
          commissionAmount: Number(((Number(c.totalAmount) * taux) / 100).toFixed(2)),
          tierAtOrder: tier as any,
        },
      })
    )
  );
}

// GET /superowner/organizations - Commerçants avec leur activité réelle
router.get("/organizations", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);
    const status = req.query.status as string;
    // « ?validation=attente » : les commerces qui attendent qu'on examine
    // leur dossier, ce que la plateforme cherche en premier.
    const enAttente = req.query.validation === "attente";

    const where = {
      ...(status ? { status } : {}),
      ...(enAttente ? { approvedAt: null } : {}),
    };

    const [organisations, total] = await Promise.all([
      db.organization.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          stores: { select: { id: true } },
          _count: { select: { memberships: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.organization.count({ where }),
    ]);

    const lignes = await Promise.all(
      organisations.map(async (org) => {
        const storeIds = org.stores.map((s) => s.id);

        const commandes = storeIds.length
          ? await db.order.findMany({
              where: { storeId: { in: storeIds } },
              select: { totalAmount: true },
            })
          : [];

        return {
          id: org.id,
          name: org.name,
          email: org.email || "",
          status: org.status,
          tier: org.tier,
          createdAt: org.createdAt,
          approvedAt: org.approvedAt,
          activeUsers: org._count.memberships,
          // La promo « zéro commission » : réglée, et en cours ou non.
          commissionFree: {
            active: org.commissionFreeActive,
            until: org.commissionFreeUntil,
            note: org.commissionFreeNote,
            enCours: promoSansCommissionActive(org),
          },
          // Les conditions négociées avec ce commerçant, s'il y en a.
          customTerms: conditionsDe(org),
          revenue: Number(
            commandes.reduce((somme, c) => somme + Number(c.totalAmount), 0).toFixed(2)
          ),
        };
      })
    );

    res.json({ organizations: lignes, pagination: { total, limit, offset } });
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

    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { tier: true, ...CHAMPS_CONDITIONS },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    // Rétrograder en dessous du nombre de boutiques ouvertes créerait un
    // commerçant hors quota : on le signale au lieu de l'accepter en silence.
    const formuleCible = await PlanService.formule(body.tier);
    // Un quota négocié suit le commerçant d'une formule à l'autre.
    const quotaCible = appliquerConditions(formuleCible, existante).maxBoutiques;
    const boutiques = await db.store.count({ where: { orgId, deletedAt: null } });

    if (boutiques > quotaCible) {
      throw new ApiError(
        400,
        `Ce commerçant exploite ${boutiques} boutiques ; la formule ${formuleCible.libelle} en autorise ${quotaCible}. Fermez d'abord les boutiques en trop.`,
        "TIER_BELOW_USAGE"
      );
    }

    // Le taux d'avant le changement (négocié ou de l'ancienne formule) reste
    // acquis aux commandes déjà passées ce mois-ci.
    const ancienneFormule = appliquerConditions(await PlanService.formule(existante.tier), existante);
    await figerCommissionsDuMois(orgId, ancienneFormule.commission, existante.tier);

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: { tier: body.tier },
    });

    await journaliser(req, "MERCHANT_TIER_CHANGED", orgId, {
      avant: existante.tier,
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

    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { tier: true, ...CHAMPS_CONDITIONS },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    const formule = await PlanService.formule(existante.tier);
    const commissionFinale = body.commission ?? formule.commission;
    const livreursFinale = body.commissionLivreursPlateforme ?? formule.commissionLivreursPlateforme;

    if (livreursFinale < commissionFinale) {
      throw new ApiError(
        400,
        `La commission avec les livreurs de la plateforme (${livreursFinale} %) ne peut pas être inférieure à la commission de base (${commissionFinale} %)`,
        "INVALID_COMMISSION"
      );
    }

    if (body.maxBoutiques !== null) {
      const boutiques = await db.store.count({ where: { orgId, deletedAt: null } });
      if (boutiques > body.maxBoutiques) {
        throw new ApiError(
          400,
          `Ce commerçant exploite ${boutiques} boutiques : le quota ne peut pas descendre à ${body.maxBoutiques}.`,
          "TIER_BELOW_USAGE"
        );
      }
    }

    // Les commandes déjà passées ce mois-ci restent au taux d'avant.
    const ancien = appliquerConditions(formule, existante);
    await figerCommissionsDuMois(orgId, ancien.commission, existante.tier);

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: {
        customCommissionPercent: body.commission,
        customPlatformDeliveryCommissionPercent: body.commissionLivreursPlateforme,
        customMaxStores: body.maxBoutiques,
        customMonthlyPrice: body.prixMensuel,
        customTermsNote: body.note?.trim() || null,
      },
      select: CHAMPS_CONDITIONS,
    });

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

    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { commissionFreeActive: true, commissionFreeUntil: true },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    // La date de fin est incluse : la promo court jusqu'au soir de ce jour.
    const fin = body.active && body.until ? new Date(`${body.until}T23:59:59.999`) : null;

    if (fin && fin <= new Date()) {
      throw new ApiError(400, "La date de fin est déjà passée", "PROMO_END_IN_PAST");
    }

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: {
        commissionFreeActive: body.active,
        commissionFreeUntil: fin,
        commissionFreeNote: body.active ? body.note?.trim() || null : null,
      },
    });

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

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: "UPDATE_MERCHANT_DOCUMENT_EXPIRY",
          target: req.params.orgId as string,
          changes: { type: piece.type, avant, apres: piece.expiryDate },
        },
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

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: body.approuve ? "APPROVE_MERCHANT_DOCUMENT" : "REJECT_MERCHANT_DOCUMENT",
          target: req.params.orgId as string,
          changes: { type: piece.type, note: body.note },
        },
      });

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

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: "APPROVE_MERCHANT",
          target: orgId,
          changes: { approvedAt: org.approvedAt },
        },
      });

      res.json({ success: true, message: "Commerce validé", organization: org });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
