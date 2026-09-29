import fs from "fs";
import { Router, Request, Response, NextFunction } from "express";

import { authMiddleware } from "../auth/auth.middleware";
import { ApiError } from "../../middleware/errorHandler";
import {
  DUREE_SIGNATURE_S,
  adresseSignee,
  cheminRelatif,
  cheminSurDisque,
  peutLire,
  signatureValable,
  typeDuFichier,
} from "./fichiers-prives.service";

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
      if (!signatureValable(relatif, req.query.exp, req.query.sig)) {
        throw new ApiError(403, "Lien expiré ou invalide", "INVALID_SIGNATURE");
      }
    } else {
      await exigerSession(req, res);
      if (!(await peutLire(req, relatif))) throw introuvable();
    }

    if (!fs.existsSync(complet)) throw introuvable();

    // Le back-office est servi sur une autre origine : sans cela helmet
    // l'empêche d'afficher la pièce dans une balise <img>.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Type", typeDuFichier(complet));
    res.setHeader("Content-Disposition", "inline");
    return res.sendFile(complet, { cacheControl: false, lastModified: false, etag: false });
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

    res.json({ success: true, data: { url: adresseSignee(relatif), expiresIn: DUREE_SIGNATURE_S } });
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
