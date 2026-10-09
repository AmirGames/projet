import { Router } from "express";
import dashboardRouter from "./dashboard.routes";
import monitoringAdminRouter_monitoring from "../monitoring/monitoring.admin.routes";
import merchantsAdminRouter_merchants from "../merchants/merchants.admin.routes";
import billingRouter from "./billing.routes";
import platformInvoiceRouter from "./platform-invoice.routes";
import configRouter from "./config.routes";
import securityAdminRouter_auth from "../auth/security.admin.routes";
import webhooksRouter from "./webhooks.routes";
import supportRouter from "./support.routes";
import plansRouter from "./plans.routes";
import analyticsRouter from "./analytics.routes";
import driversAdminRouter_drivers from "../drivers/drivers.admin.routes";
import driversIncidentsAdminRouter_drivers from "../drivers/drivers.incidents.admin.routes";
import storesAdminRouter_stores from "../stores/stores.admin.routes";
import payoutsAdminRouter_payouts from "../payouts/payouts.admin.routes";
import teamAdminRouter_auth from "../auth/team.admin.routes";
import membersRouter from "./members.routes";
import reviewsAdminRouter_reviews from "../reviews/reviews.admin.routes";
import paymentsAdminRouter_payments from "../payments/payments.admin.routes";
import pagesLegalesRouter from "./pages-legales.routes";

// L'espace superowner : chaque sous-routeur vit dans son module et partage le préfixe /api/superowner.
const router = Router();

router.use(dashboardRouter);
router.use(monitoringAdminRouter_monitoring);
router.use(merchantsAdminRouter_merchants);
router.use(billingRouter);
router.use(platformInvoiceRouter);
router.use(configRouter);
router.use(securityAdminRouter_auth);
router.use(webhooksRouter);
router.use(supportRouter);
router.use(plansRouter);
router.use(analyticsRouter);
router.use(driversAdminRouter_drivers);
router.use(driversIncidentsAdminRouter_drivers);
router.use(storesAdminRouter_stores);
router.use(payoutsAdminRouter_payouts);
router.use(teamAdminRouter_auth);
router.use(membersRouter);
router.use(reviewsAdminRouter_reviews);
router.use(paymentsAdminRouter_payments);
router.use(pagesLegalesRouter);

export default router;
