import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { getEnv } from "./config/env.js";
import { logger, requestLogger } from "./config/logger.js";
import { setupErrorHandling } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import organizationRouter from "./routes/organization.js";
import storeRouter from "./routes/store.js";
import productRouter from "./routes/product.js";
import categoryRouter from "./routes/category.js";
import orderRouter from "./routes/order.js";
import paymentRouter from "./routes/payment.js";

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
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ===== API Routes =====
  app.use("/api/auth", authRouter);
  app.use("/api/organizations", organizationRouter);
  app.use("/api/stores", storeRouter);
  app.use("/api/products", productRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/payments", paymentRouter);

  // ===== Error handling (must be last) =====
  setupErrorHandling(app);

  return app;
}