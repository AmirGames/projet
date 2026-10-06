import 'dotenv/config';
import http from 'http';
import { loadEnv } from "./config/env";
import { logger } from "./config/logger";
import { createApp } from "./app";
import { initializeSocket, brancherRedis } from "./modules/realtime/socket";
import { brancherAnnoncesCommandes } from "./modules/realtime/diffusion.middleware";
import { db } from "./services/db";
import { Leader } from "./modules/jobs/leader.service";
import { OutboxJobs } from "./modules/jobs/outbox.jobs";
import { declarerGestionnairesOutbox } from "./modules/notifications/outbox-handlers";
import { ClosureJobs } from "./modules/merchants/closure.jobs";
import { DispatchJobs } from "./modules/drivers/dispatch.jobs";
import { OrderJobs } from "./modules/orders/order.jobs";
import { DriverJobs } from "./modules/drivers/driver.jobs";
import { WebhookJobs } from "./modules/webhooks/webhook.jobs";
import { MerchantJobs } from "./modules/merchants/merchant.jobs";
import { ChauffeurJobs } from "./modules/zupdrive/chauffeur.jobs";
import { CourseDriveJobs } from "./modules/zupdrive/course-drive.jobs";
import { DemoJobs } from "./modules/merchants/demo.jobs";
import { PayoutJobs } from "./modules/payouts/payout.jobs";
import { PlatformInvoiceJobs } from "./modules/invoicing/platform-invoice.jobs";
import { Vigie } from "./modules/monitoring/vigie.service";
import { Disponibilite } from "./modules/monitoring/disponibilite.service";
import { amorcerSuperowner } from "./modules/auth/amorcer-superowner.service";
import { PrivacyJobs } from "./modules/privacy/privacy.jobs";
import { purgeAssistantConversations } from "./modules/assistant/retention";

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

    // Les messages en file (e-mails à ne pas perdre) : chaque type sait comment
    // s'envoyer. Déclaré sur toutes les instances ; seul le leader fait tourner
    // le worker.
    declarerGestionnairesOutbox();

    // Tâches de fond : une seule instance les lance (voir jobs/leader.service.ts).
    // Avec une instance unique, elle obtient le bail aussitôt : rien ne change.
    const lancerLesTaches = () => {
      ClosureJobs.startJobs();
      DispatchJobs.start();
      DriverJobs.start();
      WebhookJobs.start();
      MerchantJobs.start();
      ChauffeurJobs.start();
      CourseDriveJobs.start();
      DemoJobs.start();
      PayoutJobs.start();
      PlatformInvoiceJobs.start();
      OrderJobs.start();
      PrivacyJobs.start();
      OutboxJobs.start();

      // Après les tâches : la vigie les surveille dès son premier passage.
      Vigie.demarrer();
      Disponibilite.demarrer();
    };
    const arreterLesTaches = () => {
      ClosureJobs.stopJobs();
      DispatchJobs.stop();
      WebhookJobs.stop();
      MerchantJobs.stop();
      ChauffeurJobs.stop();
      CourseDriveJobs.stop();
      DemoJobs.stop();
      PayoutJobs.stop();
      PlatformInvoiceJobs.stop();
      OrderJobs.stop();
      PrivacyJobs.stop();
      DriverJobs.stop();
      OutboxJobs.stop();
      Vigie.arreter();
      Disponibilite.arreter();
    };
    Leader.demarrer({ gagne: lancerLesTaches, perdu: arreterLesTaches });

    const assistantRetention = setInterval(() => {
      void purgeAssistantConversations().catch(() => logger.warn("Assistant retention unavailable"));
    }, 3600000);
    assistantRetention.unref();

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info("Shutting down gracefully...");
      clearInterval(assistantRetention);
      arreterLesTaches();
      await Leader.arreter();
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
