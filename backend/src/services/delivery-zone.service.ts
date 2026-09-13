import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface DeliveryZoneData {
  storeId: string;
  name: string;
  polygon?: {
    type: "Point";
    coordinates: [number, number]; // [latitude, longitude]
  };
  baseFee: number;
  minOrder: number;
}

export class DeliveryZoneService {
  static async create(data: DeliveryZoneData) {
    try {
      if (!data.name || !data.baseFee) {
        throw new ApiError(400, "Name and base fee are required", "MISSING_FIELDS");
      }

      const zone = await db.deliveryZone.create({
        data: {
          storeId: data.storeId,
          name: data.name,
          polygon: (data.polygon || null) as any,
          baseFee: data.baseFee,
          minOrder: data.minOrder || 0,
        },
      });

      return zone;
    } catch (error: any) {
      if (error.code === "P2002") {
        throw new ApiError(409, "Zone name already exists for this store", "ZONE_EXISTS");
      }
      throw error;
    }
  }

  static async getById(id: string) {
    const zone = await db.deliveryZone.findUnique({
      where: { id },
    });

    if (!zone) {
      throw new ApiError(404, "Delivery zone not found", "ZONE_NOT_FOUND");
    }

    return zone;
  }

  static async getByStoreId(storeId: string) {
    return await db.deliveryZone.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async update(id: string, data: Partial<DeliveryZoneData>) {
    try {
      return await db.deliveryZone.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.polygon && { polygon: data.polygon }),
          ...(data.baseFee !== undefined && { baseFee: data.baseFee }),
          ...(data.minOrder !== undefined && { minOrder: data.minOrder }),
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Delivery zone not found", "ZONE_NOT_FOUND");
      }
      throw error;
    }
  }

  static async delete(id: string) {
    try {
      return await db.deliveryZone.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Delivery zone not found", "ZONE_NOT_FOUND");
      }
      throw error;
    }
  }

  static async getByOrgId(orgId: string) {
    return await db.deliveryZone.findMany({
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
}
