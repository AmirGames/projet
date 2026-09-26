import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;

export interface PaymentMethodData {
  type: string;
  name: string;
  config?: any;
  isDefault?: boolean;
  commissionPercent?: number;
  fixedFee?: number;
}

export class PaymentMethodService {
  static async getPaymentMethods(storeId: string, options?: { skip?: number; take?: number }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const [methods, total] = await Promise.all([
        db.paymentMethod.findMany({
          where: { storeId },
          skip,
          take,
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        }),
        db.paymentMethod.count({ where: { storeId } }),
      ]);

      return {
        data: methods,
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getPaymentMethod(storeId: string, methodId: string) {
    try {
      const method = await db.paymentMethod.findUnique({
        where: { id: methodId },
      });

      if (!method || method.storeId !== storeId) {
        throw new ApiError(404, "Payment method not found", "PAYMENT_METHOD_NOT_FOUND");
      }

      return method;
    } catch (error) {
      throw error;
    }
  }

  static async createPaymentMethod(storeId: string, data: PaymentMethodData) {
    try {
      if (data.isDefault) {
        await db.paymentMethod.updateMany({
          where: { storeId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const method = await db.paymentMethod.create({
        data: {
          storeId,
          type: data.type as any,
          name: data.name,
          config: data.config || {},
          isDefault: data.isDefault || false,
          commissionPercent: new Decimal(data.commissionPercent || 0),
          fixedFee: new Decimal(data.fixedFee || 0),
          isActive: true,
        },
      });

      return method;
    } catch (error) {
      throw error;
    }
  }

  static async updatePaymentMethod(storeId: string, methodId: string, data: Partial<PaymentMethodData>) {
    try {
      const method = await db.paymentMethod.findUnique({
        where: { id: methodId },
      });

      if (!method || method.storeId !== storeId) {
        throw new ApiError(404, "Payment method not found", "PAYMENT_METHOD_NOT_FOUND");
      }

      if (data.isDefault && !method.isDefault) {
        await db.paymentMethod.updateMany({
          where: { storeId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.config !== undefined) updateData.config = data.config;
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
      if (data.commissionPercent !== undefined) updateData.commissionPercent = new Decimal(data.commissionPercent);
      if (data.fixedFee !== undefined) updateData.fixedFee = new Decimal(data.fixedFee);

      const updated = await db.paymentMethod.update({
        where: { id: methodId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async togglePaymentMethod(storeId: string, methodId: string) {
    try {
      const method = await db.paymentMethod.findUnique({
        where: { id: methodId },
      });

      if (!method || method.storeId !== storeId) {
        throw new ApiError(404, "Payment method not found", "PAYMENT_METHOD_NOT_FOUND");
      }

      const updated = await db.paymentMethod.update({
        where: { id: methodId },
        data: { isActive: !method.isActive },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async deletePaymentMethod(storeId: string, methodId: string) {
    try {
      const method = await db.paymentMethod.findUnique({
        where: { id: methodId },
      });

      if (!method || method.storeId !== storeId) {
        throw new ApiError(404, "Payment method not found", "PAYMENT_METHOD_NOT_FOUND");
      }

      await db.paymentMethod.delete({
        where: { id: methodId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  static async getDefaultPaymentMethod(storeId: string) {
    try {
      const method = await db.paymentMethod.findFirst({
        where: { storeId, isDefault: true, isActive: true },
      });

      return method || null;
    } catch (error) {
      throw error;
    }
  }

  static async getActivePaymentMethods(storeId: string) {
    try {
      const methods = await db.paymentMethod.findMany({
        where: { storeId, isActive: true },
        orderBy: { isDefault: "desc" },
      });

      return methods;
    } catch (error) {
      throw error;
    }
  }
}
