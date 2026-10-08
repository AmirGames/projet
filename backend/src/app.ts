import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { join } from "path";
import { getEnv } from "./config/env";
import { revisionDuBuild } from "./config/revision";
import { requestLogger } from "./config/logger";
import { middlewareOrigine } from "./modules/auth/origine";
import { originesAutorisees as listerOriginesAutorisees } from "./modules/auth/origines-autorisees";
import { setupErrorHandling } from "./middleware/errorHandler";
import { lecteursDeCorps } from "./middleware/corps";
import { maintenanceMiddleware } from "./modules/monitoring/maintenance.middleware";
import { compteRestreint } from "./modules/merchants/compte-restreint.middleware";
import { compteDemo } from "./modules/merchants/compte-demo.middleware";
import { cloisonnement } from "./modules/auth/cloisonnement.middleware";
import { diffusionModifications } from "./modules/realtime/diffusion.middleware";
import { mesurerRequetes } from "./modules/monitoring/surveillance.middleware";
import { limiterCadence, limiterStripeWebhook, limiterApiPublique, limiterAdresses, limiterCartes, limiterWebhookNotificationsDrive } from "./middleware/throttle";
import { Surveillance } from "./modules/monitoring/surveillance.service";
import { Vigie } from "./modules/monitoring/vigie.service";
import authRouter from "./modules/auth/auth.routes";
import filesRouter from "./modules/files/files.routes";
import ssoRouter from "./modules/auth/sso.routes";
import organizationRouter from "./modules/merchants/organization.routes";
import storeRouter from "./modules/stores/store.routes";
import storeSettingsRouter from "./modules/stores/store-settings.routes";
import storeHoursRouter from "./modules/delivery/store-hours.routes";
import deliveryZoneRouter from "./modules/delivery/delivery-zone.routes";
import staffRouter from "./modules/merchants/staff.routes";
import reportsRouter from "./modules/reports/reports.routes";
import productRouter from "./modules/catalog/product.routes";
import categoryRouter from "./modules/catalog/category.routes";
import orderRouter from "./modules/orders/order.routes";
import orderManagementRouter from "./modules/orders/order-management.routes";
import invoiceRouter from "./modules/orders/invoice.routes";
import paymentRouter, { stripeWebhookHandler } from "./modules/payments/payment.routes";
import promotionRouter from "./modules/marketing/promotion.routes";
import customerRouter from "./modules/customers/customer.routes";
import reviewRouter from "./modules/reviews/review.routes";
import marketingRouter from "./modules/marketing/marketing.routes";
import taxRouter from "./modules/catalog/tax.routes";
import paymentMethodRouter from "./modules/payments/payment-method.routes";
import notificationRouter from "./modules/notifications/notification.routes";
import productMediaRouter from "./modules/catalog/product-media.routes";
import productSeoRouter from "./modules/catalog/product-seo.routes";
import productTagRouter from "./modules/catalog/product-tag.routes";
import adminRouter from "./modules/admin/admin.routes";
import superOwnerRouter from "./modules/superowner/superowner.routes";
import pagesLegalesRouter from "./modules/legal/pages-legales.routes";
import clientRouter from "./modules/customers/client.routes";
import mapsRouter from "./modules/maps/maps.routes";
import driversRouter from "./modules/drivers/drivers.routes";
import driversDossierRouter from "./modules/drivers/drivers.dossier.routes";
import driversCoursesRouter from "./modules/drivers/drivers.courses.routes";
import driversOffresRouter from "./modules/drivers/drivers.offres.routes";
import { monterZupDrive } from "./modules/zupdrive/zupdrive-montage";
import { webhookStatutNotification as webhookNotificationsDrive } from "./modules/zupdrive/zupdrive-notifications-webhook";
import notificationsApiRouter from "./modules/notifications/notifications-api.routes";
import paymentMethodsApiRouter from "./modules/payments/payment-methods-api.routes";
import supportRouter from "./modules/support/support.routes";
import plansRouter from "./modules/plans/plans.routes";
import merchantProfileRouter from "./modules/merchants/merchant-profile.routes";
import merchantPayoutRouter from "./modules/payouts/merchant-payout.routes";
import pushDevicesRouter from "./modules/notifications/push-devices.routes";
import variantRouter from "./modules/catalog/variant.routes";
import addressRouter from "./modules/customers/address.routes";
import privacyRouter from "./modules/privacy/privacy.routes";
import { privacyAuditMiddleware } from "./modules/privacy/audit.middleware";
import assistantRouter from "./modules/assistant/routes";

export function createApp(): Express {
  const app = express();
  // Valide la configuration avant de monter quoi que ce soit.
  getEnv();

  // ===== Proxy =====
  // Derrière un proxy (Caddy sur le VPS), `req.ip` rendait l'adresse du
  // proxy : toutes les requêtes semblaient venir du même visiteur, et le
  // limiteur de cadence les bloquait ensemble. TRUST_PROXY donne le nombre de
  // proxys à traverser pour retrouver l'adresse du visiteur (1 avec Caddy).
  // Vide : on n'en croit aucun, un en-tête X-Forwarded-For se forge.
  const proxysDeConfiance = Number(process.env.TRUST_PROXY);
  const proxysAutorises = (process.env.TRUST_PROXY_CIDRS || "").split(",").map(p => p.trim()).filter(Boolean);
  if (proxysAutorises.length) {
    app.set("trust proxy", proxysAutorises);
  } else if (Number.isInteger(proxysDeConfiance) && proxysDeConfiance > 0) {
    app.set("trust proxy", proxysDeConfiance);
  }

  // ===== Security =====
  app.use(helmet());

  // ===== CORS =====
  // Le site est servi depuis deux domaines (public et professionnel) : l'API
  // doit répondre aux deux. ALLOWED_ORIGINS les ajoute, séparés par des
  // virgules, sans toucher au code.
  const originesAutorisees = listerOriginesAutorisees();

  app.use(
    cors({
      origin: originesAutorisees,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      // Idempotency-Key : le site l'envoie avec chaque commande (voir order.routes) ;
      // sans lui dans cette liste, le préflight échouait et le navigateur ne
      // postait jamais la commande depuis un domaine autre que celui de l'API.
      allowedHeaders: ["Content-Type", "Authorization", "X-Refresh-Transport", "Idempotency-Key"],
    })
  );

  // ===== Surveillance =====
  // Au plus tôt : toute requête compte, webhook Stripe compris.
  app.use(mesurerRequetes);

  // ===== Webhook Stripe =====
  // Avant le lecteur JSON : Stripe signe le corps brut, et une fois relu en
  // objet il ne se vérifie plus. Avant aussi la maintenance et les verrous de
  // compte : un encaissement doit être noté quoi qu'il arrive au site.
  app.post("/api/payments/webhook", limiterStripeWebhook, express.raw({ type: "application/json" }), stripeWebhookHandler);

  // ===== Webhook d'accusés de notification ZupDrive =====
  // Même raison que Stripe : la signature HMAC porte sur le corps brut.
  app.post(
    "/api/zupdrive/notifications/webhooks/status",
    limiterWebhookNotificationsDrive,
    express.raw({ type: "application/json" }),
    webhookNotificationsDrive
  );

  // ===== Body parsing =====
  app.use(lecteursDeCorps);

  // ===== Logging =====
  app.use(requestLogger);

  // D'où vient la requête, retenu le temps du traitement : les journaux le
  // lisent au moment d'écrire, sans que chaque appelant ait à le transmettre.
  app.use(middlewareOrigine);

  // ===== Health check =====
  // Vivant : le processus répond. Ne touche à rien d'autre, pour qu'un
  // orchestrateur ne redémarre pas le serveur parce que la base est tombée.
  // `revision` : le commit construit dans l'image (GIT_SHA, posé au build par
  // deploy/zup.sh). Sans lui, les sondes disent que le service répond mais pas
  // quel correctif tourne.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", revision: revisionDuBuild(), timestamp: new Date().toISOString() });
  });

  // Prêt : le serveur peut réellement servir (la base répond). C'est l'adresse
  // à donner à une sonde externe (UptimeRobot, Better Stack, répartiteur de
  // charge) : 503 dès que la base est injoignable.
  app.get("/health/ready", async (_req, res) => {
    const etat = await Vigie.pret();
    res.status(etat.pret ? 200 : 503).json({
      status: etat.pret ? "ok" : "unavailable",
      revision: revisionDuBuild(),
      ...etat,
      timestamp: new Date().toISOString(),
    });
  });

  // Les erreurs survenues dans le navigateur des visiteurs. Avant le mode
  // maintenance et les verrous de compte : une page qui plante doit se savoir
  // quel que soit l'état du compte ou du site.
  app.post(
    "/api/monitoring/client-errors",
    limiterCadence({
      max: 30,
      fenetreMs: 60_000,
      cle: (req) => `erreurs-navigateur|${req.ip}`,
      message: "Trop d'erreurs signalées",
    }),
    (req, res) => {
      const corps = req.body || {};
      const texte = (valeur: unknown, max: number) =>
        typeof valeur === "string" && valeur.trim() ? valeur.slice(0, max) : undefined;

      const message = texte(corps.message, 500);
      const page = texte(corps.page, 300);
      if (!message || !page) {
        return res.status(400).json({ error: "message et page sont requis" });
      }

      Surveillance.erreurNavigateur({
        message,
        page,
        source: texte(corps.source, 300),
        pile: texte(corps.pile, 4000),
        navigateur: texte(req.get("user-agent"), 300),
        // Rapports de la CSP, relayés par le site (frontend/app/api/csp-report).
        csp: corps.categorie === "csp",
      });

      return res.status(204).end();
    }
  );

  // ===== Mode maintenance =====
  // Placé avant les routes métier : seuls la connexion et l'administration
  // restent joignables quand il est actif.
  app.use(maintenanceMiddleware);

  // Un compte suspendu ou fermé n'a plus accès qu'au support. Le verrou est
  // posé ici, devant toutes les routes, et non route par route : il n'en
  // protégeait que trois.
  app.use(compteRestreint);
  app.use(compteDemo);

  // Chacun chez soi : presque toutes les routes acceptaient un storeId sans
  // vérifier qu'il appartenait à l'appelant. Le verrou est posé ici, devant
  // toutes les routes, et non route par route : deux routeurs sur vingt-cinq
  // faisaient le contrôle.
  app.use(cloisonnement);
  app.use(privacyAuditMiddleware);

  // Après chaque écriture réussie, les écrans concernés sont prévenus et se
  // relisent : le site suit en direct sans recharger.
  app.use(diffusionModifications);

  // ===== Static files (uploads) =====
  // Seuls les visuels des boutiques (logos, bannières) sont publics. Permis,
  // RIB, pièces des commerçants et photos de dépôt ne sortent que par
  // /api/files, avec une session ou une adresse signée : servis ici, il
  // suffisait de leur adresse pour les lire.
  const uploadsDir = join(process.cwd(), "uploads");
  app.use("/uploads/stores", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", originesAutorisees.includes(req.get("origin") || "") ? req.get("origin") : originesAutorisees[0]);
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    res.vary("Origin");
    // Helmet réserve les fichiers à la même origine : le site, servi sur un
    // autre port ou un autre domaine, ne pouvait pas afficher un logo dans une
    // balise <img>.
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    return next();
  }, express.static(join(uploadsDir, "stores")));
  app.use("/uploads", (_req, res) => {
    res.status(404).json({ error: "Fichier introuvable", code: "FILE_NOT_FOUND" });
  });

  // Budget commun : couvre aussi les endpoints publics ajoutés aux routeurs.
  app.use("/api", limiterApiPublique);

  // ===== API Routes =====
  app.use("/api/auth", authRouter);
  app.use("/api/privacy", privacyRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/sso", ssoRouter);
  app.use("/api/organizations", organizationRouter);
  app.use("/api/stores", storeRouter);
  app.use("/api/store-settings", storeSettingsRouter);
  app.use("/api/store-hours", storeHoursRouter);
  app.use("/api/delivery-zones", deliveryZoneRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/reports", reportsRouter);
  // Monté avant le routeur des produits : ses chemins sont plus précis et
  // doivent être essayés en premier.
  app.use("/api/products", variantRouter);
  app.use("/api/products", productRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/order-management", orderManagementRouter);
  app.use("/api/invoices", invoiceRouter);
  app.use("/api/customers", customerRouter);
  app.use("/api/reviews", reviewRouter);
  app.use("/api/marketing", marketingRouter);
  app.use("/api/tax-settings", taxRouter);
  // Les cartes du client d'abord : sinon POST /setup-intent serait lu comme
  // POST /:storeId du routeur des boutiques.
  app.use("/api/payment-methods", paymentMethodsApiRouter);
  app.use("/api/payment-methods", paymentMethodRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/promotions", promotionRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/product-media", productMediaRouter);
  app.use("/api/product-seo", productSeoRouter);
  app.use("/api/product-tags", productTagRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/superowner", superOwnerRouter);
  app.use("/api/pages-legales", pagesLegalesRouter);
  app.use("/api/client", clientRouter);
  app.use("/api/maps", limiterCartes, mapsRouter);
  // Un seul préfixe, quatre routeurs par sujet : leurs chemins ne se recoupent pas.
  app.use("/api/drivers", driversRouter);
  app.use("/api/drivers", driversDossierRouter);
  app.use("/api/drivers", driversCoursesRouter);
  app.use("/api/drivers", driversOffresRouter);
  monterZupDrive(app);
  app.use("/api/notifications", notificationsApiRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/assistant", assistantRouter);
  app.use("/api/plans", plansRouter);
  app.use("/api/merchant-profile", merchantProfileRouter);
  app.use("/api/merchant-payouts", merchantPayoutRouter);
  app.use("/api/push-devices", pushDevicesRouter);
  app.use("/api/addresses", limiterAdresses, addressRouter);

  // ===== Error handling (must be last) =====
  setupErrorHandling(app);

  return app;
}
