import crypto from "crypto";
import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";

const PREFIXE = "sk_live_";

function hacher(cle: string) {
  return crypto.createHash("sha256").update(cle).digest("hex");
}

export class ApiKeyService {
  static async list(limit = 20, offset = 0) {
    const [cles, total] = await Promise.all([
      db.apiKey.findMany({ skip: offset, take: limit, orderBy: { createdAt: "desc" } }),
      db.apiKey.count(),
    ]);

    return {
      keys: cles.map((c) => ({
        id: c.id,
        name: c.name,
        // La clé complète n'existe qu'au moment de sa création.
        key: `${c.prefix}${"•".repeat(24)}`,
        prefix: c.prefix,
        status: c.status,
        lastUsed: c.lastUsedAt,
        createdAt: c.createdAt,
      })),
      pagination: { total, limit, offset },
    };
  }

  static async create(name: string, createdById?: string) {
    const secret = crypto.randomBytes(24).toString("hex");
    const cleComplete = `${PREFIXE}${secret}`;

    const enregistree = await db.apiKey.create({
      data: {
        name,
        prefix: cleComplete.slice(0, 16),
        keyHash: hacher(cleComplete),
        createdById,
      },
    });

    logger.info("API key created", { id: enregistree.id, name });

    return {
      id: enregistree.id,
      name: enregistree.name,
      // Seule occasion où la clé est lisible : elle n'est pas stockée en clair.
      key: cleComplete,
      prefix: enregistree.prefix,
      status: enregistree.status,
      lastUsed: null,
      createdAt: enregistree.createdAt,
    };
  }

  static async revoke(id: string) {
    const cle = await db.apiKey.findUnique({ where: { id } });

    if (!cle) {
      throw new ApiError(404, "Clé introuvable", "NOT_FOUND");
    }

    if (cle.status === "REVOKED") {
      throw new ApiError(400, "Cette clé est déjà révoquée", "ALREADY_REVOKED");
    }

    logger.info("API key revoked", { id });

    return db.apiKey.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  }

  // Utilisable par un futur middleware d'authentification par clé.
  static async verify(cleComplete: string) {
    const cle = await db.apiKey.findUnique({ where: { keyHash: hacher(cleComplete) } });

    if (!cle || cle.status !== "ACTIVE") {
      return null;
    }

    await db.apiKey.update({ where: { id: cle.id }, data: { lastUsedAt: new Date() } });
    return cle;
  }
}
