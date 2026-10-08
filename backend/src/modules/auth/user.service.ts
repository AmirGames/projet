import { db } from "../../services/db";
import { AuthService } from "./auth.service";
import { ApiError } from "../../middleware/errorHandler";

/** Violation d'unicité (P2002) portant sur ce champ. */
function conflitUnique(error: unknown, champ: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") return false;
  const cible = "meta" in error && typeof error.meta === "object" && error.meta !== null && "target" in error.meta ? error.meta.target : undefined;
  return Array.isArray(cible) || typeof cible === "string" ? cible.includes(champ) : false;
}

export class UserService {
  static async createUser(email: string, password: string, name?: string) {
    const passwordHash = await AuthService.hashPassword(password);

    try {
      const user = await db.user.create({
        data: {
          email,
          name,
          passwordHash,
        },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
      };
    } catch (error) {
      if (conflitUnique(error, "email")) {
        throw new ApiError(409, "Email already exists", "EMAIL_EXISTS");
      }
      throw error;
    }
  }

  static async getUserByEmail(email: string) {
    /**
     * L'adresse arrive en minuscules, et la migration 0014 y a ramené les
     * comptes existants — sauf ceux qu'elle ne pouvait pas convertir sans
     * collision (« Jean@x.fr » et « jean@x.fr » inscrits tous deux). Pour
     * ceux-là, on cherche sans tenir compte de la casse, et seulement si un
     * compte unique répond : entre deux, on ne choisit pas au hasard.
     */
    let user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      const proches = await db.user.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        take: 2,
      });
      if (proches.length === 1) user = proches[0];
    }

    if (!user) {
      throw new ApiError(404, "User not found", "USER_NOT_FOUND");
    }

    return user;
  }

  static async getUserById(id: string) {
    const user = await db.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            org: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "User not found", "USER_NOT_FOUND");
    }

    return user;
  }

  static async createOrganization(name: string, slug: string, userId: string) {
    try {
      const org = await db.organization.create({
        data: {
          name,
          slug,
          memberships: {
            create: {
              userId,
              role: "ADMIN",
            },
          },
        },
      });

      return org;
    } catch (error) {
      if (conflitUnique(error, "slug")) {
        throw new ApiError(409, "Organization slug already exists", "SLUG_EXISTS");
      }
      throw error;
    }
  }

  static async getUserOrganizations(userId: string) {
    const memberships = await db.membership.findMany({
      where: { userId },
      include: {
        org: {
          include: {
            stores: true,
          },
        },
      },
    });

    return memberships;
  }
}
