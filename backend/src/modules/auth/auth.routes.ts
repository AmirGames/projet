import {
  PermissionsPlateforme,
  LIBELLES_PLATEFORMES,
} from "./permissions-plateforme.service";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { champEmail, champMotDePasse, signupSchema, loginSchema, refreshTokenSchema } from "../../utils/validation";
import { AuthService } from "./auth.service";
import { SsoService } from "./sso.service";
import { effacerCookieRefresh, exigerOrigine, lireCookieRefresh, livrerRefresh } from "./refresh-cookie";
import { compteConnecte } from "./compte-connecte";
import { UserService } from "./user.service";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware, compteDuJeton, jetonPerime, oublierCompte } from "./auth.middleware";
import {
  limiterCadence,
  limiterConnexions,
  limiterAuthParIp,
  limiterCourrielsParIp,
  limiterInscriptions,
  parDestinataire,
} from "../../middleware/throttle";
import { logger } from "../../config/logger";
import { SecurityEventService } from "./security-event.service";
import { EmailService } from "../notifications/email.service";
import {
  AccountTokenService,
  DUREE_CONFIRMATION_MS,
  DUREE_REINITIALISATION_MS,
} from "./account-token.service";
import { db } from "../../services/db";
import { champAcceptation, enregistrerAcceptation } from "../legal/acceptation-conditions.service";
import { StoreService } from "../stores/store.service";
import { normaliserGenre } from "../stores/store-type.service";
import { rattacherFicheInvite } from "../customers/fiche-client.service";
import { configurationDemo, DemoMerchantService, empreinteVisiteur } from "../merchants/demo.service";

const router = Router();

/**
 * Faut-il une adresse confirmée pour se connecter ?
 *
 * `REQUIRE_EMAIL_VERIFICATION=true|false` décide. Non définie, la
 * confirmation est exigée en production et pas ailleurs : le développement
 * local n'a pas toujours de serveur de courriel.
 */
export function confirmationExigee() {
  const valeur = process.env.REQUIRE_EMAIL_VERIFICATION?.trim();
  if (!valeur) return process.env.NODE_ENV === "production";
  return valeur === "true";
}

/**
 * Empreinte bcrypt d'un mot de passe que personne ne connaît. Comparée quand
 * l'adresse n'a pas de compte, pour qu'un e-mail inconnu prenne autant de
 * temps qu'un mauvais mot de passe : le temps de réponse ne dit pas si le
 * compte existe.
 */
const EMPREINTE_FACTICE = "$2b$10$KyIUB44YPS.juBdZYLbXx.na0HtA3MZse8Orjd0anrbp2cTa8BVhW";

/** La même réponse pour toute inscription quand la confirmation est exigée. */
const REPONSE_INSCRIPTION_A_CONFIRMER = {
  message: "Si cette adresse peut être inscrite, un e-mail de confirmation vient d'être envoyé. Ouvrez le lien qu'il contient pour vous connecter.",
  emailVerificationRequired: true,
};

// POST /auth/signup
router.post("/signup", limiterInscriptions, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.extend(champAcceptation).parse(req.body);

    // Pas d'adresse dans les logs : une trace de plus qui dirait qui s'inscrit ou se connecte.
    logger.info("Signup attempt");

    // Une adresse déjà prise faisait échouer la création sur la contrainte
    // d'unicité : l'inscrit lisait « Internal server error » au lieu de
    // comprendre qu'il avait déjà un compte.
    const compteExistant = await db.user.findUnique({ where: { email: body.email } });

    // Quand la confirmation d'adresse est exigée (production), l'inscription
    // répond pareil que l'adresse soit libre ou prise : un 409 permettait de
    // savoir qui a un compte. Le parcours part vers le titulaire de l'adresse :
    // lien de confirmation s'il n'a pas confirmé, rien de plus s'il a déjà un
    // compte (il utilise « mot de passe oublié »).
    if (confirmationExigee()) {
      if (compteExistant) {
        // Même coût qu'une vraie inscription : le temps ne dit rien non plus.
        await AuthService.hashPassword(body.password);
        if (!compteExistant.emailVerified && compteExistant.status === "ACTIVE") {
          void envoyerConfirmation(compteExistant).catch((err) =>
            logger.warn("Confirmation d'adresse non renvoyée", { error: err instanceof Error ? err.message : err })
          );
        }
        res.status(202).json(REPONSE_INSCRIPTION_A_CONFIRMER);
        return;
      }
    } else if (compteExistant) {
      throw new ApiError(409, "Cet email est déjà utilisé", "EMAIL_EXISTS");
    }

    // Une inscription ne donne jamais de droits sur la plateforme. Le premier
    // inscrit en devenait propriétaire : sur une base neuve, le premier robot
    // venu prenait la plateforme, et deux inscriptions simultanées créaient
    // deux superowners. Le superowner se crée hors de l'API, avec
    // `npm run create-superowner` (src/cli/create-superowner.ts).
    const passwordHash = await AuthService.hashPassword(body.password);
    const user = await db.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
      },
    });

    await enregistrerAcceptation(req, { email: user.email, userId: user.id, documents: ["cgu", "cgv", "confidentialite"] });

    // Le lien de confirmation part à l'inscription. Il ne bloque la connexion
    // que si la confirmation est exigée (voir confirmationExigee) ; dans tous
    // les cas, il est nécessaire pour retrouver une fiche client invité.
    // Le courriel part sans faire attendre la réponse : l'aller-retour avec le
    // serveur SMTP représentait l'essentiel de la durée de l'inscription.
    if (process.env.ENABLE_EMAIL_VERIFICATION !== "false") {
      void envoyerConfirmation(user).catch((err) =>
        logger.warn("Confirmation d'adresse non préparée", {
          email: user.email,
          error: err instanceof Error ? err.message : err,
        })
      );
    }

    /**
     * La fiche client du compte.
     *
     * Une commande passée sans compte a pu créer une fiche à cette adresse,
     * unique elle aussi : on n'en crée pas une deuxième. On ne la rattache pas
     * non plus : s'inscrire ne prouve pas qu'on possède l'adresse, et la fiche
     * porte les commandes, adresses et codes de remise de celui qui a commandé.
     * Elle rejoint le compte à la confirmation de l'adresse (/verify-email).
     *
     * La réponse ne dit rien de la fiche : qu'elle diffère selon qu'une fiche
     * existait révélerait qu'on a commandé avec cette adresse.
     */
    const ficheExistante = await db.customer.findUnique({ where: { email: user.email }, select: { id: true } });
    if (!ficheExistante) {
      await db.customer.create({
        data: {
          userId: user.id,
          name: body.name || user.email.split("@")[0],
          email: user.email,
        },
      });
    }

    // Confirmation exigée : aucune session avant d'avoir prouvé qu'on possède
    // l'adresse (la connexion la refuse déjà, l'inscription ne la contourne pas).
    if (confirmationExigee()) {
      res.status(202).json(REPONSE_INSCRIPTION_A_CONFIRMER);
      return;
    }

    // Une session par connexion : les jetons la portent, et la fermer les
    // invalide sur tous les domaines (voir sso.service.ts).
    const { accessToken, refreshToken } = await SsoService.connecter(user.id);

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
    const { decoded, sid, refreshToken } = await SsoService.renouveler(body.refreshToken);

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
    const acces = req.compte?.acces ?? {};
    const roleEat = acces.EAT;

    res.json({
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
    });
  } catch (err) {
    next(err);
  }
});

// POST /me/become-merchant - Existing user becomes merchant
router.post("/me/become-merchant", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;

    if (!userId) {
      throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
    }

    const body = z.object({
      businessName: z.string().min(1).max(200),
      storeName: z.string().min(1).max(200),
      storeSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      // Le genre en code (« restaurant ») ; les anciennes graphies
      // (« Restaurant », « RESTAURANT ») sont encore comprises.
      businessType: z.string().min(1).max(50),
      cuisineType: z.string().max(50).optional().nullable(),
      // Les coordonnées de l'adresse retenue, quand la suggestion les donne.
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      phone: z.string().min(1).max(20),
      address: z.string().min(1).max(500),
      city: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      description: z.string().min(1).max(1000),
    }).parse(req.body);

    const genre = normaliserGenre(body.businessType, body.cuisineType);
    if (!genre.businessType) {
      throw new ApiError(400, "Type de commerce inconnu", "INVALID_BUSINESS_TYPE");
    }

    const user = await UserService.getUserById(userId);

    // Check if slug already exists
    const existingOrg = await db.organization.findUnique({
      where: { slug: body.storeSlug },
    });

    if (existingOrg) {
      throw new ApiError(400, "Cette URL est déjà utilisée", "SLUG_EXISTS");
    }

    // Create organization
    // Le commerce attend la validation de la plateforme (`approvedAt` vide) :
    // il prépare sa boutique, il ne l'ouvre pas encore.
    const organization = await db.organization.create({
      data: {
        name: body.businessName,
        email: user.email,
        slug: body.storeSlug,
        tier: "FREE",
        plan: "STARTER",
        status: "ACTIVE",
        // La plateforme elle-même n'a personne pour la valider.
        approvedAt: user.isSuperOwner ? new Date() : null,
      },
    });

    // Create membership
    await db.membership.create({
      data: {
        userId,
        orgId: organization.id,
        role: "ADMIN",
        storeIds: [],
      },
    });

    /**
     * La boutique passe par la même création que POST /api/stores.
     *
     * Créée ici à la main, elle naissait sans coordonnées — invisible de ses
     * zones de livraison et de l'attribution des courses — et son genre partait
     * dans les réglages au lieu du champ `businessType` que lit la recherche.
     */
    const store = await StoreService.create({
      orgId: organization.id,
      name: body.storeName,
      slug: body.storeSlug,
      address: body.address,
      city: body.city,
      postalCode: body.postalCode,
      phone: body.phone,
      email: user.email,
      description: body.description,
      latitude: body.latitude,
      longitude: body.longitude,
      businessType: genre.businessType,
      cuisineType: genre.cuisineType ?? undefined,
    });

    // Update membership with store ID
    await db.membership.update({
      where: {
        userId_orgId: {
          userId,
          orgId: organization.id,
        },
      },
      data: {
        storeIds: [store.id],
      },
    });

    logger.info("User became merchant", {
      userId,
      organizationId: organization.id,
      storeId: store.id,
    });

    res.status(201).json({
      message: "Rôle de commerçant activé avec succès",
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /me/become-driver - Existing user becomes driver
router.post("/me/become-driver", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    const sid = req.user?.sid;
    if (!sid) throw new ApiError(401, "Session requise", "SESSION_INVALIDE");

    if (!userId) {
      throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
    }

    const body = z.object({
      phone: z.string().min(1).max(20),
      vehicleType: z.enum(["car", "scooter", "bike"]),
      vehiclePlate: z.string().optional(),
    }).parse(req.body);

    // Get current user
    const user = await UserService.getUserById(userId);

    // Check if driver already exists
    const existingDriver = await db.courier.findUnique({
      where: { userId },
    });

    if (existingDriver) {
      throw new ApiError(400, "Vous avez déjà un profil livreur", "DRIVER_EXISTS");
    }

    // L'e-mail d'une fiche livreur est unique : une fiche restée sur cette
    // adresse (compte qui en a changé depuis) ferait échouer la création.
    const livreurSurEmail = await db.courier.findUnique({
      where: { email: user.email },
      select: { id: true },
    });

    if (livreurSurEmail) {
      throw new ApiError(409, "Cet email est déjà utilisé", "EMAIL_EXISTS");
    }

    // Create driver using user's existing email and name
    const driver = await db.courier.create({
      data: {
        userId,
        name: user.name || user.email.split("@")[0],
        email: user.email,
        phone: body.phone,
        vehicleType: body.vehicleType,
        vehiclePlate: body.vehiclePlate || null,
        licensePlate: body.vehiclePlate || null,
        status: "PENDING",
      },
    });

    logger.info("User became driver", {
      userId,
      driverId: driver.id,
    });

    // Generate new tokens to reflect driver status — dans la même session :
    // devenir livreur n'est pas une nouvelle connexion.
    const accessToken = AuthService.generateAccessToken(userId, sid);
    const refreshToken = await SsoService.emettreRefresh(userId, sid);

    res.status(201).json({
      message: "Candidature de livreur soumise avec succès",
      accessToken,
      refreshToken,
      driver: {
        id: driver.id,
        name: driver.name,
        status: driver.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/merchant-register - Merchant registration with automatic store creation
router.post("/merchant-register", limiterInscriptions, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      businessName: z.string().min(1).max(200),
      email: champEmail(),
      password: champMotDePasse(),
      // Le genre en code (« restaurant ») ; les anciennes graphies
      // (« Restaurant », « RESTAURANT ») sont encore comprises.
      businessType: z.string().min(1).max(50),
      cuisineType: z.string().max(50).optional().nullable(),
      // Les coordonnées de l'adresse retenue, quand la suggestion les donne.
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      phone: z.string().min(1).max(20),
      address: z.string().min(1).max(500),
      city: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      // Pays du commerce (« BE », « FR ») : fixe les règles de facturation.
      country: z.enum(["BE", "FR"]).optional(),
      website: z.string().url().optional().nullable(),
      description: z.string().min(1).max(1000),
      storeName: z.string().min(1).max(200),
      storeSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      ...champAcceptation,
    });

    const body = schema.parse(req.body);

    const genre = normaliserGenre(body.businessType, body.cuisineType);
    if (!genre.businessType) {
      throw new ApiError(400, "Type de commerce inconnu", "INVALID_BUSINESS_TYPE");
    }

    logger.info("Merchant registration attempt", { email: body.email, businessName: body.businessName });

    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      throw new ApiError(400, "Cet email est déjà utilisé", "EMAIL_EXISTS");
    }

    // Check if organization slug exists
    const existingOrg = await db.organization.findUnique({
      where: { slug: body.storeSlug },
    });

    if (existingOrg) {
      throw new ApiError(400, "Cette URL est déjà utilisée", "SLUG_EXISTS");
    }

    // Hash password
    const passwordHash = await AuthService.hashPassword(body.password);

    // Aucun droit sur la plateforme à l'inscription (voir POST /signup).
    const user = await db.user.create({
      data: {
        email: body.email,
        name: body.businessName,
        passwordHash,
        emailVerified: false,
        status: "ACTIVE",
      },
    });

    await enregistrerAcceptation(req, {
      email: user.email,
      userId: user.id,
      documents: ["cgu", "conditions-commercants", "confidentialite"],
    });

    // Create organization
    // Le commerce attend la validation de la plateforme (`approvedAt` vide) :
    // il prépare sa boutique, il ne l'ouvre pas encore.
    const organization = await db.organization.create({
      data: {
        name: body.businessName,
        email: body.email,
        slug: body.storeSlug,
        tier: "FREE",
        plan: "STARTER",
        status: "ACTIVE",
        ...(body.country && { billingCountry: body.country === "BE" ? "Belgique" : "France" }),
        approvedAt: null,
      },
    });

    // Create membership
    await db.membership.create({
      data: {
        userId: user.id,
        orgId: organization.id,
        role: "ADMIN",
        storeIds: [],
      },
    });

    // La même création que POST /api/stores : située, et genrée dans le
    // champ `businessType` que lit la recherche.
    const store = await StoreService.create({
      orgId: organization.id,
      name: body.storeName,
      slug: body.storeSlug,
      address: body.address,
      city: body.city,
      postalCode: body.postalCode,
      phone: body.phone,
      email: body.email,
      description: body.description,
      latitude: body.latitude,
      longitude: body.longitude,
      businessType: genre.businessType,
      cuisineType: genre.cuisineType ?? undefined,
      ...(body.website && { settings: { website: body.website } }),
    });

    // Update membership with store ID
    await db.membership.update({
      where: {
        userId_orgId: {
          userId: user.id,
          orgId: organization.id,
        },
      },
      data: {
        storeIds: [store.id],
      },
    });

    // Une session par connexion : les jetons la portent, et la fermer les
    // invalide sur tous les domaines (voir sso.service.ts).
    const { accessToken, refreshToken } = await SsoService.connecter(user.id);

    logger.info("Merchant registered successfully", {
      userId: user.id,
      organizationId: organization.id,
      storeId: store.id,
    });

    res.status(201).json({
      message: "Inscription réussie et boutique créée!",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        url: `/store/${store.slug}`,
      },
      organizationId: organization.id,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// CONFIRMATION D'ADRESSE ET MOT DE PASSE OUBLIÉ
// ============================================================================

/**
 * Adresse du site pour les liens envoyés par courriel. Les pages visées sont
 * communes à tous les domaines, n'importe lequel convient donc.
 */
const adresseDuSite = () =>
  (process.env.SITE_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Enregistre un lien de confirmation et le fait partir, sans jamais faire
 * échouer ni ralentir l'appelant.
 *
 * Seul le jeton est attendu : il doit exister en base avant que le lien
 * puisse être cliqué. L'envoi, lui, part sans être attendu — un serveur de
 * courriel injoignable retenait la réponse de l'inscription de longues
 * secondes, et le visiteur qui réessayait tombait sur « adresse déjà
 * utilisée » alors que son compte venait d'être créé.
 */
async function envoyerConfirmation(user: { id: string; email: string; name: string | null }) {
  const { jeton, empreinte, expireLe } = AccountTokenService.emettre(DUREE_CONFIRMATION_MS);

  await db.user.update({
    where: { id: user.id },
    data: { emailTokenHash: empreinte, emailTokenExpiresAt: expireLe },
  });

  const lien = `${adresseDuSite()}/verifier-email?jeton=${jeton}`;

  EmailService.sendEmailVerification(user.email, user.name, lien).catch((err) => {
    // Un serveur de courriel indisponible ne doit pas empêcher l'inscription :
    // le message peut être redemandé plus tard.
    logger.warn("Envoi de la confirmation d'adresse impossible", {
      email: user.email,
      error: err instanceof Error ? err.message : err,
    });
  });
}

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
      const email = body.email.toLowerCase();

      const user = await db.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, status: true },
      });

      // La réponse ne dit jamais si l'adresse existe : sinon ce formulaire
      // devient un moyen de vérifier qui est inscrit chez nous.
      const reponse = {
        message:
          "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé.",
      };

      if (!user || user.status !== "ACTIVE") {
        logger.info("Réinitialisation demandée pour une adresse sans compte actif", { email });
        res.json(reponse);
        return;
      }

      const { jeton, empreinte, expireLe } = AccountTokenService.emettre(
        DUREE_REINITIALISATION_MS
      );

      await db.user.update({
        where: { id: user.id },
        data: { resetTokenHash: empreinte, resetTokenExpiresAt: expireLe },
      });

      const lien = `${adresseDuSite()}/reinitialiser?jeton=${jeton}`;

      // Envoi non attendu : un serveur de courriel lent retiendrait la réponse,
      // et cette attente trahirait, par sa seule durée, qu'un compte existe à
      // cette adresse.
      EmailService.sendPasswordReset(user.email, user.name, lien).catch((err) => {
        logger.error("Envoi du lien de réinitialisation impossible", {
          email,
          error: err instanceof Error ? err.message : err,
        });
      });

      await SecurityEventService.record({
        action: "PASSWORD_RESET_REQUESTED",
        actor: user.email,
        severity: "LOW",
        details: "Lien de réinitialisation demandé",
      });

      res.json(reponse);
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

      // On retrouve le compte par l'empreinte : le jeton en clair n'est nulle
      // part en base.
      const user = await db.user.findUnique({
        where: { resetTokenHash: AccountTokenService.empreinte(body.jeton) },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          resetTokenHash: true,
          resetTokenExpiresAt: true,
        },
      });

      const lienInvalide = new ApiError(
        400,
        "Ce lien n'est plus valable. Demandez-en un nouveau.",
        "INVALID_RESET_TOKEN"
      );

      if (!user || !AccountTokenService.correspond(body.jeton, user.resetTokenHash)) {
        throw lienInvalide;
      }

      if (AccountTokenService.expire(user.resetTokenExpiresAt)) {
        throw lienInvalide;
      }

      if (user.status !== "ACTIVE") {
        throw new ApiError(403, "Ce compte est désactivé", "ACCOUNT_DISABLED");
      }

      const passwordHash = await AuthService.hashPassword(body.password);

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            // Quelqu'un d'autre avait peut-être le mot de passe : ses sessions
            // tombent avec lui.
            passwordChangedAt: new Date(),
            // Un jeton ne sert qu'une fois.
            resetTokenHash: null,
            resetTokenExpiresAt: null,
            // Recevoir ce lien prouve que l'adresse est bien la sienne.
            emailVerified: true,
            emailTokenHash: null,
            emailTokenExpiresAt: null,
          },
        });
        await tx.sessionConnexion.updateMany({
          where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() },
        });
      });

      // L'adresse étant prouvée, la fiche client invité rejoint le compte.
      await rattacherFicheInvite(user);

      await SecurityEventService.record({
        action: "PASSWORD_RESET",
        actor: user.email,
        severity: "HIGH",
        details: "Mot de passe changé via un lien de réinitialisation",
      });

      oublierCompte(user.id);
      // Toutes les sessions, cookie de zupone.com compris : celui qui avait le
      // mot de passe volé ne se fait plus remettre de jetons neufs.
      logger.info("Mot de passe réinitialisé", { userId: user.id });

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

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, passwordHash: true },
      });

      if (!user || !user.passwordHash || !(await AuthService.comparePassword(body.currentPassword, user.passwordHash))) {
        throw new ApiError(400, "Mot de passe actuel incorrect.", "INVALID_CURRENT_PASSWORD");
      }

      if (body.currentPassword === body.newPassword) {
        throw new ApiError(400, "Le nouveau mot de passe doit être différent de l'actuel.", "SAME_PASSWORD");
      }

      // La révocation en transaction ferme aussi les jetons émis dans cette seconde.
      const changeLe = new Date(Math.floor(Date.now() / 1000) * 1000);

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash: await AuthService.hashPassword(body.newPassword),
            // Ferme les sessions ouvertes ailleurs.
            passwordChangedAt: changeLe,
            // Un lien de réinitialisation en attente ne doit plus servir.
            resetTokenHash: null,
            resetTokenExpiresAt: null,
          },
        });
        await tx.sessionConnexion.updateMany({
          where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() },
        });
      });

      await SecurityEventService.record({
        action: "PASSWORD_CHANGED",
        actor: user.email,
        severity: "MEDIUM",
        details: "Mot de passe changé depuis le profil",
      });

      oublierCompte(user.id);
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

    const user = await db.user.findUnique({
      where: { emailTokenHash: AccountTokenService.empreinte(body.jeton) },
      select: { id: true, email: true, emailTokenHash: true, emailTokenExpiresAt: true },
    });

    if (!user || !AccountTokenService.correspond(body.jeton, user.emailTokenHash)) {
      throw new ApiError(
        400,
        "Ce lien de confirmation n'est pas valable.",
        "INVALID_EMAIL_TOKEN"
      );
    }

    if (AccountTokenService.expire(user.emailTokenExpiresAt)) {
      throw new ApiError(
        400,
        "Ce lien de confirmation a expiré. Demandez-en un nouveau.",
        "EXPIRED_EMAIL_TOKEN"
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailTokenHash: null, emailTokenExpiresAt: null },
    });

    logger.info("Adresse confirmée", { userId: user.id });

    // L'adresse est prouvée : la fiche client née d'une commande sans compte
    // rejoint maintenant le compte.
    await rattacherFicheInvite(user);

    res.json({ message: "Adresse confirmée.", email: user.email });
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

      if (!userId && !demande.email) {
        throw new ApiError(400, "Indiquez votre adresse e-mail", "MISSING_EMAIL");
      }

      const user = await db.user.findUnique({
        where: userId ? { id: userId } : { email: demande.email!.toLowerCase() },
        select: { id: true, email: true, name: true, emailVerified: true, status: true },
      });

      // Connecté, on peut être précis. Sans session, la réponse est la même
      // que le compte existe ou non : sinon ce formulaire dirait qui est
      // inscrit.
      if (!userId) {
        if (user && !user.emailVerified && user.status === "ACTIVE") {
          await envoyerConfirmation(user);
        }

        res.json({
          message:
            "Si un compte existe pour cette adresse et n'est pas encore confirmé, un lien vient d'y être envoyé.",
        });
        return;
      }

      if (!user) {
        throw new ApiError(404, "Compte introuvable", "USER_NOT_FOUND");
      }

      if (user.emailVerified) {
        res.json({ message: "Votre adresse est déjà confirmée.", emailVerified: true });
        return;
      }

      await envoyerConfirmation(user);

      res.json({ message: "Un nouveau lien vient de vous être envoyé.", emailVerified: false });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
