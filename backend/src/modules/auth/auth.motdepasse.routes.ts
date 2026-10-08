import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { champEmail, champMotDePasse } from "../../utils/validation";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "./auth.middleware";
import {
  limiterCadence,
  limiterAuthParIp,
  limiterCourrielsParIp,
  parDestinataire,
} from "../../middleware/throttle";
import { effacerCookieRefresh } from "./refresh-cookie";
import { AuthMotDePasseService } from "./auth-motdepasse.service";
import { AuthConfirmationService } from "./auth-confirmation.service";

// ============================================================================
// CONFIRMATION D'ADRESSE ET MOT DE PASSE OUBLIÉ
// Monté sur /api/auth (voir app.ts).
// ============================================================================
const router = Router();

// POST /auth/forgot-password - Demande de réinitialisation
router.post(
  "/forgot-password",
  limiterCourrielsParIp,
  limiterCadence({
    max: 3,
    fenetreMs: 15 * 60 * 1000,
    message: "Trop de demandes. Réessayez dans quelques minutes.",
    cle: parDestinataire,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ email: champEmail() }).parse(req.body);

      res.json(await AuthMotDePasseService.demanderReinitialisation(body.email));
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/reset-password - Nouveau mot de passe via le lien reçu
router.post(
  "/reset-password",
  limiterAuthParIp,
  // Compté par jeton : ce qu'on protège ici, c'est une tentative de deviner
  // un lien précis. Compter par IP mettrait tous les utilisateurs d'un même
  // réseau dans le même seau, sans rien empêcher de plus — un jeton de 32
  // octets est hors de portée d'une recherche exhaustive.
  limiterCadence({
    max: 10,
    fenetreMs: 15 * 60 * 1000,
    cle: (req) => `reinit|${typeof req.body?.jeton === "string" ? req.body.jeton : req.ip}`,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          jeton: z.string().min(32),
          password: champMotDePasse(),
        })
        .parse(req.body);

      await AuthMotDePasseService.reinitialiser(body.jeton, body.password);

      res.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/change-password - Changement depuis le profil, session ouverte
router.post(
  "/change-password",
  authMiddleware,
  // Deviner l'ancien mot de passe depuis une session volée doit rester lent.
  limiterCadence({
    max: 10,
    fenetreMs: 15 * 60 * 1000,
    cle: (req) => `changement-mdp|${req.userId || req.ip}`,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
      }

      const body = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: champMotDePasse(),
        })
        .parse(req.body);

      await AuthMotDePasseService.changer(userId, body.currentPassword, body.newPassword);

      effacerCookieRefresh(res);
      res.json({ message: "Mot de passe modifié. Toutes vos sessions ont été déconnectées." });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/verify-email - Confirmation d'adresse via le lien reçu
router.post("/verify-email", limiterAuthParIp, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ jeton: z.string().min(32) }).parse(req.body);

    res.json(await AuthConfirmationService.verifier(body.jeton));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/resend-verification - Nouveau lien de confirmation
 *
 * Volontairement ouverte aux deux cas : connecté, où l'on peut dire
 * précisément où en est le compte, et non connecté avec une adresse, car
 * quelqu'un à qui l'on refuse la connexion faute de confirmation n'a
 * justement pas de session pour demander un nouveau lien.
 */
router.post(
  "/resend-verification",
  limiterCourrielsParIp,
  (req: Request, res: Response, next: NextFunction) =>
    req.headers.authorization ? authMiddleware(req, res, next) : next(),
  // Compté par compte visé : c'est lui qui reçoit les messages. La session,
  // quand il y en a une, désigne le compte ; sinon c'est l'adresse fournie.
  // Sans l'un ni l'autre la demande n'a pas de destinataire et sera refusée,
  // il n'y a donc rien à compter.
  limiterCadence({
    max: 3,
    fenetreMs: 15 * 60 * 1000,
    cle: (req) => req.userId || parDestinataire(req),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Une session, si elle existe, prime sur l'adresse fournie : sinon
      // n'importe qui pourrait viser le compte d'un autre.
      const userId = req.userId || null;

      const demande = z.object({ email: champEmail().optional() }).parse(req.body || {});

      res.json(await AuthConfirmationService.renvoyer(userId, demande.email));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
