import winston from "winston";
import { getEnv } from "./env";

const colors = {
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
  debug: "\x1b[35m",
  reset: "\x1b[0m",
};

const createLogger = () => {
  const env = getEnv();

  const format = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const color = colors[level as keyof typeof colors] || colors.info;
      const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : "";
      return `${color}[${timestamp}] ${level.toUpperCase()}${colors.reset} ${message} ${metaStr}`;
    })
  );

  const transports: winston.transport[] = [
    new winston.transports.Console({ format }),
  ];

  if (env.NODE_ENV === "production") {
    transports.push(
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
        format: winston.format.json(),
      }),
      new winston.transports.File({
        filename: "logs/combined.log",
        format: winston.format.json(),
      })
    );
  }

  return winston.createLogger({
    level: env.LOG_LEVEL,
    transports,
  });
};

export const logger = createLogger();

export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "debug";
    logger.log(level, `${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
  });

  next();
};
