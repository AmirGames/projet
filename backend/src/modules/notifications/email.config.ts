import nodemailer from "nodemailer";
import { logger } from "../../config/logger";

const emailConfig = {
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "1025"),
  secure: process.env.SMTP_SECURE === "true",
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        }
      : undefined,
  // Délais courts : par défaut, nodemailer patiente deux minutes avant de
  // renoncer à un serveur qui ne répond pas. Un SMTP en panne doit échouer
  // vite, pour que l'échec soit journalisé sans laisser traîner l'envoi.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
};

export const emailTransporter = nodemailer.createTransport(emailConfig);

// Verify connection on startup
emailTransporter.verify((err, success) => {
  if (err) {
    logger.warn("Email transporter not verified (OK for dev mode)", { error: err });
  } else {
    logger.info("✅ Email transporter verified", { success });
  }
});

export const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || "noreply@zupeat.com",
  siteUrl: process.env.SITE_URL || "http://localhost:3000",
};