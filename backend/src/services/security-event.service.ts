import { db } from "./db";
import { logger } from "../config/logger";

type Gravite = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Etat = "SUCCESS" | "FAILED" | "WARNING";

export class SecurityEventService {
  // Journalise sans jamais faire échouer l'action métier qui l'appelle.
  static record(params: {
    action: string;
    actor: string;
    target?: string;
    severity?: Gravite;
    status?: Etat;
    details?: string;
    ipAddress?: string;
  }) {
    db.securityEvent
      .create({
        data: {
          action: params.action,
          actor: params.actor,
          target: params.target || "",
          severity: params.severity || "LOW",
          status: params.status || "SUCCESS",
          details: params.details || "",
          ipAddress: params.ipAddress,
        },
      })
      .catch((err) =>
        logger.error("Security event not recorded", {
          action: params.action,
          error: err instanceof Error ? err.message : err,
        })
      );
  }

  static async list(params: { limit?: number; offset?: number; severity?: string }) {
    const limit = Math.min(params.limit || 20, 100);
    const offset = params.offset || 0;
    const where = params.severity ? { severity: params.severity } : {};

    const [evenements, total, critiques, dernier] = await Promise.all([
      db.securityEvent.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      db.securityEvent.count({ where }),
      db.securityEvent.count({ where: { severity: "CRITICAL" } }),
      db.securityEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    ]);

    return {
      events: evenements.map((e) => ({
        id: e.id,
        action: e.action,
        actor: e.actor,
        target: e.target,
        severity: e.severity,
        status: e.status,
        details: e.details,
        createdAt: e.createdAt,
      })),
      summary: {
        totalEvents: total,
        criticalEvents: critiques,
        lastEvent: dernier?.createdAt || null,
      },
      pagination: { total, limit, offset },
    };
  }
}
