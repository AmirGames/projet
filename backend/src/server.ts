import 'dotenv/config';
import http from 'http';
import { loadEnv } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { initializeSocket } from "./config/socket.js";
import { db } from "./services/db.js";

// Load environment variables
const env = loadEnv();

// Create Express app
const app = createApp();

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Start server
const start = async () => {
  try {
    // Test database connection
    logger.info("Testing database connection...");
    await db.$queryRaw`SELECT 1`;
    logger.info("✅ Database connected");

    // Start listening
    httpServer.listen(env.PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
      logger.info(`📝 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 Frontend: ${env.FRONTEND_URL}`);
      logger.info(`🔌 WebSocket enabled`);
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info("Shutting down gracefully...");
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