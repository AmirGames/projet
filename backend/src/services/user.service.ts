import { db } from "./db";
import { AuthService } from "./auth.service";
import { ApiError } from "../middleware/errorHandler";

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
    } catch (error: any) {
      if (error.code === "P2002" && error.meta?.target?.includes("email")) {
        throw new ApiError(409, "Email already exists", "EMAIL_EXISTS");
      }
      throw error;
    }
  }

  static async getUserByEmail(email: string) {
    const user = await db.user.findUnique({
      where: { email },
    });

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
    } catch (error: any) {
      if (error.code === "P2002" && error.meta?.target?.includes("slug")) {
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
