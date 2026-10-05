import { Router, Request, Response, NextFunction } from "express";

import { authMiddleware, compteDuJeton } from "../auth/auth.middleware";
import { db } from "../../services/db";
import { readPrivate } from "./private-storage";
import { recordAudit } from "../privacy/audit";
import { ApiError } from "../../middleware/errorHandler";
import {
  DUREE_SIGNATURE_S,
  adresseSignee,
  cheminRelatif,
  cheminSurDisque,
  peutLire,
  signatureValable,
} from "./fichiers-prives.service";
import { detecterType } from "../../utils/file-type";

/**
 * Les pièces privées du stockage local : permis et RIB des livreurs, pièces
 * des commerçants, photos de dépôt. Voir fichiers-prives.service.ts.
 *
 * Aucune n'est servie sans session ou adresse signée, et jamais avec
 * « Access-Control-Allow-Origin: * » : le CORS de l'application ne renvoie
 * que les origines autorisées.
 */
const router = Router();

/** Une pièce introuvable et une pièce interdite se ressemblent : 404. */
const introuvable = () => new ApiError(404, "Fichier introuvable", "FILE_NOT_FOUND");

function sansCache(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.vary("Origin");
}

/** La session de la requête, vérifiée comme sur toute route protégée. */
function exigerSession(req: Request, res: Response): Promise<void> {
  return new Promise((ok, echec) => authMiddleware(req, res, (err?: unknown) => (err ? echec(err) : ok())));
}

/**
 * Sert la pièce `relatif` à qui a le droit de la lire : adresse signée
 * valable, ou session d'un compte autorisé.
 */
export async function servirFichierPrive(relatif: string | null, req: Request, res: Response, next: NextFunction) {
  try {
    sansCache(res);
    const complet = relatif ? cheminSurDisque(relatif) : null;
    if (!relatif || !complet) throw introuvable();

    if (req.query.sig !== undefined || req.query.exp !== undefined) {
      const u = typeof req.query.u === "string" ? req.query.u : "";
      const s = typeof req.query.s === "string" ? req.query.s : "";
      if (!u || !s || !signatureValable(relatif, req.query.exp, req.query.sig, Date.now(), u, s)) {
        throw new ApiError(403, "Lien expiré ou invalide", "INVALID_SIGNATURE");
      }
      const session = await db.sessionConnexion.findFirst({ where: { id: s, userId: u, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
      const compte = await compteDuJeton(u, true);
      if (!session || !compte || !(await peutLire({ userId: u, compte }, relatif))) throw introuvable();
      req.userId = u;
    } else {
      await exigerSession(req, res);
      if (!(await peutLire(req, relatif))) throw introuvable();
    }

    let content: Buffer;
    try { content = await readPrivate(relatif); } catch { throw introuvable(); }
    const type = detecterType(content);
    if (!type) throw introuvable();
    await recordAudit(req.userId!, req.query.download === "1" ? "DOCUMENT_DOWNLOAD" : "DOCUMENT_VIEW", relatif);

    // Le back-office est servi sur une autre origine : sans cela helmet
    // l'empêche d'afficher la pièce dans une balise <img>.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Type", type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Disposition", req.query.download === "1" ? "attachment" : "inline");
    return res.send(content);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/files/signed-url?url=… - Une adresse signée, valable cinq minutes,
 * pour afficher une pièce dans une balise <img> ou l'ouvrir dans un onglet.
 * Accepte les anciennes adresses (…/uploads/drivers/…) telles que la base les
 * garde.
 */
router.get("/signed-url", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    sansCache(res);
    const relatif = cheminRelatif(req.query.url);
    if (!relatif) {
      throw new ApiError(400, "Ce n'est pas une pièce du stockage privé", "INVALID_FILE_URL");
    }
    if (!(await peutLire(req, relatif))) throw introuvable();

    await recordAudit(req.userId!, "DOCUMENT_LINK_ISSUED", relatif);
    res.json({ success: true, data: { url: adresseSignee(relatif, Date.now(), { userId: req.userId, sessionId: req.user?.sid }), expiresIn: DUREE_SIGNATURE_S } });
  } catch (err) {
    next(err);
  }
});

// GET /api/files/<dossier>/<fichier>
router.get(/^\/([^/]+)\/([^/]+)$/, (req: Request, res: Response, next: NextFunction) => {
  const params = req.params as unknown as Record<string, string>;
  return servirFichierPrive(cheminRelatif(`${params[0]}/${params[1]}`), req, res, next);
});

export default router;
