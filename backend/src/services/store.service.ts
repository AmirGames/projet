import { randomUUID } from "crypto";
import { db } from "./db.js";

export class StoreService {
  // Create store
  static async create(data: {
    orgId: string;
    name: string;
    slug: string;
    address?: string;
    city?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    description?: string;
  }) {
    try {
      const storeId = randomUUID();

      db.prepare(
        'INSERT INTO "Store" (id, "orgId", name, slug, address, city, "postalCode", phone, email, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        storeId,
        data.orgId,
        data.name,
        data.slug,
        data.address || null,
        data.city || null,
        data.postalCode || null,
        data.phone || null,
        data.email || null,
        data.description || null
      );

      const store = db
        .prepare('SELECT * FROM "Store" WHERE id = ?')
        .get(storeId);

      return store;
    } catch (err) {
      throw err;
    }
  }

  // Get store by ID
  static async getById(id: string) {
    const result = db
      .prepare('SELECT * FROM "Store" WHERE id = ?')
      .get(id);
    return result;
  }

  // Get stores by organization
  static async getByOrgId(orgId: string) {
    const result = db
      .prepare('SELECT * FROM "Store" WHERE "orgId" = ?')
      .all(orgId);
    return result;
  }

  // Update store
  static async update(id: string, data: any) {
    const updates: string[] = [];
    const values: any[] = [];

    const allowedFields = ['name', 'slug', 'address', 'city', 'postalCode', 'phone', 'email', 'description'];
    
    for (const field of allowedFields) {
      if (field in data) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (updates.length === 0) return null;

    updates.push('"updatedAt" = CURRENT_TIMESTAMP');
    values.push(id);

    const result = db
      .prepare(
        `UPDATE "Store" SET ${updates.join(", ")} WHERE id = ? RETURNING *`
      )
      .get(...values);

    return result;
  }

  // Delete store
  static async delete(id: string) {
    db.prepare('DELETE FROM "Store" WHERE id = ?').run(id);
  }
}