import { Router, Request, Response, NextFunction } from "express";
import { MerchantPayoutService } from "./merchant-payout.service";
import { PayoutBatchService } from "./payout-batch.service";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
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
        changes: bilan,
      },
    });

    res.status(201).json({ success: true, data: bilan });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/versements/sepa - Aperçu de ce qu'un lot figerait maintenant
router.get("/versements/sepa", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await MerchantPayoutService.fichierDesVersements() });
  } catch (err) {
    next(err);
  }
});

// ─── Lots bancaires ─────────────────────────────────────────────────────────
//
// Préparer (fige IBAN et montants) → approuver (mot de passe redemandé) →
// exporter le fichier → transmettre à la banque → confirmer (ou rejeter).
// Chaque étape est journalisée ; un relevé n'est que dans un seul lot actif.

const journaliserLot = (req: Request, action: string, cible: string, changes: object = {}) =>
  db.systemAuditLog.create({
    data: { adminId: req.userId as string, action, target: cible, changes: changes },
  });

// GET /superowner/versements/lots - Les derniers lots
router.get("/versements/lots", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: { actif: await PayoutBatchService.actif(), lots: await PayoutBatchService.lister() } });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/versements/lots - Préparer un lot
router.post("/versements/lots", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lot, ecartes } = await PayoutBatchService.preparer(req.userId as string);
    await journaliserLot(req, "PAYOUT_BATCH_PREPARED", lot.reference, { id: lot.id, total: lot.total, nombre: lot.itemCount, ecartes: ecartes.length });
    res.status(201).json({ success: true, data: { lot, ecartes } });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/versements/lots/:id - Le détail d'un lot
router.get("/versements/lots/:id", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await PayoutBatchService.detail(req.params.id as string) });
  } catch (err) {
    next(err);
  }
});

const approbationSchema = z.object({ motDePasse: z.string().min(1).max(200) });

// POST /superowner/versements/lots/:id/approuver - Approuver (réauthentification)
router.post("/versements/lots/:id/approuver", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { motDePasse } = approbationSchema.parse(req.body);
    const lot = await PayoutBatchService.approuver(req.params.id as string, req.userId as string, motDePasse);
    await journaliserLot(req, "PAYOUT_BATCH_APPROVED", lot.reference, { id: lot.id });
    res.json({ success: true, data: { id: lot.id, status: lot.status } });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/versements/lots/:id/sepa.xml - Le fichier à importer dans la banque
router.get("/versements/lots/:id/sepa.xml", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference, xml } = await PayoutBatchService.exporter(req.params.id as string, req.userId as string);
    await journaliserLot(req, "PAYOUT_BATCH_EXPORTED", reference, { id: req.params.id });
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${reference}.xml"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

// POST /superowner/versements/lots/:id/transmettre - Importé et signé à la banque
router.post("/versements/lots/:id/transmettre", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lot = await PayoutBatchService.transmettre(req.params.id as string, req.userId as string);
    await journaliserLot(req, "PAYOUT_BATCH_SUBMITTED", lot.reference, { id: lot.id });
    res.json({ success: true, data: { id: lot.id, status: lot.status } });
  } catch (err) {
    next(err);
  }
});

const confirmationSchema = z.object({ reference: z.string().max(100).optional() });

// POST /superowner/versements/lots/:id/confirmer - La banque a exécuté le lot
router.post("/versements/lots/:id/confirmer", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference } = confirmationSchema.parse(req.body);
    const bilan = await PayoutBatchService.confirmer(req.params.id as string, req.userId as string, reference);
    await journaliserLot(req, "PAYOUT_BATCH_CONFIRMED", req.params.id as string, bilan);
    res.json({ success: true, data: bilan });
  } catch (err) {
    next(err);
  }
});

const raisonSchema = z.object({ raison: z.string().max(500).optional() });

// POST /superowner/versements/lots/:id/rejeter - Refusé par la banque
router.post("/versements/lots/:id/rejeter", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { raison } = raisonSchema.parse(req.body);
    await PayoutBatchService.rejeter(req.params.id as string, req.userId as string, raison || "Refusé par la banque");
    await journaliserLot(req, "PAYOUT_BATCH_REJECTED", req.params.id as string, { raison });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/versements/lots/:id/annuler - Abandon avant export
router.post("/versements/lots/:id/annuler", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { raison } = raisonSchema.parse(req.body);
    await PayoutBatchService.annuler(req.params.id as string, req.userId as string, raison);
    await journaliserLot(req, "PAYOUT_BATCH_CANCELLED", req.params.id as string, { raison });
    res.json({ success: true });
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
        changes: { periodStart: debut, periodEnd: fin, releves: releves.length },
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
        changes: { amount: Number(releve.amount), method: corps.method, reference: corps.reference },
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
        changes: { raison: releve.note },
      },
    });

    res.json({ success: true, payout: releve });
  } catch (err) {
    next(err);
  }
});

export default router;
