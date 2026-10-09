import type { Request } from "express";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { AuthService } from "./auth.service";
import { SsoService } from "./sso.service";
import { UserService } from "./user.service";
import { enregistrerAcceptation } from "../legal/acceptation-conditions.service";
import { StoreService } from "../stores/store.service";
import { normaliserGenre } from "../stores/store-type.service";
import { confirmationExigee, confirmationAEnvoyer, envoyerConfirmation } from "./auth-confirmation.service";
import { codeErreur } from "../../utils/code-erreur";

/** La même réponse pour toute inscription quand la confirmation est exigée. */
export const REPONSE_INSCRIPTION_A_CONFIRMER = {
  message: "Si cette adresse peut être inscrite, un e-mail de confirmation vient d'y être envoyé. Ouvrez le lien qu'il contient pour vous connecter.",
  emailVerificationRequired: true,
};

export type InscriptionClient = { email: string; name?: string | null; password: string };

export type DemandeCommerce = {
  businessName: string;
  storeName: string;
  storeSlug: string;
  businessType: string;
  cuisineType?: string | null;
  latitude?: number;
  longitude?: number;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  description: string;
};

export type InscriptionCommercant = DemandeCommerce & {
  email: string;
  password: string;
  country?: "BE" | "FR";
  website?: string | null;
};

export type CandidatureLivreur = { phone: string; vehicleType: "car" | "scooter" | "bike"; vehiclePlate?: string };

/** Inscriptions : client, commerçant (avec sa boutique) et candidature de livreur. */
export const AuthInscriptionService = {
  /**
   * Inscription d'un client. Renvoie `{ aConfirmer: true }` quand la
   * confirmation d'adresse est exigée (aucune session avant), sinon les
   * jetons de la session ouverte.
   */
  async inscrireClient(req: Request, body: InscriptionClient) {
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
          await envoyerConfirmation(compteExistant);
        }
        return { aConfirmer: true as const };
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
    let user;
    try {
      user = await db.$transaction(async (tx) => {
        const compte = await tx.user.create({ data: { email: body.email, name: body.name, passwordHash } });
        await enregistrerAcceptation(req, {
          email: compte.email, userId: compte.id, documents: ["cgu", "cgv", "confidentialite"],
        }, tx);
        // Ne jamais rattacher une fiche invitée avant la preuve de l'adresse.
        // ON CONFLICT évite aussi la course avec une commande invitée simultanée.
        await tx.customer.createMany({
          data: { userId: compte.id, name: body.name || compte.email.split("@")[0], email: compte.email },
          skipDuplicates: true,
        });
        if (confirmationAEnvoyer()) await envoyerConfirmation(compte, tx);
        return compte;
      });
    } catch (err) {
      if (codeErreur(err) !== "P2002" || !(await db.user.findUnique({ where: { email: body.email } }))) throw err;
      // L'autre inscription a gagné et préparé son e-mail dans sa transaction.
      if (confirmationExigee()) return { aConfirmer: true as const };
      throw new ApiError(409, "Cet email est déjà utilisé", "EMAIL_EXISTS");
    }

    // Confirmation exigée : aucune session avant d'avoir prouvé qu'on possède
    // l'adresse (la connexion la refuse déjà, l'inscription ne la contourne pas).
    if (confirmationExigee()) {
      return { aConfirmer: true as const };
    }

    // Une session par connexion : les jetons la portent, et la fermer les
    // invalide sur tous les domaines (voir sso.service.ts).
    const { accessToken, refreshToken } = await SsoService.connecter(user.id);

    return { aConfirmer: false as const, accessToken, refreshToken, user };
  },

  /** Un client existant ouvre un commerce (organisation, adhésion, boutique). */
  async devenirCommercant(userId: string, body: DemandeCommerce) {
    const genre = normaliserGenre(body.businessType, body.cuisineType);
    if (!genre.businessType) {
      throw new ApiError(400, "Type de commerce inconnu", "INVALID_BUSINESS_TYPE");
    }

    const user = await UserService.getUserById(userId);
    const businessType = genre.businessType;

    // Check if slug already exists
    const existingOrg = await db.organization.findUnique({
      where: { slug: body.storeSlug },
    });

    if (existingOrg) {
      throw new ApiError(400, "Cette URL est déjà utilisée", "SLUG_EXISTS");
    }

    const situation = await StoreService.situer(body);
    let creation;
    try {
      creation = await db.$transaction(async (tx) => {
        // Create organization
        // Le commerce attend la validation de la plateforme (`approvedAt` vide) :
        // il prépare sa boutique, il ne l'ouvre pas encore.
        const organization = await tx.organization.create({
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
        await tx.membership.create({
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
          businessType,
          cuisineType: genre.cuisineType ?? undefined,
        }, { client: tx, situation });

        // Update membership with store ID
        await tx.membership.update({
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

        return { organization, store };
      });
    } catch (err) {
      if (codeErreur(err) === "P2002") throw new ApiError(409, "Cette URL est déjà utilisée", "SLUG_EXISTS");
      throw err;
    }
    const { organization, store } = creation;

    logger.info("User became merchant", {
      userId,
      organizationId: organization.id,
      storeId: store.id,
    });

    return { organization, store };
  },

  /** Un client existant dépose sa candidature de livreur, dans la même session. */
  async devenirLivreur(userId: string, sid: string, body: CandidatureLivreur) {
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

    return { accessToken, refreshToken, driver };
  },

  /** Inscription d'un commerçant : compte, organisation, adhésion, boutique et session. */
  async inscrireCommercant(req: Request, body: InscriptionCommercant) {
    const genre = normaliserGenre(body.businessType, body.cuisineType);
    if (!genre.businessType) {
      throw new ApiError(400, "Type de commerce inconnu", "INVALID_BUSINESS_TYPE");
    }
    const businessType = genre.businessType;

    logger.info("Merchant registration attempt", { email: body.email, businessName: body.businessName });

    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      if (confirmationExigee()) {
        await AuthService.hashPassword(body.password);
        if (!existingUser.emailVerified && existingUser.status === "ACTIVE") await envoyerConfirmation(existingUser);
        return { aConfirmer: true as const };
      }
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
    const situation = await StoreService.situer(body);
    let creation;
    try {
      creation = await db.$transaction(async (tx) => {

        // Aucun droit sur la plateforme à l'inscription (voir inscrireClient).
        const user = await tx.user.create({
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
        }, tx);

        // Create organization
        // Le commerce attend la validation de la plateforme (`approvedAt` vide) :
        // il prépare sa boutique, il ne l'ouvre pas encore.
        const organization = await tx.organization.create({
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
        await tx.membership.create({
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
          businessType,
          cuisineType: genre.cuisineType ?? undefined,
          ...(body.website && { settings: { website: body.website } }),
        }, { client: tx, situation });

        // Update membership with store ID
        await tx.membership.update({
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

        if (confirmationAEnvoyer()) await envoyerConfirmation(user, tx);
        return { user, organization, store };
      });
    } catch (err) {
      if (codeErreur(err) !== "P2002") throw err;
      if (await db.user.findUnique({ where: { email: body.email } })) {
        if (confirmationExigee()) return { aConfirmer: true as const };
        throw new ApiError(400, "Cet email est déjà utilisé", "EMAIL_EXISTS");
      }
      throw new ApiError(409, "Cette URL est déjà utilisée", "SLUG_EXISTS");
    }
    const { user, organization, store } = creation;
    if (confirmationExigee()) return { aConfirmer: true as const };

    // Une session par connexion : les jetons la portent, et la fermer les
    // invalide sur tous les domaines (voir sso.service.ts).
    const { accessToken, refreshToken } = await SsoService.connecter(user.id);

    logger.info("Merchant registered successfully", {
      userId: user.id,
      organizationId: organization.id,
      storeId: store.id,
    });

    return { aConfirmer: false as const, accessToken, refreshToken, user, organization, store };
  },
};
