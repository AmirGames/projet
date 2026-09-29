import { Request, Response, NextFunction } from "express";
import { db } from "../../services/db";
import { exigerPermission } from "../auth/permissions-plateforme.service";

// Garde de l'espace : le superowner passe partout, un membre de l'équipe
// selon les permissions de son groupe (voir permissions-plateforme.service).
export const gardeEquipe = exigerPermission("superowner");

export const isSuperOwner = (req: Request, res: Response, next: NextFunction) => {
  gardeEquipe(req, res, async (err?: unknown) => {
    if (err) return next(err);
    try {
      // Le jeton ne porte pas l'email : on l'expose pour les journaux.
      const user = await db.user.findUnique({ where: { id: req.userId }, select: { email: true } });
      (req as any).actorEmail = user?.email;
      next();
    } catch (e) {
      next(e);
    }
  });
};

// Journalise une action d'administration sur la plateforme.
export async function journaliser(req: Request, action: string, target: string, changes?: unknown) {
  await db.systemAuditLog.create({
    data: {
      adminId: (req as any).userId,
      action,
      target,
      changes: (changes ?? {}) as any,
    },
  });
}
