import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { limiterCadence } from "../middleware/throttle";
import { AuthService } from "../services/auth.service";
import { compteConnecte } from "../services/compte-connecte";
import { SsoService, origineCentrale } from "../services/sso.service";

/**
 * Connexion unique entre les domaines (voir sso.service.ts).
 *
 * Deux sortes d'appels :
 * - depuis le navigateur, sur n'importe quel domaine du site : demander un
 *   code pour sa propre session (`/code`), échanger un code reçu (`/echanger`),
 *   se déconnecter partout (`/deconnexion`) ;
 * - depuis le serveur du site sur zupone.com, qui tient le cookie central :
 *   ouvrir le jeton central (`/central/ouvrir`), en tirer un code pour un
 *   domaine (`/central/code`). Le jeton central ne passe jamais par le
 *   navigateur autrement que dans ce cookie.
 */
const router = Router();

/** Sans SSO_ORIGIN, la connexion unique est éteinte : chaque domaine reste seul. */
function exigerSso() {
  const centrale = origineCentrale();
  if (!centrale) throw new ApiError(404, "Connexion unique désactivée", "SSO_DESACTIVE");
  return centrale;
}

/**
 * Un code ne se devine pas (256 bits) : la limite vise seulement à ne pas laisser
 * marteler l'échange. Par adresse IP, pour les navigateurs.
 */
const limiterEchanges = limiterCadence({
  max: 60,
  fenetreMs: 15 * 60 * 1000,
  message: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
  cle: (req) => `sso|${req.ip || "inconnue"}`,
});

const codeSchema = z.object({ code: z.string().min(20).max(200) });
const audienceSchema = z.object({ audience: z.string().url().max(200) });
const jetonSchema = z.object({ jeton: z.string().min(20).max(200) });

// POST /sso/code — un code pour transmettre sa propre session à un domaine
router.post("/code", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    exigerSso();
    const { audience } = audienceSchema.parse(req.body);

    // Un jeton émis avant le SSO ne porte pas de session : rien à transmettre,
    // l'utilisateur la retrouvera à sa prochaine connexion.
    if (!req.user?.sid) {
      throw new ApiError(409, "Session antérieure à la connexion unique", "SSO_SANS_SESSION");
    }

    res.json({ code: await SsoService.creerCode(req.user.sid, new URL(audience).origin) });
  } catch (err) {
    next(err);
  }
});

// POST /sso/echanger — le navigateur échange un code contre ses jetons
router.post("/echanger", limiterEchanges, async (req: Request, res: Response, next: NextFunction) => {
  try {
    exigerSso();
    const { code } = codeSchema.parse(req.body);

    // Le code n'est bon que pour le domaine qui l'a demandé : l'origine de la
    // requête, que le navigateur fixe lui-même, doit être la sienne.
    const { sid, userId } = await SsoService.echangerCode(code, req.get("origin"));

    res.json({
      accessToken: AuthService.generateAccessToken(userId, sid),
      refreshToken: await SsoService.emettreRefresh(userId, sid),
      ...(await compteConnecte(userId)),
    });
  } catch (err) {
    next(err);
  }
});

// POST /sso/deconnexion — ferme la session sur tous les domaines
router.post("/deconnexion", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.sid) await SsoService.fermer(req.user.sid);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /sso/central/ouvrir — zupone.com pose son cookie central
router.post("/central/ouvrir", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const centrale = exigerSso();
    const { code } = codeSchema.parse(req.body);

    // Seul un code destiné à zupone.com ouvre le cookie central.
    const { sid } = await SsoService.echangerCode(code, centrale);

    res.json({ jeton: await SsoService.poserJetonCentral(sid) });
  } catch (err) {
    next(err);
  }
});

// POST /sso/central/code — zupone.com tire du cookie central un code pour un domaine
router.post("/central/code", async (req: Request, res: Response, next: NextFunction) => {
  try {
    exigerSso();
    const { jeton } = jetonSchema.parse(req.body);
    const { audience } = audienceSchema.parse(req.body);

    const session = await SsoService.sessionDuJetonCentral(jeton);
    if (!session) {
      throw new ApiError(401, "Aucune session ouverte", "SSO_ABSENT");
    }

    res.json({ code: await SsoService.creerCode(session.sid, new URL(audience).origin) });
  } catch (err) {
    next(err);
  }
});

export default router;
