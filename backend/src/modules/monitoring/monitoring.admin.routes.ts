import { lireConsole } from "../../config/logger";
import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../auth/auth.middleware";
import { BackupService } from "./backup.service";
import { SecurityEventService } from "../auth/security-event.service";
import { SystemHealthService } from "./system-health.service";
import { Vigie } from "./vigie.service";
import { Disponibilite } from "./disponibilite.service";
import { isSuperOwner } from "../superowner/shared";

const router = Router();

// GET /superowner/system-health - Le détail de la santé, relevé par relevé
//
// Le tableau de bord n'affiche que le pourcentage ; ce qui le compose, et ce
// qu'il faut faire pour le remonter, tient sur sa propre page.
router.get("/system-health", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await SystemHealthService.etat() });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/console?apres=<id> - Les dernières lignes de la console du serveur
router.get("/console", authMiddleware, isSuperOwner, (req: Request, res: Response) => {
  const apres = parseInt(String(req.query.apres ?? "0"), 10) || 0;
  res.json({ success: true, data: lireConsole(apres) });
});

// GET /superowner/monitoring - Le site en fonctionnement, en direct
//
// Trafic, erreurs, temps de réponse, processus, dépendances, tâches de fond
// et incidents ouverts : ce que la santé, tirée de la base, ne voit pas.
router.get("/monitoring", authMiddleware, isSuperOwner, (_req: Request, res: Response) => {
  res.json({ success: true, data: Vigie.instantane() });
});

// GET /superowner/uptime - La disponibilité dans la durée : 24 h, 7, 30 et 90 jours
router.get("/uptime", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Disponibilite.bilan() });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/monitoring/releve - Relever tout de suite, sans attendre la vigie
router.post("/monitoring/releve", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // La disponibilité d'abord : la vigie lit son état pour ses alertes.
    await Disponibilite.passer();
    await Vigie.passer();
    res.json({ success: true, data: Vigie.instantane() });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/data-management - Data management info
router.get("/data-management", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // La page lit stats et backups à la racine de la réponse.
    res.json(await BackupService.list());
  } catch (err) {
    next(err);
  }
});

// POST /superowner/backups - Produire une sauvegarde
router.post("/backups", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sauvegarde = await BackupService.create(req.userId);

    SecurityEventService.record({
      action: "BACKUP_CREATED",
      actor: (req as any).actorEmail || "inconnu",
      target: sauvegarde.id,
      severity: "MEDIUM",
      details: sauvegarde.name,
    });

    res.status(201).json({
      success: true,
      backupId: sauvegarde.id,
      status: sauvegarde.status,
      message: "Sauvegarde terminée",
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/backups/:backupId/download - Télécharger le fichier
router.get("/backups/:backupId/download", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backupId = req.params.backupId as string;
    const { nom, contenu } = await BackupService.readEncrypted(backupId);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${nom}"`);
    res.send(contenu);
  } catch (err) {
    next(err);
  }
});

// POST /superowner/backups/:backupId/restore - Réinjecter le contenu
router.post("/backups/:backupId/restore", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backupId = req.params.backupId as string;
    const resultats = await BackupService.restore(backupId);

    SecurityEventService.record({
      action: "BACKUP_RESTORED",
      actor: (req as any).actorEmail || "inconnu",
      target: backupId,
      severity: "CRITICAL",
      details: `Restaurés : ${Object.entries(resultats).map(([k, v]) => `${v} ${k}`).join(", ")}`,
    });

    res.json({ success: true, restored: resultats, message: "Sauvegarde restaurée" });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/backups/:backupId - Supprimer la sauvegarde et son fichier
router.delete("/backups/:backupId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backupId = req.params.backupId as string;
    await BackupService.remove(backupId);

    SecurityEventService.record({
      action: "BACKUP_DELETED",
      actor: (req as any).actorEmail || "inconnu",
      target: backupId,
      severity: "HIGH",
    });

    res.json({ success: true, message: "Sauvegarde supprimée" });
  } catch (err) {
    next(err);
  }
});

export default router;
