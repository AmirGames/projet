import { getEnv } from "../../config/env";
import { IdentifiantPeppol } from "./peppol-id";
import { ApiError } from "../../middleware/errorHandler";

/**
 * Ce qu'il faut pour remettre une facture à un Access Point Peppol.
 *
 * Aucun fournisseur n'est encore choisi : le reste de l'application ne parle
 * qu'à cette interface. Le jour du choix (Billit, Scrada, Ademico, Storecove…),
 * on écrit un adaptateur qui l'implémente et on l'ajoute à `transports`.
 */
export interface TransportPeppol {
  nom: string;
  /** Refuse l'envoi si les identifiants ou options du fournisseur manquent. */
  verifierConfiguration?(): void;
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
export function selectionnerTransportPeppol(
  fournisseur: string | undefined,
  transportsDisponibles: Record<string, TransportPeppol> = transports
): TransportPeppol | null {
  const choisi = fournisseur?.trim().toLowerCase();
  if (!choisi) return null;
  const transport = transportsDisponibles[choisi];
  if (!transport) {
    throw new ApiError(503, `Fournisseur Peppol inconnu : « ${choisi} ». Aucun envoi n'a été effectué.`, "PEPPOL_PROVIDER_UNKNOWN");
  }
  try {
    transport.verifierConfiguration?.();
  } catch {
    throw new ApiError(503, `Configuration du fournisseur Peppol « ${choisi} » incomplète. Aucun envoi n'a été effectué.`, "PEPPOL_PROVIDER_INCOMPLETE");
  }
  return transport;
}

export function transportPeppol(): TransportPeppol | null {
  return selectionnerTransportPeppol(getEnv().PEPPOL_PROVIDER);
}
