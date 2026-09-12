import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";

export type StaffRole = "MANAGER" | "CASHIER" | "KITCHEN" | "DELIVERY" | "SUPPORT";

export interface StaffData {
  storeId: string;
  name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  permissions?: string[];
}

export class StaffService {
  static async create(data: StaffData) {
    try {
      if (!data.name || !data.email) {
        throw new ApiError(400, "Name and email are required", "MISSING_FIELDS");
      }

      const staff = await db.staff.create({
        data: {
          storeId: data.storeId,
          name: data.name,
          email: data.email.toLowerCase(),
          phone: data.phone,
          role: data.role || "CASHIER",
          permissions: data.permissions || [],
        },
      });

      return staff;
    } catch (error: any) {
      if (error.code === "P2002") {
        throw new ApiError(409, "Email already exists for this store", "EMAIL_EXISTS");
      }
      throw error;
    }
  }

  static async getById(id: string) {
    const staff = await db.staff.findUnique({
      where: { id },
    });

    if (!staff) {
      throw new ApiError(404, "Staff member not found", "STAFF_NOT_FOUND");
    }

    return staff;
  }

  static async getByStoreId(storeId: string) {
    return await db.staff.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getByOrgId(orgId: string) {
    return await db.staff.findMany({
      where: {
        store: { orgId },
      },
      include: {
        store: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async update(id: string, data: Partial<StaffData>) {
    try {
      return await db.staff.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.email && { email: data.email.toLowerCase() }),
          ...(data.phone && { phone: data.phone }),
          ...(data.role && { role: data.role }),
          ...(data.permissions && { permissions: data.permissions }),
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Staff member not found", "STAFF_NOT_FOUND");
      }
      if (error.code === "P2002") {
        throw new ApiError(409, "Email already exists for this store", "EMAIL_EXISTS");
      }
      throw error;
    }
  }

  static async updateStatus(id: string, status: "ACTIVE" | "INACTIVE" | "SUSPENDED") {
    try {
      return await db.staff.update({
        where: { id },
        data: { status },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Staff member not found", "STAFF_NOT_FOUND");
      }
      throw error;
    }
  }

  static async delete(id: string) {
    try {
      return await db.staff.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Staff member not found", "STAFF_NOT_FOUND");
      }
      throw error;
    }
  }

  static async countByStoreId(storeId: string) {
    return await db.staff.count({
      where: { storeId },
    });
  }

  static async countActiveByStoreId(storeId: string) {
    return await db.staff.count({
      where: { storeId, status: "ACTIVE" },
    });
  }
}
