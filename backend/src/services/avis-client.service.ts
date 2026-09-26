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
  /** Retiré par la plateforme : il n'est plus publié. */
  retire: boolean;
}

/** Faut-il inviter le client à (re)donner son avis sur cette commande ? */
export function avisARedemander(
  commande: { status: string; createdAt: Date },
  avisRestaurant: { editedAt: Date } | null | undefined,
  maintenant = new Date()
): boolean {
  if (commande.status !== "COMPLETED") return false;
  if (!avisRestaurant) return true;

  const avisAncien =
    maintenant.getTime() - avisRestaurant.editedAt.getTime() > DELAI_RELANCE_JOURS * JOUR_MS;
  // Une commande antérieure à l'avis a déjà été prise en compte par celui-ci.
  const commandeApresAvis = commande.createdAt.getTime() > avisRestaurant.editedAt.getTime();

  return avisAncien && commandeApresAvis;
}

/** Les avis restaurant d'un client, par commerce. */
export async function avisRestaurantParCommerce(customerId: string, storeIds: string[]) {
  if (storeIds.length === 0) return new Map<string, { editedAt: Date }>();

  const avis = await db.review.findMany({
    where: { customerId, storeId: { in: storeIds }, productId: null },
    select: { storeId: true, editedAt: true },
  });

  return new Map(avis.map((a) => [a.storeId, { editedAt: a.editedAt }]));
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
    select: { productId: true, rating: true, comment: true, editedAt: true, status: true },
  });

  const versAvis = (a: (typeof avis)[number]): AvisDonne => ({
    rating: a.rating,
    comment: a.comment,
    donneLe: a.editedAt,
    retire: a.status === "REMOVED",
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
