import type { Prisma } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";

export type Acteur = Pick<Request, "userId" | "compte">;
export type ActionBoutique = "read" | "manage";

/**
 * La règle d'appartenance d'un membre à une boutique, partagée par HTTP et
 * temps réel : ADMIN voit toute l'organisation, MANAGER/STAFF les boutiques
 * qui leur sont attribuées.
 */
export function membreVoitBoutique(
  membership: { role: string; storeIds: string[] },
  storeId: string,
  action: ActionBoutique = "read",
): boolean {
  if (membership.role === "ADMIN") return true;
  if (membership.role === "STORE_MANAGER" || (action === "read" && membership.role === "STORE_STAFF"))
    return membership.storeIds.includes(storeId);
  return false;
}

/** Les droits viennent de la base, jamais du corps de requête ou du JWT. */
export async function perimetreBoutiques(
  acteur: Acteur,
  action: ActionBoutique = "read",
  client: Pick<typeof db, "membership"> = db,
): Promise<Prisma.StoreWhereInput> {
  if (!acteur.userId)
    throw new ApiError(401, "Authentification requise", "MISSING_AUTH");
  if (acteur.compte?.isSuperOwner) return {};
  const memberships = await client.membership.findMany({
    where: { userId: acteur.userId },
    select: { orgId: true, role: true, storeIds: true },
  });
  const scopes = memberships.flatMap((membership): Prisma.StoreWhereInput[] => {
    if (membership.role === "ADMIN") return [{ orgId: membership.orgId }];
    if (
      membership.role !== "STORE_MANAGER" &&
      !(action === "read" && membership.role === "STORE_STAFF")
    )
      return [];
    return [{ orgId: membership.orgId, id: { in: membership.storeIds } }];
  });
  // Un OR vide imbriqué dans AND peut être éliminé par le compilateur de
  // requêtes. Un ensemble d'identifiants vide reste un refus explicite.
  return scopes.length ? { OR: scopes } : { id: { in: [] } };
}

export async function exigerBoutique(
  acteur: Acteur,
  storeId: string,
  action: ActionBoutique = "read",
  client: Pick<typeof db, "membership" | "store"> = db,
) {
  const scope = await perimetreBoutiques(acteur, action, client);
  const store = await client.store.findFirst({
    where: { AND: [{ id: storeId, deletedAt: null }, scope] },
    select: { id: true, orgId: true },
  });
  if (!store)
    throw new ApiError(
      403,
      "Accès à cette boutique refusé",
      "STORE_ACCESS_DENIED",
    );
  return store;
}

/** Protection locale du catalogue, même si le routeur est monté sans le verrou global. */
export async function autoriserCatalogue(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const action = req.method === "GET" ? "read" : "manage";
    let storeId = req.params.storeId || req.body?.storeId || req.query.storeId;
    const orgId = req.params.orgId || req.query.orgId;
    const categoryId = req.params.categoryId || req.body?.categoryId;
    // L'identifiant de la ressource prime sur une boutique annoncée par l'appelant.
    if (req.params.id) {
      const args = {
        where: { id: String(req.params.id) },
        select: { storeId: true as const },
      };
      const resource = req.baseUrl.endsWith("/categories")
        ? await db.category.findUnique(args)
        : await db.product.findUnique(args);
      if (!resource)
        throw new ApiError(404, "Ressource introuvable", "NOT_FOUND");
      if (storeId && storeId !== resource.storeId)
        throw new ApiError(403, "Boutique incohérente", "STORE_ACCESS_DENIED");
      storeId = resource.storeId;
    }
    if (categoryId) {
      const category = await db.category.findUnique({
        where: { id: String(categoryId) },
        select: { storeId: true },
      });
      if (!category)
        throw new ApiError(404, "Catégorie introuvable", "CATEGORY_NOT_FOUND");
      if (storeId && storeId !== category.storeId)
        throw new ApiError(
          400,
          "La catégorie appartient à une autre boutique",
          "INVALID_CATEGORY",
        );
      storeId = category.storeId;
    }
    if (storeId) {
      const store = await exigerBoutique(req, String(storeId), action);
      req.orgId = store.orgId;
    } else if (orgId) {
      const scope = await perimetreBoutiques(req, action);
      const store = await db.store.findFirst({
        where: { AND: [{ orgId: String(orgId) }, scope] },
        select: { id: true },
      });
      if (!store)
        throw new ApiError(
          403,
          "Accès à cette organisation refusé",
          "FORBIDDEN",
        );
    } else {
      throw new ApiError(
        400,
        "Boutique ou organisation requise",
        "MISSING_PARAM",
      );
    }
    next();
  } catch (error) {
    next(error);
  }
}
