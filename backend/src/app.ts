import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { join } from "path";
import { getEnv } from "./config/env";
import { requestLogger } from "./config/logger";
import { middlewareOrigine } from "./config/origine";
import { setupErrorHandling } from "./middleware/errorHandler";
import { maintenanceMiddleware } from "./middleware/maintenance";
import { compteRestreint } from "./middleware/compte-restreint";
import { cloisonnement } from "./middleware/cloisonnement";
import { diffusionModifications } from "./middleware/diffusion";
import authRouter from "./routes/auth";
import organizationRouter from "./routes/organization";
import storeRouter from "./routes/store";
import storeSettingsRouter from "./routes/store-settings";
import storeHoursRouter from "./routes/store-hours";
import deliveryZoneRouter from "./routes/delivery-zone";
import staffRouter from "./routes/staff";
import reportsRouter from "./routes/reports";
import productRouter from "./routes/product";
import categoryRouter from "./routes/category";
import orderRouter from "./routes/order";
import orderManagementRouter from "./routes/order-management";
import invoiceRouter from "./routes/invoice";
import paymentRouter from "./routes/payment";
import promotionRouter from "./routes/promotion";
import customerRouter from "./routes/customer";
import reviewRouter from "./routes/review";
import marketingRouter from "./routes/marketing";
import taxRouter from "./routes/tax";
import paymentMethodRouter from "./routes/payment-method";
import notificationRouter from "./routes/notification";
import productMediaRouter from "./routes/product-media";
import productSeoRouter from "./routes/product-seo";
import productTagRouter from "./routes/product-tag";
import adminRouter from "./routes/admin";
import superAdminRouter from "./routes/super-admin";
import superOwnerRouter from "./routes/superowner";
import clientRouter from "./routes/client";
import mapsRouter from "./routes/maps";
import driversRouter from "./routes/drivers";
import notificationsApiRouter from "./routes/notifications-api";
import paymentMethodsApiRouter from "./routes/payment-methods-api";
import supportRouter from "./routes/support";
import plansRouter from "./routes/plans";
import merchantProfileRouter from "./routes/merchant-profile";
import pushDevicesRouter from "./routes/push-devices";
import variantRouter from "./routes/variant";
import addressRouter from "./routes/address";

export function createApp(): Express {
  const app = express();
  const env = getEnv();

  // ===== Security =====
  app.use(helmet());

  // ===== CORS =====
  // Le site est servi depuis deux domaines (public et professionnel) : l'API
  // doit répondre aux deux. ALLOWED_ORIGINS les ajoute, séparés par des
  // virgules, sans toucher au code.
  const originesSupplementaires = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origine) => origine.trim())
    .filter(Boolean);

  const originesAutorisees = Array.from(
    new Set([env.FRONTEND_URL, "http://localhost:3000", ...originesSupplementaires])
  );

  app.use(
    cors({
      origin: originesAutorisees,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // ===== Body parsing =====
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ===== Logging =====
  app.use(requestLogger);

  // D'où vient la requête, retenu le temps du traitement : les journaux le
  // lisent au moment d'écrire, sans que chaque appelant ait à le transmettre.
  app.use(middlewareOrigine);

  // ===== Health check =====
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ===== Mode maintenance =====
  // Placé avant les routes métier : seuls la connexion et l'administration
  // restent joignables quand il est actif.
  app.use(maintenanceMiddleware);

  // Un compte suspendu ou fermé n'a plus accès qu'au support. Le verrou est
  // posé ici, devant toutes les routes, et non route par route : il n'en
  // protégeait que trois.
  app.use(compteRestreint);

  // Chacun chez soi : presque toutes les routes acceptaient un storeId sans
  // vérifier qu'il appartenait à l'appelant. Le verrou est posé ici, devant
  // toutes les routes, et non route par route : deux routeurs sur vingt-cinq
  // faisaient le contrôle.
  app.use(cloisonnement);

  // Après chaque écriture réussie, les écrans concernés sont prévenus et se
  // relisent : le site suit en direct sans recharger.
  app.use(diffusionModifications);

  // ===== Static files (uploads) =====
  const uploadsDir = join(process.cwd(), "uploads");
  app.use("/uploads", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", originesAutorisees.includes(req.get("origin") || "") ? req.get("origin") : originesAutorisees[0]);
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    // Helmet réserve les fichiers à la même origine : le site, servi sur un
    // autre port ou un autre domaine, ne pouvait pas afficher une photo de
    // dépôt dans une balise <img>.
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    return next();
  }, express.static(uploadsDir));

  // ===== API Routes =====
  app.use("/api/auth", authRouter);
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
  app.use("/api/payment-methods", paymentMethodRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/promotions", promotionRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/product-media", productMediaRouter);
  app.use("/api/product-seo", productSeoRouter);
  app.use("/api/product-tags", productTagRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/superowner", superOwnerRouter);
  app.use("/api/client", clientRouter);
  app.use("/api/maps", mapsRouter);
  app.use("/api/drivers", driversRouter);
  app.use("/api/notifications", notificationsApiRouter);
  app.use("/api/payment-methods", paymentMethodsApiRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/plans", plansRouter);
  app.use("/api/merchant-profile", merchantProfileRouter);
  app.use("/api/push-devices", pushDevicesRouter);
  app.use("/api/addresses", addressRouter);

  // ===== Error handling (must be last) =====
  setupErrorHandling(app);

  return app;
}