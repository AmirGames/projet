import type { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../auth/auth.middleware";
import { recordAudit } from "./audit";
import { ApiError } from "../../middleware/errorHandler";

function sensitiveAction(method: string, path: string): string | null {
  if (/\/privacy(?:\/|$)/.test(path) || /\/files(?:\/|$)/.test(path)) return null;
  if (method === "GET" && /(?:export|download|sepa|backups.*download|incident.*dossier)/i.test(path)) return "DATA_EXPORT";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  if (/(?:bank|iban|bank-account|profil|profile)/i.test(path)) return "SENSITIVE_PROFILE_CHANGE";
  if (/(?:documents|pieces|approve|approval|validation|validate|review|examiner|valider|refuser|dossier|statut|status)/i.test(path)) return "DOCUMENT_REVIEW_OR_CHANGE";
  if (/(?:members|roles?|team|staff|permissions)/i.test(path)) return "ROLE_CHANGE";
  return null;
}

/** Trace préalable (ATTEMPT), distincte d'une preuve de succès métier. */
export function privacyAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const action = sensitiveAction(req.method, req.path);
  if (!action) return next();
  authMiddleware(req, res, async (error?: unknown) => {
    if (error) return next(error);
    try {
      await recordAudit(req.userId!, action, req.path, "ATTEMPT");
      const originalJson = res.json.bind(res), originalSend = res.send.bind(res);
      let intercepted = false;
      const send = (original: typeof res.send, body: unknown) => {
        if (intercepted) return original(body);
        intercepted = true;
        void recordAudit(req.userId!, action, req.path, res.statusCode < 400 ? "SUCCESS" : "REFUSED")
          .then(() => { res.json = originalJson; res.send = originalSend; original(body); })
          .catch(() => { res.json = originalJson; res.send = originalSend; next(new ApiError(503, "Journal d'audit indisponible", "AUDIT_UNAVAILABLE")); });
        return res;
      };
      res.json = ((body: unknown) => send(originalJson, body)) as typeof res.json;
      res.send = ((body: unknown) => send(originalSend, body)) as typeof res.send;
      return next();
    } catch (err) { return next(err); }
  });
}
