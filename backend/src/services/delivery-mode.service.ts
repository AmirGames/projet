/**
 * Qui livre les commandes d'une boutique.
 *
 * - OWN : le commerçant livre avec ses propres livreurs. Il règle ses zones,
 *   ses frais, et garde les frais de livraison. La plateforme prélève la
 *   commission de sa formule.
 * - PLATFORM : un livreur de la plateforme livre. Le rayon est celui de la
 *   plateforme, les frais sont calculés sur la distance boutique → client, et
 *   ils reviennent au livreur après être passés par la plateforme. La
 *   commission est plus élevée.
 *
 * Le choix se fait dans les réglages de la boutique (« J'utilise ma propre
 * livraison »). Non coché, ce sont les livreurs de la plateforme.
 */
export type ModeDeLivraison = "OWN" | "PLATFORM";

export function modeDeLivraison(settings: unknown): ModeDeLivraison {
  const reglages = (settings && typeof settings === "object" ? settings : {}) as Record<string, any>;
  return reglages.delivery?.useOwnDelivery === true ? "OWN" : "PLATFORM";
}
