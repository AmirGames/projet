import { db } from "../../services/db";
import { Surveillance } from "../monitoring/surveillance.service";
import { logger } from "../../config/logger";
import { runRetention } from "./retention.service";

const INTERVAL = 3600000;
let timer: NodeJS.Timeout | null = null, running = false;
export class PrivacyJobs {
  static start() {
    if (timer) return;
    Surveillance.declarerTache("rgpd", "Purge et effacement RGPD", INTERVAL);
    timer = setInterval(() => { void this.run(); }, INTERVAL);
    timer.unref();
    void this.run();
  }
  static stop() { if (timer) clearInterval(timer); timer = null; }
  static async run() {
    if (running) return;
    running = true;
    try {
      await Surveillance.executerTache("rgpd", async () => {
        // Verrou distribué : une seule instance purge à la fois ; libération même sur erreur.
        await db.$transaction(async (tx) => {
          const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(60402026) AS locked`;
          if (!lock.locked) return;
          const result = await runRetention();
          logger.info("Purge RGPD terminée", result);
          const overdue = await db.privacyErasureRequest.count({ where: { status: "PENDING", requestedAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
          if (overdue) throw new Error(`${overdue} demandes d'effacement dépassent 30 jours : intervention du DPO requise`);
        }, { timeout: 120000 });
      });
    } catch { logger.error("Purge RGPD en échec : consulter la surveillance et intervenir"); }
    finally { running = false; }
  }
}
