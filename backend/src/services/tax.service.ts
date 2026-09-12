import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";
import { Decimal } from "@prisma/client/runtime/library.js";

export interface TaxSettingData {
  name: string;
  rate: number;
  applicableTo?: string;
  categoryIds?: string[];
  productIds?: string[];
}

export class TaxService {
  static async getTaxSettings(storeId: string, options?: { skip?: number; take?: number; status?: string }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: any = { storeId };
      if (options?.status) {
        whereClause.status = options.status;
      }

      const [taxSettings, total] = await Promise.all([
        db.taxSetting.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        db.taxSetting.count({ where: whereClause }),
      ]);

      return {
        data: taxSettings,
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getTaxSetting(storeId: string, taxSettingId: string) {
    try {
      const taxSetting = await db.taxSetting.findUnique({
        where: { id: taxSettingId },
      });

      if (!taxSetting || taxSetting.storeId !== storeId) {
        throw new ApiError(404, "Tax setting not found", "TAX_SETTING_NOT_FOUND");
      }

      return taxSetting;
    } catch (error) {
      throw error;
    }
  }

  static async createTaxSetting(storeId: string, data: TaxSettingData) {
    try {
      if (data.rate < 0 || data.rate > 100) {
        throw new ApiError(400, "Tax rate must be between 0 and 100", "INVALID_TAX_RATE");
      }

      const taxSetting = await db.taxSetting.create({
        data: {
          storeId,
          name: data.name,
          rate: new Decimal(data.rate),
          applicableTo: data.applicableTo || "all",
          categoryIds: data.categoryIds || [],
          productIds: data.productIds || [],
          status: "ACTIVE",
        },
      });

      return taxSetting;
    } catch (error) {
      throw error;
    }
  }

  static async updateTaxSetting(storeId: string, taxSettingId: string, data: Partial<TaxSettingData>) {
    try {
      const taxSetting = await db.taxSetting.findUnique({
        where: { id: taxSettingId },
      });

      if (!taxSetting || taxSetting.storeId !== storeId) {
        throw new ApiError(404, "Tax setting not found", "TAX_SETTING_NOT_FOUND");
      }

      if (data.rate !== undefined && (data.rate < 0 || data.rate > 100)) {
        throw new ApiError(400, "Tax rate must be between 0 and 100", "INVALID_TAX_RATE");
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.rate !== undefined) updateData.rate = new Decimal(data.rate);
      if (data.applicableTo !== undefined) updateData.applicableTo = data.applicableTo;
      if (data.categoryIds !== undefined) updateData.categoryIds = data.categoryIds;
      if (data.productIds !== undefined) updateData.productIds = data.productIds;

      const updated = await db.taxSetting.update({
        where: { id: taxSettingId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async deleteTaxSetting(storeId: string, taxSettingId: string) {
    try {
      const taxSetting = await db.taxSetting.findUnique({
        where: { id: taxSettingId },
      });

      if (!taxSetting || taxSetting.storeId !== storeId) {
        throw new ApiError(404, "Tax setting not found", "TAX_SETTING_NOT_FOUND");
      }

      await db.taxSetting.delete({
        where: { id: taxSettingId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  static async calculateTax(storeId: string, amount: number, categoryIds?: string[], productIds?: string[]) {
    try {
      const whereClause: any = {
        storeId,
        status: "ACTIVE",
      };

      const taxSettings = await db.taxSetting.findMany({
        where: whereClause,
      });

      let totalTaxAmount = 0;

      for (const tax of taxSettings) {
        let applies = false;

        if (tax.applicableTo === "all") {
          applies = true;
        } else if (tax.applicableTo === "categories" && categoryIds) {
          applies = categoryIds.some((id) => tax.categoryIds.includes(id));
        } else if (tax.applicableTo === "products" && productIds) {
          applies = productIds.some((id) => tax.productIds.includes(id));
        }

        if (applies) {
          const taxAmount = amount * (Number(tax.rate) / 100);
          totalTaxAmount += taxAmount;
        }
      }

      return {
        totalTaxAmount: parseFloat(totalTaxAmount.toFixed(2)),
        breakdown: taxSettings.map((tax) => ({
          name: tax.name,
          rate: Number(tax.rate),
        })),
      };
    } catch (error) {
      throw error;
    }
  }
}
