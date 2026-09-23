import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export class OrganizationService {
  static async create(data: {
    name: string;
    slug: string;
    userId: string;
  }) {
    try {
      const org = await db.organization.create({
        data: {
          name: data.name,
          slug: data.slug,
        },
      });

      await db.membership.create({
        data: {
          userId: data.userId,
          orgId: org.id,
          role: "ADMIN",
        },
      });

      return org;
    } catch (err: any) {
      if (err.code === "P2002") {
        throw new ApiError(400, "Organization slug already exists", "DUPLICATE_SLUG");
      }
      throw err;
    }
  }

  static async getById(id: string) {
    const org = await db.organization.findUnique({
      where: { id },
      include: {
        stores: true,
        memberships: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });

    if (!org) {
      throw new ApiError(404, "Organization not found", "ORG_NOT_FOUND");
    }

    return org;
  }

  static async getBySlug(slug: string) {
    // Route publique : ni IBAN, ni identité du propriétaire, ni e-mails des
    // membres — rien de ce que seule la plateforme et le commerçant voient.
    const org = await db.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        approvedAt: true,
        stores: {
          where: { deletedAt: null },
          select: { id: true, name: true, slug: true, city: true, isOpen: true },
        },
      },
    });

    if (!org) {
      throw new ApiError(404, "Organization not found", "ORG_NOT_FOUND");
    }

    return org;
  }

  static async getByUserId(userId: string) {
    return await db.organization.findMany({
      where: {
        memberships: {
          some: { userId },
        },
      },
      include: {
        stores: true,
        memberships: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
  }

  static async update(id: string, data: { name?: string; tier?: string }) {
    try {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.tier !== undefined) updateData.tier = data.tier;

      return await db.organization.update({
        where: { id },
        data: updateData,
        include: {
          stores: true,
          memberships: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        },
      });
    } catch (err: any) {
      if (err.code === "P2025") {
        throw new ApiError(404, "Organization not found", "ORG_NOT_FOUND");
      }
      throw err;
    }
  }

  static async delete(id: string) {
    try {
      await db.organization.delete({
        where: { id },
      });
    } catch (err: any) {
      if (err.code === "P2025") {
        throw new ApiError(404, "Organization not found", "ORG_NOT_FOUND");
      }
      throw err;
    }
  }
}