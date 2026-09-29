import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../auth/auth.middleware";
import { isSuperOwner } from "./shared";
import { PlatformInvoiceService, moisPrecedent } from "../invoicing/platform-invoice.service";

const router = Router();

// GET /superowner/platform-invoices - Les factures Peppol émises aux commerçants
router.get("/platform-invoices", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ invoices: await PlatformInvoiceService.lister(req.query.orgId as string | undefined) });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/platform-invoices/overview?period=AAAA-MM - L'état de chaque commerçant pour un mois
router.get("/platform-invoices/overview", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await PlatformInvoiceService.apercu((req.query.period as string) || moisPrecedent()));
  } catch (err) {
    next(err);
  }
});

// POST /superowner/platform-invoices/issue-month { period } - Émet tout ce qui est facturable
router.post("/platform-invoices/issue-month", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await PlatformInvoiceService.emettreLeMois(String(req.body?.period || moisPrecedent())));
  } catch (err) {
    next(err);
  }
});

// POST /superowner/billing/:orgId/invoice { period } - Émet la facture d'un mois écoulé
router.post("/billing/:orgId/invoice", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const facture = await PlatformInvoiceService.emettre(req.params.orgId as string, String(req.body?.period || ""));
    const { ublXml: _xml, ...sansXml } = facture;
    res.status(201).json(sansXml);
  } catch (err) {
    next(err);
  }
});

// GET /superowner/platform-invoices/:id/ubl - Le XML Peppol BIS 3.0, à télécharger
router.get("/platform-invoices/:id/ubl", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const facture = await PlatformInvoiceService.obtenir(req.params.id as string);
    res
      .type("application/xml")
      .set("Content-Disposition", `attachment; filename="${facture.number}.xml"`)
      .send(facture.ublXml);
  } catch (err) {
    next(err);
  }
});

// POST /superowner/platform-invoices/:id/send - Remet la facture à l'Access Point
router.post("/platform-invoices/:id/send", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const facture = await PlatformInvoiceService.envoyer(req.params.id as string);
    const { ublXml: _xml, ...sansXml } = facture;
    res.json(sansXml);
  } catch (err) {
    next(err);
  }
});

export default router;
