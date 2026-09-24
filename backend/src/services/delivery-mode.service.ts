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

/**
 * Les frais de livraison d'une commande qui reviennent à la plateforme.
 *
 * Quand un livreur de la plateforme livre, c'est elle qui le paie : les frais
 * que le client a réglés sont à elle. Mais tant que le paiement en ligne n'est
 * pas branché, le client paie le commerçant — frais compris. L'argent de la
 * livraison atterrissait donc chez lui, et la plateforme payait le livreur de
 * sa poche sans jamais le récupérer.
 *
 * Le commerçant les encaisse désormais pour le compte de la plateforme, qui
 * les lui réclame avec la commission du mois. Seulement pour une commande
 * livrée : une course jamais faite ne coûte rien au livreur, ni à personne.
 */
export function fraisDusALaPlateforme(commande: {
  deliveryMode: string | null;
  status: string;
  feesAmount: unknown;
}) {
  if (commande.deliveryMode !== "PLATFORM" || commande.status !== "COMPLETED") return 0;
  return Number(commande.feesAmount || 0);
}
