import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { getEnv } from "./config/env.js";
import { requestLogger } from "./config/logger.js";
import { setupErrorHandling } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import organizationRouter from "./routes/organization.js";
import storeRouter from "./routes/store.js";
import storeHoursRouter from "./routes/store-hours.js";
import productRouter from "./routes/product.js";
import categoryRouter from "./routes/category.js";
import orderRouter from "./routes/order.js";
import paymentRouter from "./routes/payment.js";
import promotionRouter from "./routes/promotion.js";
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
  app.use("/api/store-hours", storeHoursRouter);
  app.use("/api/products", productRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/promotions", promotionRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/superowner", superOwnerRouter);

  // ===== Error handling (must be last) =====
  setupErrorHandling(app);

  return app;
}