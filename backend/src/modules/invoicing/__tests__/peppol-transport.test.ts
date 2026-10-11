import { describe, expect, it, jest } from "@jest/globals";
import { ApiError } from "../../../middleware/errorHandler";
import { selectionnerTransportPeppol, TransportPeppol } from "../peppol-transport";

describe("configuration du transport Peppol", () => {
  it("laisse le circuit externe désactivé si aucun fournisseur n'est choisi", () => {
    expect(selectionnerTransportPeppol(undefined)).toBeNull();
    expect(selectionnerTransportPeppol("  ")).toBeNull();
  });

  it("échoue explicitement pour un fournisseur inconnu", () => {
    try {
      selectionnerTransportPeppol(" fournisseur-inconnu ");
      throw new Error("Le fournisseur inconnu aurait dû être refusé");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("PEPPOL_PROVIDER_UNKNOWN");
    }
  });

  it("vérifie les secrets et options d'un adaptateur avant son usage", () => {
    const verifierConfiguration = jest.fn(() => { throw new Error("Identifiants du fournisseur absents"); });
    const transport: TransportPeppol = { nom: "test", verifierConfiguration, envoyer: async () => ({ messageId: "test" }) };
    try {
      selectionnerTransportPeppol("test", { test: transport });
      throw new Error("La configuration incomplète aurait dû être refusée");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("PEPPOL_PROVIDER_INCOMPLETE");
    }
    expect(verifierConfiguration).toHaveBeenCalledTimes(1);
  });
});
