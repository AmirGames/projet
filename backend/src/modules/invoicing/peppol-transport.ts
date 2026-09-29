import { getEnv } from "../../config/env";
import { IdentifiantPeppol } from "./peppol-id";

/**
 * Ce qu'il faut pour remettre une facture à un Access Point Peppol.
 *
 * Aucun fournisseur n'est encore choisi : le reste de l'application ne parle
 * qu'à cette interface. Le jour du choix (Billit, Scrada, Ademico, Storecove…),
 * on écrit un adaptateur qui l'implémente et on l'ajoute à `transports`.
 */
export interface TransportPeppol {
  nom: string;
  envoyer(facture: {
    numero: string;
    xml: string;
    destinataire: IdentifiantPeppol;
    emetteur: IdentifiantPeppol;
  }): Promise<{ messageId: string }>;
}

/** Les adaptateurs disponibles, par valeur de PEPPOL_PROVIDER. */
const transports: Record<string, TransportPeppol> = {};

/** Le transport configuré, ou null : les factures se téléchargent alors à la main. */
export function transportPeppol(): TransportPeppol | null {
  const choisi = getEnv().PEPPOL_PROVIDER?.trim().toLowerCase();
  if (!choisi) return null;
  return transports[choisi] ?? null;
}
