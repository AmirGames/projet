import winston from "winston";
import Transport from "winston-transport";
import { getEnv } from "./env";
import { redact } from "../modules/privacy/redaction";
import type { NextFunction, Request, Response } from "express";

/**
 * La console du serveur, gardée en mémoire pour la page « Console » du
 * superowner : les dernières lignes, sans ouvrir de terminal.
 */
export interface LigneConsole {
  id: number;
  date: string;
  niveau: string;
  message: string;
  meta?: string;
}

const TAILLE_CONSOLE = 2000;
const lignesConsole: LigneConsole[] = [];
let prochainId = 1;

function ajouterLigneConsole(niveau: string, message: string, meta?: Record<string, unknown>) {
  let metaStr: string | undefined;
  if (meta && Object.keys(meta).length > 0) {
    try {
      metaStr = JSON.stringify(redact(meta));
    } catch {
      metaStr = "[meta illisible]";
    }
  }
  lignesConsole.push({ id: prochainId++, date: new Date().toISOString(), niveau, message: redact(String(message)), meta: metaStr });
  if (lignesConsole.length > TAILLE_CONSOLE) lignesConsole.splice(0, lignesConsole.length - TAILLE_CONSOLE);
}

/** Les lignes dont l'id dépasse `apres`, les plus anciennes d'abord. */
export function lireConsole(apres = 0): LigneConsole[] {
  return apres > 0 ? lignesConsole.filter((l) => l.id > apres) : [...lignesConsole];
}

class TransportMemoire extends Transport {
  log(info: Record<string | symbol, unknown> & { level: string; message: string }, callback: () => void) {
    const { level, message, timestamp: _t, ...meta } = info;
    // Les symboles de winston (LEVEL, MESSAGE, SPLAT) ne sont pas des données : le spread les copie.
    for (const cle of Object.getOwnPropertySymbols(meta)) Reflect.deleteProperty(meta, cle);
    ajouterLigneConsole(level, message, meta);
    callback();
  }
}

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
    new TransportMemoire(),
  ];

  if (env.NODE_ENV === "production") {
    transports.push(
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
        format: winston.format.json(),
        maxsize: 5 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: "logs/combined.log",
        format: winston.format.json(),
        maxsize: 5 * 1024 * 1024,
        maxFiles: 10,
      })
    );
  }

  return winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format((info) => { for (const key of Object.keys(info)) info[key] = key === "level" ? info[key] : key === "message" ? redact(info[key]) : redact({ [key]: info[key] })[key]; return info; })(),
    transports,
  });
};

export const logger = createLogger();

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "debug";
    const ligne = `${req.method} ${req.path} ${res.statusCode} (${duration}ms)`;
    logger.log(level, ligne);
    // Toutes les requêtes vont dans la console de la page, même quand le
    // niveau de journalisation masque le « debug » dans le terminal.
    if (level === "debug" && !logger.isDebugEnabled()) ajouterLigneConsole("http", ligne);
  });

  next();
};
