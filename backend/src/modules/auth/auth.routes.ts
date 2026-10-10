import { Router, Request, Response, NextFunction } from "express";
import mfaRouter from "./mfa.routes";
import { champAcceptation } from "../legal/acceptation-conditions.service";
import { signupSchema, loginSchema, refreshTokenSchema } from "../../utils/validation";
import { AuthService } from "./auth.service";
import { SsoService } from "./sso.service";
import { effacerCookieRefresh, exigerOrigine, lireCookieRefresh, livrerRefresh } from "./refresh-cookie";
import { compteConnecte } from "./compte-connecte";
import { UserService } from "./user.service";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware, compteDuJeton, jetonPerime } from "./auth.middleware";
import { limiterConnexions, limiterAuthParIp, limiterInscriptions } from "../../middleware/throttle";
import { logger } from "../../config/logger";
import { configurationDemo, DemoMerchantService, empreinteVisiteur } from "../merchants/demo.service";
import { AuthInscriptionService, REPONSE_INSCRIPTION_A_CONFIRMER } from "./auth-inscription.service";
import { AuthConnexionService } from "./auth-connexion.service";

// Identité et session : inscription client, connexion, renouvellement, profil.
// Le reste de /api/auth est dans auth.inscriptions.routes.ts (commerçant,
// livreur) et auth.motdepasse.routes.ts (mot de passe, confirmation d'adresse) ;
// tous sont montés sur /api/auth (voir app.ts).
const router = Router();

export { confirmationExigee } from "./auth-confirmation.service";

// POST /auth/signup
router.post("/signup", limiterInscriptions, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.extend(champAcceptation).parse(req.body);

    const inscrit = await AuthInscriptionService.inscrireClient(req, body);

    if (inscrit.aConfirmer) {
      res.status(202).json(REPONSE_INSCRIPTION_A_CONFIRMER);
      return;
    }

    const { user, accessToken, refreshToken } = inscrit;

    res.status(201).json({
      message: "Compte créé avec succès",
      accessToken,
      refreshToken: livrerRefresh(req, res, refreshToken),
      // Les droits d'administration ne se disent pas ici : /auth/me les donne
      // à qui est connecté.
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /auth/demo - Les identifiants du commerce de démonstration, s'il est activé.
// Publics par nature : ils s'affichent sur la page de connexion.
router.get("/demo", (_req: Request, res: Response) => {
  const config = configurationDemo();
  res.json(config ? { enabled: true, ...config } : { enabled: false });
});

// POST /auth/login
router.post("/login", limiterAuthParIp, limiterConnexions, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    const { accessToken, refreshToken, compteOuvert } = await AuthConnexionService.connecter(req, body);

    await limiterConnexions.reinitialiser(req);
    res.json({
      message: "Connexion réussie",
      accessToken,
      refreshToken: livrerRefresh(req, res, refreshToken),
      ...compteOuvert,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post("/refresh", limiterAuthParIp, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Le jeton vient du corps (mobile, ancien web) ou du cookie httpOnly. Par le
    // cookie, la requête part toute seule : l'origine doit être un domaine du site.
    const duCookie = !req.body?.refreshToken && lireCookieRefresh(req);
    if (duCookie) exigerOrigine(req);
    const body = refreshTokenSchema.parse({ refreshToken: req.body?.refreshToken ?? duCookie });

    // Rotation : le jeton présenté est consommé, un nouveau est émis. Un jeton
    // déjà consommé ferme la session entière (voir SsoService.renouveler).
    const cleReprise = req.get("X-Refresh-Request") || body.requestId;
    const { decoded, sid, refreshToken } = await SsoService.renouveler(body.refreshToken, cleReprise);

    // Le compte a pu disparaître depuis la signature du jeton — base remise à
    // zéro, utilisateur supprimé. Ce n'est pas une ressource introuvable mais
    // une session à refaire : dit en 404, le navigateur réessayait sans fin.
    const compte = await compteDuJeton(decoded.userId);

    if (!compte || jetonPerime(compte, decoded.iat)) {
      throw new ApiError(
        401,
        "Votre session n'est plus valable. Reconnectez-vous.",
        "SESSION_INVALIDE"
      );
    }

    logger.info("Token refreshed", { userId: decoded.userId });

    const compteOuvert = await compteConnecte(decoded.userId);

    const accessToken = AuthService.generateAccessToken(decoded.userId, sid);

    /**
     * Le compte accompagne le jeton.
     *
     * La route ne rendait que `accessToken`. Le navigateur, lui, rangeait
     * `data.user` — absent — et se retrouvait déconnecté juste après un
     * renouvellement réussi : la session repartait toutes les cinq minutes.
     */
    res.json({
      accessToken,
      refreshToken: livrerRefresh(req, res, refreshToken, !!duCookie),
      ...compteOuvert,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — ferme la session : access et refresh cessent de valoir
router.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const duCookie = !req.body?.refreshToken && lireCookieRefresh(req);
    // Le cookie part tout seul : sans contrôle d'origine, un site tiers pourrait
    // déconnecter l'utilisateur.
    if (duCookie) exigerOrigine(req);

    const jeton: string | undefined = req.body?.refreshToken || duCookie || undefined;
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;

    let sid: string | undefined;
    let userId: string | undefined;
    try {
      const decode = jeton
        ? AuthService.verifyRefreshToken(jeton)
        : bearer
          ? AuthService.verifyAccessToken(bearer)
          : undefined;
      sid = decode?.sid;
      userId = decode?.userId;
    } catch {
      // Jeton déjà expiré ou invalide : rien à fermer, le cookie part quand même.
    }
    if (sid) await SsoService.fermer(sid);

    // Le compte démo : le visiteur qui s'en va emporte ses modifications.
    if (userId) {
      await DemoMerchantService.surLaDeconnexion(userId, empreinteVisiteur(req)).catch((err) =>
        logger.warn("Compte démo : déconnexion non suivie", { error: err instanceof Error ? err.message : err })
      );
    }

    effacerCookieRefresh(res);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me - Get current user (requires auth)
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;

    if (!userId) {
      throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
    }

    const user = await UserService.getUserById(userId);
    const memberships = await UserService.getUserOrganizations(userId);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
        emailVerified: user.emailVerified,
      },
      organizations: memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        role: m.role,
        status: m.org.status,
        suspensionReason: m.org.suspensionReason,
        closureReason: m.org.closureReason,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /me/roles - Get user's current and available roles
router.get("/me/roles", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;

    if (!userId) {
      throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
    }

    res.json(await AuthConnexionService.roles(userId, req.compte?.acces ?? {}));
  } catch (err) {
    next(err);
  }
});

router.use("/mfa", mfaRouter);
export default router;
