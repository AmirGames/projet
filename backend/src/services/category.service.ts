import { randomUUID } from "crypto";
import { db } from "./db.js";

export interface CategoryData {
  storeId: string;
  name: string;
  displayOrder?: number;
}

export class CategoryService {
  // Create category
  static async create(data: CategoryData) {
    try {
      const categoryId = randomUUID();
      const displayOrder = data.displayOrder || 0;

      db.prepare(
        `INSERT INTO "Category" (id, "storeId", name, "displayOrder", "createdAt", "updatedAt") 
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(
        categoryId,
        data.storeId,
        data.name,
        displayOrder
      );

      return this.getById(categoryId);
    } catch (err) {
      throw err;
    }
  }

  // Get category by ID
  static async getById(id: string) {
    const result = db
      .prepare('SELECT * FROM "Category" WHERE id = ?')
      .get(id);
    return result;
  }

  // Get categories by store (ordered by displayOrder)
  static async getByStoreId(storeId: string) {
    const result = db
      .prepare(
        'SELECT * FROM "Category" WHERE "storeId" = ? ORDER BY "displayOrder" ASC, "createdAt" ASC'
      )
      .all(storeId);
    return result;
  }

  // Update category
  static async update(id: string, data: Partial<CategoryData>) {
    const updates: string[] = [];
    const values: any[] = [];

    const allowedFields = ["name", "displayOrder"];

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
        `UPDATE "Category" SET ${updates.join(", ")} WHERE id = ? RETURNING *`
      )
      .get(...values);

    return result;
  }

  // Reorder categories (displayOrder)
  static async reorder(storeId: string, ordering: { id: string; displayOrder: number }[]) {
    try {
      const stmt = db.prepare(`UPDATE "Category" SET "displayOrder" = ?, "updatedAt" = datetime('now') WHERE id = ?`);

      for (const item of ordering) {
        stmt.run(item.displayOrder, item.id);
      }

      // Return all categories in new order
      return this.getByStoreId(storeId);
    } catch (err) {
      throw err;
    }
  }

  // Delete category
  static async delete(id: string) {
    db.prepare('DELETE FROM "Category" WHERE id = ?').run(id);
  }

  // Get total count by store
  static async countByStoreId(storeId: string) {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM "Category" WHERE "storeId" = ?')
      .get(storeId) as { count: number };
    return result.count;
  }
}