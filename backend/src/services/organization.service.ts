import { randomUUID } from "crypto";
import { db } from "./db.js";

export class OrganizationService {
  // Create organization
  static async create(data: {
    name: string;
    slug: string;
    userId: string;
  }) {
    try {
      const orgId = randomUUID();
      const membershipId = randomUUID();

      // Si l'user n'existe pas, le créer
      const userExists = db
        .prepare('SELECT id FROM "User" WHERE id = ?')
        .get(data.userId);

      if (!userExists) {
        db.prepare(
          'INSERT INTO "User" (id, email, name, "passwordHash") VALUES (?, ?, ?, ?)'
        ).run(data.userId, `user${Date.now()}@test.com`, "Test User", "hashed");
      }

      // Create org
      db.prepare(
        'INSERT INTO "Organization" (id, name, slug, tier) VALUES (?, ?, ?, ?)'
      ).run(orgId, data.name, data.slug, "FREE");

      // Add user as ADMIN
      db.prepare(
        'INSERT INTO "Membership" (id, "userId", "orgId", role) VALUES (?, ?, ?, ?)'
      ).run(membershipId, data.userId, orgId, "ADMIN");

      const org = db
        .prepare('SELECT * FROM "Organization" WHERE id = ?')
        .get(orgId);

      return org;
    } catch (err) {
      throw err;
    }
  }

  // Get organization by ID
  static async getById(id: string) {
    const result = db
      .prepare('SELECT * FROM "Organization" WHERE id = ?')
      .get(id);
    return result;
  }

  // Get organization by slug
  static async getBySlug(slug: string) {
    const result = db
      .prepare('SELECT * FROM "Organization" WHERE slug = ?')
      .get(slug);
    return result;
  }

  // Get all organizations for a user
  static async getByUserId(userId: string) {
    const result = db
      .prepare(
        'SELECT o.* FROM "Organization" o JOIN "Membership" m ON o.id = m."orgId" WHERE m."userId" = ?'
      )
      .all(userId);
    return result;
  }

  // Update organization
  static async update(id: string, data: { name?: string; tier?: string }) {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.tier) {
      updates.push('tier = ?');
      values.push(data.tier);
    }

    if (updates.length === 0) return null;

    updates.push('"updatedAt" = CURRENT_TIMESTAMP');
    values.push(id);

    const result = db
      .prepare(
        `UPDATE "Organization" SET ${updates.join(", ")} WHERE id = ? RETURNING *`
      )
      .get(...values);

    return result;
  }

  // Delete organization
  static async delete(id: string) {
    db.prepare('DELETE FROM "Organization" WHERE id = ?').run(id);
  }
}