import { MerchantClosureService } from "../services/merchant-closure.service";
import { logger } from "../config/logger";
import { Surveillance } from "../services/surveillance.service";

export class ClosureJobs {
  private static intervalIds: NodeJS.Timeout[] = [];

  static async startJobs() {
    try {
      logger.info("Starting closure jobs...");
      Surveillance.declarerTache("fermetures", "Fermetures de comptes", 3600000);

      // Run every hour (3600000 ms)
      const hourlyInterval = setInterval(async () => {
        await this.processHardDeletes();
      }, 3600000);

      this.intervalIds.push(hourlyInterval);
      logger.info("✅ Closure jobs started successfully");
    } catch (err) {
      logger.error("Failed to start closure jobs", err instanceof Error ? { message: err.message } : err);
    }
  }

  private static async processHardDeletes() {
    try {
      logger.info("Running hard delete job...");
      const count = await Surveillance.executerTache("fermetures", () =>
        MerchantClosureService.checkAndApplyAutomaticActions()
      );
      logger.info(`Hard delete job completed. Processed ${count} merchants.`);
    } catch (err) {
      logger.error("Error in hard delete job", err instanceof Error ? { message: err.message } : err);
    }
  }

  static stopJobs() {
    logger.info("Stopping closure jobs...");
    this.intervalIds.forEach((id) => clearInterval(id));
    this.intervalIds = [];
    logger.info("✅ Closure jobs stopped");
  }
}
