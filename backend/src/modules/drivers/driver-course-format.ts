/**
 * Présentation des courses au livreur : adresses, gain annoncé, masquage du
 * client dans une tournée. Fonctions pures, partagées par les services de
 * l'espace livreur.
 */

// L'adresse du commerce où l'on retire la commande. Le retrait affichait
// l'adresse du client : le livreur partait au mauvais endroit.
export function adresseRetrait(store?: { name?: string | null; address?: string | null; city?: string | null } | null) {
  if (!store) return "";
  return [store.address, store.city].filter(Boolean).join(", ") || store.name || "";
}

/**
 * Tournée : le client d'une course masquée (d'autres commandes attendent au
 * commerce, ou une autre remise passe avant) ne sort pas du serveur. Le
 * livreur ne découvre l'adresse suivante qu'une fois la précédente livrée.
 */
export function masquerClient<T extends Record<string, unknown>>(course: T, raison: "RETRAITS" | "ORDRE" | null): T {
  if (!raison) return { ...course, masque: null };
  return {
    ...course,
    masque: raison,
    customerName: null,
    customerPhone: null,
    deliveryAddress: null,
    latitude: null,
    longitude: null,
  };
}

export function adresseLivraison(order?: { deliveryAddress?: string | null; deliveryPostal?: string | null; deliveryCity?: string | null } | null) {
  if (!order) return "";
  const ville = [order.deliveryPostal, order.deliveryCity].filter(Boolean).join(" ");
  return [order.deliveryAddress, ville].filter(Boolean).join(", ");
}

/**
 * Le gain d'une course pour le livreur : figé à l'attribution, sinon celui de
 * la proposition, sinon (courses anciennes) les frais de livraison.
 */
export function gainAnnonce(
  course: { driverPayout?: unknown; order?: { feesAmount?: unknown } | null },
  offre?: { payout?: unknown } | null
) {
  return Number(course.driverPayout ?? offre?.payout ?? course.order?.feesAmount ?? 0);
}
