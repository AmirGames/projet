import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { getEnv } from "./config/env.js";
import { requestLogger } from "./config/logger.js";
import { setupErrorHandling } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import organizationRouter from "./routes/organization.js";
import storeRouter from "./routes/store.js";
import storeSettingsRouter from "./routes/store-settings.js";
import storeHoursRouter from "./routes/store-hours.js";
import deliveryZoneRouter from "./routes/delivery-zone.js";
import staffRouter from "./routes/staff.js";
import reportsRouter from "./routes/reports.js";
import productRouter from "./routes/product.js";
import categoryRouter from "./routes/category.js";
import orderRouter from "./routes/order.js";
import orderManagementRouter from "./routes/order-management.js";
import invoiceRouter from "./routes/invoice.js";
import paymentRouter from "./routes/payment.js";
import promotionRouter from "./routes/promotion.js";
import customerRouter from "./routes/customer.js";
import reviewRouter from "./routes/review.js";
import marketingRouter from "./routes/marketing.js";
import taxRouter from "./routes/tax.js";
import paymentMethodRouter from "./routes/payment-method.js";
import adminRouter from "./routes/admin.js";
import superAdminRouter from "./routes/super-admin.js";
import superOwnerRouter from "./routes/superowner.js";

export function createApp(): Express {
  const app = express();
  const env = getEnv();

  // ===== Security =====
  app.use(helmet());

  // ===== CORS =====
  app.use(
    cors({
      origin: [env.FRONTEND_URL, "http://localhost:3000"],
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

  // ===== Health check =====
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ===== API Routes =====
  app.use("/api/auth", authRouter);
  app.use("/api/organizations", organizationRouter);
  app.use("/api/stores", storeRouter);
  app.use("/api/store-settings", storeSettingsRouter);
  app.use("/api/store-hours", storeHoursRouter);
  app.use("/api/delivery-zones", deliveryZoneRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/reports", reportsRouter);
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
  app.use("/api/admin", adminRouter);
  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/superowner", superOwnerRouter);

  // ===== Error handling (must be last) =====
  setupErrorHandling(app);

  return app;
}