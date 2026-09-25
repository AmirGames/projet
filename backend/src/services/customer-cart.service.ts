import { z } from "zod";
import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { emitUserEvent } from "../config/socket";

/**
 * Les paniers d'un client, gardés sur le serveur.
 *
 * Chaque appareil (le site, l'application) garde sa copie pour rester
 * utilisable hors ligne ; le serveur tient celle qui fait foi et annonce
 * chaque modification aux autres appareils du compte (« panier-modifie »).
 * La plus récente l'emporte.
 */

/** Une ligne, au format du site (`frontend/lib/paniers.ts`). */
const ligneSchema = z.object({
  productId: z.string().min(1).max(64),
  variantId: z.string().max(64).optional(),
  name: z.string().max(200),
  variantNom: z.string().max(200).optional(),
  price: z.number().nonnegative().max(100000),
  quantity: z.number().int().min(1).max(99),
  description: z.string().max(1000).optional(),
  isAvailable: z.boolean().optional(),
});

export const panierSchema = z.object({
  storeName: z.string().max(200).optional(),
  storeSlug: z.string().max(200).optional().nullable(),
  storeLogo: z.string().max(500).optional().nullable(),
  lignes: z.array(ligneSchema).max(100),
  /** L'appareil qui écrit : il reconnaît sa propre annonce et l'ignore. */
  appareil: z.string().max(64).optional(),
});

export type PanierRecu = z.infer<typeof panierSchema>;

export interface PanierRendu {
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo: string | null;
  lignes: z.infer<typeof ligneSchema>[];
  /** L'heure de la dernière modification, qui départage deux copies. */
  majA: string;
}

function rendu(panier: {
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo: string | null;
  lines: unknown;
  updatedAt: Date;
}): PanierRendu {
  return {
    storeId: panier.storeId,
    storeName: panier.storeName,
    storeSlug: panier.storeSlug,
    storeLogo: panier.storeLogo,
    lignes: Array.isArray(panier.lines) ? (panier.lines as PanierRendu["lignes"]) : [],
    majA: panier.updatedAt.toISOString(),
  };
}

/** Au-delà, un panier vidé n'a plus à servir de trace : il est oublié. */
const TRACE_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export class CustomerCartService {
  /** Tous les paniers du client, vides compris : ils disent qu'un panier a été vidé. */
  static async lister(customerId: string): Promise<PanierRendu[]> {
    const paniers = await db.customerCart.findMany({
      where: { customerId },
      orderBy: { updatedAt: "desc" },
    });

    const perimes = paniers.filter(
      (p) => rendu(p).lignes.length === 0 && Date.now() - p.updatedAt.getTime() > TRACE_MAX_MS
    );
    if (perimes.length) {
      await db.customerCart.deleteMany({ where: { id: { in: perimes.map((p) => p.id) } } }).catch(() => undefined);
    }

    return paniers.filter((p) => !perimes.includes(p)).map(rendu);
  }

  /** Remplace le panier d'un commerce, et l'annonce aux autres appareils du compte. */
  static async enregistrer(client: { id: string; email: string }, storeId: string, recu: PanierRecu) {
    const boutique = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, slug: true, deletedAt: true },
    });
    if (!boutique || boutique.deletedAt) {
      throw new ApiError(404, "Commerce introuvable", "STORE_NOT_FOUND");
    }

    const donnees = {
      storeName: recu.storeName || boutique.name,
      storeSlug: recu.storeSlug || boutique.slug || null,
      ...(recu.storeLogo !== undefined ? { storeLogo: recu.storeLogo } : {}),
      lines: recu.lignes,
    };

    const panier = await db.customerCart.upsert({
      where: { customerId_storeId: { customerId: client.id, storeId } },
      create: { customerId: client.id, storeId, ...donnees },
      update: donnees,
    });

    const resultat = rendu(panier);
    emitUserEvent(client.email, "panier-modifie", { ...resultat, appareil: recu.appareil ?? null });
    return resultat;
  }
}
