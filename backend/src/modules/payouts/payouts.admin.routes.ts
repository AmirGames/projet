import { Router, Request, Response, NextFunction } from "express";
import { MerchantPayoutService } from "./merchant-payout.service";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../../middleware/auth";
import { DriverPayoutService, MOYENS_VERSEMENT, semainePrecedente } from "./driver-payout.service";
import { isSuperOwner } from "../superowner/shared";

const router = Router();

/**
 * Les gains d'un livreur s'accumulaient sans que rien ne les paie. Arrêter un
 * relevé prend les courses dues d'une période ; le payer marque le relevé
 * versé. Une course déjà portée par un relevé n'est jamais reprise.
 */

// ─── Reversements commerçants et fichier SEPA ───────────────────────────────
//
// Chaque lundi 00 h 00 (Bruxelles), la semaine est arrêtée d'elle-même. La
// plateforme télécharge un seul fichier SEPA pour tous les versements en
// attente, l'importe dans sa banque, puis marque le lot versé.

// GET /superowner/merchant-payouts - Les relevés de reversement
router.get("/merchant-payouts", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: await MerchantPayoutService.lister({
        status: req.query.status as string | undefined,
        orgId: req.query.orgId as string | undefined,
      }),
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/merchant-payouts/:id - Un relevé de reversement
router.get("/merchant-payouts/:id", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await MerchantPayoutService.detail(req.params.id as string) });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/versements/arreter - Arrêter la semaine écoulée maintenant
router.post("/versements/arreter", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bilan = await MerchantPayoutService.arreterLaSemaine();

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "DRAW_WEEKLY_PAYOUTS",
        target: "all",
        changes: bilan as any,
      },
    });

    res.status(201).json({ success: true, data: bilan });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/versements/sepa - Le lot à verser : total, inclus, écartés
router.get("/versements/sepa", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { xml, ...lot } = await MerchantPayoutService.fichierDesVersements();
    res.json({ success: true, data: { ...lot, pret: Boolean(xml) } });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/versements/sepa.xml - Le fichier à importer dans la banque
router.get("/versements/sepa.xml", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lot = await MerchantPayoutService.fichierDesVersements();
    if (!lot.xml) throw new ApiError(400, "Aucun versement en attente", "NOTHING_TO_PAY");

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "EXPORT_SEPA_FILE",
        target: lot.reference,
        changes: { total: lot.total, nombre: lot.nombre, ecartes: lot.ecartes.length } as any,
      },
    });

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${lot.reference}.xml"`);
    res.send(lot.xml);
  } catch (err) {
    next(err);
  }
});

const lotSchema = z.object({
  commercants: z.array(z.string()).default([]),
  livreurs: z.array(z.string()).default([]),
  reference: z.string().max(100).optional(),
});

// POST /superowner/versements/payer - Marquer le lot importé comme versé
router.post("/versements/payer", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = lotSchema.parse(req.body);
    const bilan = await MerchantPayoutService.payerLeLot(
      { commercants: corps.commercants, livreurs: corps.livreurs },
      { method: "BANK_TRANSFER", reference: corps.reference },
      req.userId as string
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "PAY_SEPA_BATCH",
        target: corps.reference || "sepa",
        changes: bilan as any,
      },
    });

    res.json({ success: true, data: bilan });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/payouts - Les relevés, filtrés par état
router.get("/payouts", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const liste = await DriverPayoutService.lister({
      status: req.query.status as string | undefined,
      driverId: req.query.driverId as string | undefined,
    });

    res.json({
      ...liste,
      // Ce que la plateforme doit et qu'aucun relevé ne porte encore : le
      // chiffre qui n'existait nulle part.
      reste: await DriverPayoutService.resteADevoir(),
      // La période que l'écran propose par défaut, pour ne pas la saisir
      // chaque semaine à la main.
      periodeProposee: semainePrecedente(),
      moyens: MOYENS_VERSEMENT,
    });
  } catch (err) {
    next(err);
  }
});

const arreteSchema = z.object({
  periodStart: z.string().min(1, "Donnez le début de la période"),
  periodEnd: z.string().min(1, "Donnez la fin de la période"),
  driverId: z.string().optional(),
});

// POST /superowner/payouts/draw - Arrêter les relevés d'une période
router.post("/payouts/draw", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = arreteSchema.parse(req.body);
    const debut = new Date(corps.periodStart);
    const fin = new Date(corps.periodEnd);

    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      throw new ApiError(400, "Période illisible", "INVALID_PERIOD");
    }

    const releves = corps.driverId
      ? [await DriverPayoutService.arreter(corps.driverId, debut, fin)]
      : await DriverPayoutService.arreterTous(debut, fin);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "DRAW_DRIVER_PAYOUTS",
        target: corps.driverId || "all",
        changes: { periodStart: debut, periodEnd: fin, releves: releves.length } as any,
      },
    });

    res.status(201).json({
      success: true,
      message:
        releves.length === 0
          ? "Aucune course à payer sur cette période"
          : `${releves.length} relevé${releves.length > 1 ? "s" : ""} arrêté${releves.length > 1 ? "s" : ""}`,
      payouts: releves.length,
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/payouts/:payoutId - Le détail d'un relevé
router.get("/payouts/:payoutId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, payout: await DriverPayoutService.detail(req.params.payoutId as string) });
  } catch (err) {
    next(err);
  }
});

const versementSchema = z.object({
  method: z.string().min(1, "Choisissez un moyen de versement"),
  reference: z.string().optional(),
  note: z.string().optional(),
});

// POST /superowner/payouts/:payoutId/pay - Marquer un relevé versé
router.post("/payouts/:payoutId/pay", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = versementSchema.parse(req.body);
    const releve = await DriverPayoutService.payer(
      req.params.payoutId as string,
      corps,
      req.userId as string
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "PAY_DRIVER_PAYOUT",
        target: releve.id,
        changes: { amount: Number(releve.amount), method: corps.method, reference: corps.reference } as any,
      },
    });

    res.json({ success: true, payout: releve });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/payouts/:payoutId/cancel - Annuler un relevé non versé
router.post("/payouts/:payoutId/cancel", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const releve = await DriverPayoutService.annuler(
      req.params.payoutId as string,
      (req.body?.raison as string) || ""
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "CANCEL_DRIVER_PAYOUT",
        target: releve.id,
        changes: { raison: releve.note } as any,
      },
    });

    res.json({ success: true, payout: releve });
  } catch (err) {
    next(err);
  }
});

export default router;
