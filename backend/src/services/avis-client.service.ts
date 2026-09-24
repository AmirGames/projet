import { db } from "./db";

/**
 * Un client a un seul avis par restaurant et par plat, qu'il met à jour au fil
 * de ses commandes : un habitué ne pèse pas trente fois dans la moyenne, et sa
 * note suit le restaurant au lieu de se figer.
 *
 * On ne le relance pas à chaque commande : seulement quand son avis a plus de
 * DELAI_RELANCE_JOURS et que la commande est postérieure à cet avis. Entre-temps
 * il reste libre de le modifier.
 */
export const DELAI_RELANCE_JOURS = 15;

const JOUR_MS = 24 * 60 * 60 * 1000;

export interface AvisDonne {
  rating: number;
  comment: string | null;
  donneLe: Date;
}

/** Faut-il inviter le client à (re)donner son avis sur cette commande ? */
export function avisARedemander(
  commande: { status: string; createdAt: Date },
  avisRestaurant: { updatedAt: Date } | null | undefined,
  maintenant = new Date()
): boolean {
  if (commande.status !== "COMPLETED") return false;
  if (!avisRestaurant) return true;

  const avisAncien =
    maintenant.getTime() - avisRestaurant.updatedAt.getTime() > DELAI_RELANCE_JOURS * JOUR_MS;
  // Une commande antérieure à l'avis a déjà été prise en compte par celui-ci.
  const commandeApresAvis = commande.createdAt.getTime() > avisRestaurant.updatedAt.getTime();

  return avisAncien && commandeApresAvis;
}

/** Les avis restaurant d'un client, par commerce. */
export async function avisRestaurantParCommerce(customerId: string, storeIds: string[]) {
  if (storeIds.length === 0) return new Map<string, { updatedAt: Date }>();

  const avis = await db.review.findMany({
    where: { customerId, storeId: { in: storeIds }, productId: null },
    select: { storeId: true, updatedAt: true },
  });

  return new Map(avis.map((a) => [a.storeId, { updatedAt: a.updatedAt }]));
}

/** Ce que le client a déjà dit du restaurant et des plats d'une commande. */
export async function avisDuClientSurCommande(
  customerId: string,
  commande: { storeId: string; status: string; createdAt: Date; productIds: string[] }
) {
  const avis = await db.review.findMany({
    where: {
      customerId,
      storeId: commande.storeId,
      OR: [{ productId: null }, { productId: { in: commande.productIds } }],
    },
    select: { productId: true, rating: true, comment: true, updatedAt: true },
  });

  const versAvis = (a: (typeof avis)[number]): AvisDonne => ({
    rating: a.rating,
    comment: a.comment,
    donneLe: a.updatedAt,
  });

  const restaurant = avis.find((a) => a.productId === null) ?? null;
  const produits: Record<string, AvisDonne> = {};
  for (const a of avis) {
    if (a.productId) produits[a.productId] = versAvis(a);
  }

  return {
    restaurant: restaurant ? versAvis(restaurant) : null,
    produits,
    aRedemander: avisARedemander(commande, restaurant),
    delaiRelanceJours: DELAI_RELANCE_JOURS,
  };
}
