import { randomUUID } from "crypto";
import { db } from "./db.js";
import { EmailService } from "./email.service.js";
import { logger } from "../config/logger.js";

export interface OrderData {
  storeId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryType: "PICKUP" | "DELIVERY";
  pickupTime?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostal?: string;
  totalAmount: number;
  taxAmount?: number;
  feesAmount?: number;
}

export class OrderService {
  // Create order
  static async create(data: OrderData) {
    try {
      const orderId = randomUUID();

      db.prepare(
        `INSERT INTO "Order" (id, "storeId", "customerName", "customerEmail", "customerPhone", "deliveryType", "pickupTime", "deliveryAddress", "deliveryCity", "deliveryPostal", "totalAmount", "taxAmount", "feesAmount", status, "paymentStatus", "createdAt", "updatedAt") 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(
        orderId,
        data.storeId,
        data.customerName,
        data.customerEmail,
        data.customerPhone,
        data.deliveryType,
        data.pickupTime || null,
        data.deliveryAddress || null,
        data.deliveryCity || null,
        data.deliveryPostal || null,
        data.totalAmount,
        data.taxAmount || 0,
        data.feesAmount || 0,
        "PENDING",
        "PENDING"
      );

      // Send confirmation email
      try {
        const createdOrder = await this.getById(orderId);
        await EmailService.sendOrderConfirmation(createdOrder);
      } catch (emailErr) {
        logger.warn("Email notification failed, but order was created", { error: emailErr });
      }

      return this.getById(orderId);
    } catch (err) {
      throw err;
    }
  }

  // Get order by ID
  static async getById(id: string) {
    const result = db
      .prepare('SELECT * FROM "Order" WHERE id = ?')
      .get(id);
    return result;
  }

  // Get orders by store
  static async getByStoreId(storeId: string, limit: number = 100, offset: number = 0) {
    const result = db
      .prepare(
        'SELECT * FROM "Order" WHERE "storeId" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?'
      )
      .all(storeId, limit, offset);
    return result;
  }

  // Get orders by status
  static async getByStatus(storeId: string, status: string) {
    const result = db
      .prepare(
        'SELECT * FROM "Order" WHERE "storeId" = ? AND status = ? ORDER BY "createdAt" DESC'
      )
      .all(storeId, status);
    return result;
  }

  // Update order status
  static async updateStatus(id: string, status: string) {
    try {
      const validStatuses = ["PENDING", "ACCEPTED", "REJECTED", "READY", "COMPLETED"];
      
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const result = db
        .prepare(
          `UPDATE "Order" SET status = ?, "updatedAt" = datetime('now') WHERE id = ? RETURNING *`
        )
        .get(status, id);

      // Send status update email
      if (result) {
        try {
          await EmailService.sendOrderStatusUpdate(result, status);
        } catch (emailErr) {
          logger.warn("Status email notification failed", { error: emailErr });
        }
      }

      return result;
    } catch (err) {
      throw err;
    }
  }

  // Update payment status
  static async updatePaymentStatus(id: string, paymentStatus: string) {
    try {
      const result = db
        .prepare(
          `UPDATE "Order" SET "paymentStatus" = ?, "updatedAt" = datetime('now') WHERE id = ? RETURNING *`
        )
        .get(paymentStatus, id);

      return result;
    } catch (err) {
      throw err;
    }
  }

  // Delete order
  static async delete(id: string) {
    db.prepare('DELETE FROM "Order" WHERE id = ?').run(id);
  }

  // Get total count by store
  static async countByStoreId(storeId: string) {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM "Order" WHERE "storeId" = ?')
      .get(storeId) as { count: number };
    return result.count;
  }

  // Get order with items
  static async getOrderWithItems(id: string) {
    const order = this.getById(id);
    if (!order) return null;

    const items = db
      .prepare('SELECT * FROM "OrderItem" WHERE "orderId" = ?')
      .all(id);

    return { ...order, items };
  }
}