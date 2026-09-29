import 'dotenv/config';
import http from 'http';
import { loadEnv } from "./config/env";
import { logger } from "./config/logger";
import { createApp } from "./app";
import { initializeSocket, brancherRedis } from "./modules/realtime/socket";
import { brancherAnnoncesCommandes } from "./modules/realtime/diffusion.middleware";
import { db } from "./services/db";
import { ClosureJobs } from "./modules/merchants/closure.jobs";
import { DispatchJobs } from "./modules/drivers/dispatch.jobs";
import { OrderJobs } from "./modules/orders/order.jobs";
import { DriverJobs } from "./modules/drivers/driver.jobs";
import { WebhookJobs } from "./modules/webhooks/webhook.jobs";
import { MerchantJobs } from "./modules/merchants/merchant.jobs";
import { DemoJobs } from "./modules/merchants/demo.jobs";
import { PayoutJobs } from "./modules/payouts/payout.jobs";
import { PlatformInvoiceJobs } from "./modules/invoicing/platform-invoice.jobs";
import { Vigie } from "./modules/monitoring/vigie.service";
import { Disponibilite } from "./modules/monitoring/disponibilite.service";
import { amorcerSuperowner } from "./modules/auth/amorcer-superowner.service";

// Load environment variables
const env = loadEnv();

// Create Express app
const app = createApp();

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Toute écriture sur une commande, même hors requête (tâches de fond), est
// annoncée aux écrans qui la montrent.
brancherAnnoncesCommandes();

// Start server
const start = async () => {
  try {
    // Test database connection
    logger.info("Testing database connection...");
    await db.$queryRaw`SELECT 1`;
    logger.info("✅ Database connected");

    // Base vide : le premier superowner naît ici et reçoit son lien par courriel.
    await amorcerSuperowner();

    // Avant d'écouter : un événement émis entre-temps n'atteindrait que les
    // connexions de cette instance.
    await brancherRedis();

    // Start listening
    httpServer.listen(env.PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
      logger.info(`📝 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 Frontend: ${env.FRONTEND_URL}`);
      logger.info(`🔌 WebSocket enabled`);
    });

    // Start background jobs
    ClosureJobs.startJobs();
    DispatchJobs.start();
    DriverJobs.start();
    WebhookJobs.start();
    MerchantJobs.start();
    DemoJobs.start();
    PayoutJobs.start();
    PlatformInvoiceJobs.start();
    OrderJobs.start();

    // Après les tâches : la vigie les surveille dès son premier passage.
    Vigie.demarrer();
    Disponibilite.demarrer();

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info("Shutting down gracefully...");
      ClosureJobs.stopJobs();
      DispatchJobs.stop();
      WebhookJobs.stop();
      MerchantJobs.stop();
      DemoJobs.stop();
      PayoutJobs.stop();
      PlatformInvoiceJobs.stop();
      OrderJobs.stop();
      DriverJobs.stop();
      Vigie.arreter();
      Disponibilite.arreter();
      httpServer.close(() => {
        logger.info("Server closed");
      });
      await db.$disconnect();
      logger.info("Database disconnected");
      process.exit(0);
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
  } catch (err) {
    logger.error("Failed to start server", err instanceof Error ? { message: err.message } : err);
    process.exit(1);
  }
};

start();