import { describe, expect, it } from "@jest/globals";
import { etatModeration } from "../etat-moderation";

const le = (jour: number) => new Date(Date.UTC(2026, 8, jour));
const publie = { status: "APPROVED", editedAt: le(1) };

describe("etatModeration", () => {
  it("un avis jamais signalé peut l'être", () => {
    expect(etatModeration(publie, [])).toEqual({ signalement: null, motifDecision: null, peutSignaler: true });
  });

  it("un signalement en attente ne se double pas", () => {
    const etat = etatModeration(publie, [{ createdAt: le(2), decision: null, decisionNote: null, decidedAt: null }]);
    expect(etat.signalement).toBe("EN_ATTENTE");
    expect(etat.peutSignaler).toBe(false);
  });

  it("un avis conservé ne se re-signale pas tel quel", () => {
    const conserve = { createdAt: le(2), decision: "KEPT", decisionNote: "Légitime", decidedAt: le(3) };
    const etat = etatModeration(publie, [conserve]);
    expect(etat).toEqual({ signalement: "CONSERVE", motifDecision: "Légitime", peutSignaler: false });
  });

  it("mais se re-signale une fois retouché par le client", () => {
    const conserve = { createdAt: le(2), decision: "KEPT", decisionNote: null, decidedAt: le(3) };
    expect(etatModeration({ status: "APPROVED", editedAt: le(4) }, [conserve]).peutSignaler).toBe(true);
  });

  it("un avis retiré ne se signale pas", () => {
    const retire = { createdAt: le(2), decision: "REMOVED", decisionNote: null, decidedAt: le(3) };
    const etat = etatModeration({ status: "REMOVED", editedAt: le(1) }, [retire]);
    expect(etat.signalement).toBe("RETIRE");
    expect(etat.peutSignaler).toBe(false);
  });

  it("seul le dernier signalement compte", () => {
    const etat = etatModeration(publie, [
      { createdAt: le(5), decision: null, decisionNote: null, decidedAt: null },
      { createdAt: le(2), decision: "KEPT", decisionNote: null, decidedAt: le(3) },
    ]);
    expect(etat.signalement).toBe("EN_ATTENTE");
  });
});
