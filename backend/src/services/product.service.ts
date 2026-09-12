import { randomUUID } from "crypto";
import { db } from "./db.js";

export interface ProductData {
  storeId: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  categoryId?: string;
  stock?: number;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export class ProductService {
  // Create product
  static async create(data: ProductData) {
    try {
      const productId = randomUUID();

      db.prepare(
        `INSERT INTO "Product" (id, "storeId", sku, name, description, price, "categoryId", stock, status, "createdAt", "updatedAt") 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(
        productId,
        data.storeId,
        data.sku,
        data.name,
        data.description || null,
        data.price,
        data.categoryId || null,
        data.stock || 0,
        data.status || "ACTIVE"
      );

      return this.getById(productId);
    } catch (err) {
      throw err;
    }
  }

  // Get product by ID
  static async getById(id: string) {
    const result = db
      .prepare('SELECT * FROM "Product" WHERE id = ?')
      .get(id);
    return result;
  }

  // Get products by store
  static async getByStoreId(storeId: string, limit: number = 100, offset: number = 0) {
    const result = db
      .prepare(
        'SELECT * FROM "Product" WHERE "storeId" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?'
      )
      .all(storeId, limit, offset);
    return result;
  }

  // Get products by category
  static async getByCategoryId(categoryId: string, limit: number = 100, offset: number = 0) {
    const result = db
      .prepare(
        'SELECT * FROM "Product" WHERE "categoryId" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?'
      )
      .all(categoryId, limit, offset);
    return result;
  }

  // Search products in store
  static async search(storeId: string, query: string, limit: number = 100) {
    const searchPattern = `%${query}%`;
    const result = db
      .prepare(
        'SELECT * FROM "Product" WHERE "storeId" = ? AND (name LIKE ? OR description LIKE ?) LIMIT ?'
      )
      .all(storeId, searchPattern, searchPattern, limit);
    return result;
  }

  // Update product
  static async update(id: string, data: Partial<ProductData>) {
    const updates: string[] = [];
    const values: any[] = [];

    const allowedFields = [
      "sku",
      "name",
      "description",
      "price",
      "categoryId",
      "stock",
      "status",
    ];

    for (const field of allowedFields) {
      if (field in data) {
        updates.push(`"${field}" = ?`);
        values.push((data as any)[field]);
      }
    }

    if (updates.length === 0) return null;

    updates.push(`"updatedAt" = datetime('now')`);
    values.push(id);

    const result = db
      .prepare(
        `UPDATE "Product" SET ${updates.join(", ")} WHERE id = ? RETURNING *`
      )
      .get(...values);

    return result;
  }

  // Update stock
  static async updateStock(id: string, quantity: number) {
    try {
      const result = db
        .prepare(
          `UPDATE "Product" SET stock = stock + ?, "updatedAt" = datetime('now') WHERE id = ? RETURNING *`
        )
        .get(quantity, id);

      return result;
    } catch (err) {
      throw err;
    }
  }

  // Delete product
  static async delete(id: string) {
    db.prepare('DELETE FROM "Product" WHERE id = ?').run(id);
  }

  // Bulk create (for CSV import)
  static async bulkCreate(data: ProductData[]) {
    try {
      const stmt = db.prepare(
        `INSERT INTO "Product" (id, "storeId", sku, name, description, price, "categoryId", stock, status, "createdAt", "updatedAt") 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      );

      const results = [];
      for (const item of data) {
        const productId = randomUUID();
        stmt.run(
          productId,
          item.storeId,
          item.sku,
          item.name,
          item.description || null,
          item.price,
          item.categoryId || null,
          item.stock || 0,
          item.status || "ACTIVE"
        );
        results.push(productId);
      }

      return results;
    } catch (err) {
      throw err;
    }
  }

  // Get total count by store
  static async countByStoreId(storeId: string) {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM "Product" WHERE "storeId" = ?')
      .get(storeId) as { count: number };
    return result.count;
  }
}