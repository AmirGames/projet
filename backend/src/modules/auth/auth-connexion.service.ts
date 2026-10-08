import type { Request } from "express";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { AuthService } from "./auth.service";
import { SsoService } from "./sso.service";
import { UserService } from "./user.service";
import { compteConnecte } from "./compte-connecte";
import { SecurityEventService } from "./security-event.service";
import { PermissionsPlateforme, LIBELLES_PLATEFORMES } from "./permissions-plateforme.service";
import { DemoMerchantService, empreinteVisiteur } from "../merchants/demo.service";
import { confirmationExigee } from "./auth-confirmation.service";

/**
 * Empreinte bcrypt d'un mot de passe que personne ne connaît. Comparée quand
 * l'adresse n'a pas de compte, pour qu'un e-mail inconnu prenne autant de
 * temps qu'un mauvais mot de passe : le temps de réponse ne dit pas si le
 * compte existe.
 */
const EMPREINTE_FACTICE = "$2b$10$KyIUB44YPS.juBdZYLbXx.na0HtA3MZse8Orjd0anrbp2cTa8BVhW";

/** Connexion et lecture des rôles du compte. */
export const AuthConnexionService = {
  /** Vérifie les identifiants et ouvre une session. */
  async connecter(req: Request, body: { email: string; password: string }) {
    logger.info("Login attempt");

    // Adresse inconnue et mauvais mot de passe reçoivent la même réponse, en
    // autant de temps : ni le code ni la durée ne disent si le compte existe.
    let user: Awaited<ReturnType<typeof UserService.getUserByEmail>> | null;
    try {
      user = await UserService.getUserByEmail(body.email);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "USER_NOT_FOUND")) throw err;
      user = null;
    }

    // Seule une empreinte bcrypt est comparée : les anciens mots de passe en
    // clair ont été convertis par la migration 0002, et la base refuse
    // désormais toute autre valeur.
    const isPasswordValid = await AuthService.comparePassword(
      body.password,
      user?.passwordHash ?? EMPREINTE_FACTICE
    );

    if (!user || !isPasswordValid) {
      SecurityEventService.record({
        action: "LOGIN_FAILED",
        actor: body.email,
        severity: user?.isSuperOwner || user?.isSystemAdmin ? "HIGH" : "MEDIUM",
        status: "FAILED",
        details: user ? "Mot de passe incorrect" : "Aucun compte à cette adresse",
      });

      throw new ApiError(401, "Email ou mot de passe incorrect", "INVALID_CREDENTIALS");
    }

    if (user.status && user.status !== "ACTIVE") {
      throw new ApiError(401, "Email ou mot de passe incorrect", "INVALID_CREDENTIALS");
    }

    // Exigée d'office en production (voir confirmationExigee). Une instance
    // dont des comptes existants ne sont pas confirmés peut la suspendre avec
    // REQUIRE_EMAIL_VERIFICATION=false, le temps que chacun confirme.
    if (confirmationExigee() && !user.emailVerified) {
      throw new ApiError(
        403,
        "Confirmez votre adresse e-mail avant de vous connecter.",
        "EMAIL_NOT_VERIFIED"
      );
    }

    SecurityEventService.record({
      action: "LOGIN_SUCCESS",
      actor: user.email,
      severity: user.isSuperOwner || user.isSystemAdmin ? "MEDIUM" : "LOW",
      details: user.isSuperOwner ? "Connexion superowner" : "Connexion réussie",
    });

    // Le compte et ses espaces : refuse un compte rattaché à aucun espace.
    const compteOuvert = await compteConnecte(user.id);

    // Le compte démo : un nouveau visiteur trouve une démo remise à zéro. Une
    // panne ici ne doit jamais empêcher la connexion.
    await DemoMerchantService.surLaConnexion(user.id, empreinteVisiteur(req)).catch((err) =>
      logger.warn("Compte démo : connexion non suivie", { error: err instanceof Error ? err.message : err })
    );

    // Une session par connexion : les jetons la portent, et la fermer les
    // invalide sur tous les domaines (voir sso.service.ts).
    const { accessToken, refreshToken } = await SsoService.connecter(user.id);

    return { accessToken, refreshToken, compteOuvert };
  },

  /** Les rôles actuels et disponibles du compte (client, livreur, commerçant, équipe). */
  async roles(userId: string, acces: Partial<Record<keyof typeof LIBELLES_PLATEFORMES, string>>) {
    const user = await UserService.getUserById(userId);
    const memberships = await UserService.getUserOrganizations(userId);
    const driver = await db.courier.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    const customer = await db.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    const roleEat = acces.EAT;

    return {
      user: {
        id: user.id,
        email: user.email,
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
        // Le groupe dans l'équipe de ZupEat : le sélecteur d'espaces
        // l'affiche à la place de « Super Owner ».
        platformRole: user.isSuperOwner ? null : roleEat ?? null,
        platformRoleLabel: user.isSuperOwner
          ? null
          : (await PermissionsPlateforme.role(roleEat, "EAT"))?.label ?? null,
        // Les rôles dans l'équipe, plateforme par plateforme.
        accesEquipe: user.isSuperOwner
          ? []
          : await Promise.all(
              (Object.entries(acces) as [keyof typeof LIBELLES_PLATEFORMES, string][]).map(
                async ([plateforme, role]) => ({
                  plateforme,
                  plateformeLabel: LIBELLES_PLATEFORMES[plateforme],
                  role,
                  roleLabel: (await PermissionsPlateforme.role(role, plateforme))?.label ?? role,
                })
              )
            ),
      },
      roles: {
        customer: {
          active: !!customer,
          customerId: customer?.id || null,
        },
        driver: {
          active: !!driver,
          driverId: driver?.id || null,
          status: driver?.status || null,
        },
        merchant: {
          active: memberships.length > 0,
          organizations: memberships.map((m) => ({
            id: m.org.id,
            name: m.org.name,
            role: m.role,
          })),
        },
      },
    };
  },
};
