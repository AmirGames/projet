import { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodTypeAny } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { exigerPermission } from "../auth/permissions-plateforme.service";

/** Accès équipe ZupDrive : identité vérifiée, puis permission de la plateforme DRIVE. */
export const adminAuth: RequestHandler[] = [authMiddleware, exigerPermission("zupdrive", "DRIVE")];

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
