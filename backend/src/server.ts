import 'dotenv/config';
import { loadEnv, getEnv } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { db } from "./services/db.js";

// Load environment variables
const env = loadEnv();

// Create Express app
const app = createApp();

// Start server
const start = async () => {
  try {
    // Test database connection
    logger.info("Testing database connection...");
    const result = db.prepare("SELECT 1").all();
    logger.info("✅ Database connected");

    // Start listening
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
      logger.info(`📝 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 Frontend: ${env.FRONTEND_URL}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info("Shutting down gracefully...");
      server.close(() => {
        logger.info("Server closed");
      });
      db.close();
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