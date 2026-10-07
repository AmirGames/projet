import { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodTypeAny } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { exigerPermission } from "../auth/permissions-plateforme.service";

/**
 * Accès équipe ZupDrive : identité vérifiée, puis permission de la plateforme DRIVE.
 * Sans section, seuls les chemins listés dans ROUTES.zupdrive sont ouverts à l'équipe :
 * tout autre chemin reste réservé au superowner (voir exigerPermission).
 */
export const adminAuth: RequestHandler[] = [authMiddleware, exigerPermission("zupdrive", "DRIVE")];

/** Sections de l'équipe ZupDrive (SECTIONS de permissions-plateforme.service). */
export type SectionDrive = "chauffeurs" | "courses-drive";

/** Comme adminAuth, mais le droit demandé est celui d'une section nommée (lecture sur GET, écriture sinon). */
export function adminAuthSection(section: SectionDrive): RequestHandler[] {
  return [authMiddleware, exigerPermission("zupdrive", "DRIVE", section)];
}

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Valide body/query/params avec Zod et les remplace par les valeurs analysées (coercions comprises). */
export function validateRequest(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      for (const cle of ["query", "params"] as const) {
        const schema = schemas[cle];
        if (!schema) continue;
        const valeur = schema.parse(req[cle]);
        // Express 5 : req.query est un accesseur en lecture seule.
        Object.defineProperty(req, cle, { value: valeur, writable: true, configurable: true, enumerable: true });
      }
      next();
    } catch (erreur) {
      next(erreur);
    }
  };
}
