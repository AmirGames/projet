import { describe, expect, it } from "@jest/globals";
import { identifiantPeppol, numeroBce, tvaBelge } from "../peppol-id";
import { genererUbl, totaux, partReglee, PartieFacture } from "../ubl";

describe("identifiant Peppol", () => {
  it("normalise un numéro de TVA belge", () => {
    expect(tvaBelge("BE 0123.456.789")).toBe("BE0123456789");
    expect(tvaBelge("be0123456789")).toBe("BE0123456789");
    expect(tvaBelge("FR12345678901")).toBeNull();
    expect(tvaBelge(null)).toBeNull();
  });

  it("lit un numéro BCE, avec ou sans zéro initial", () => {
    expect(numeroBce("0123.456.789")).toBe("0123456789");
    expect(numeroBce("123456789")).toBe("0123456789");
    expect(numeroBce("12345")).toBeNull();
  });

  it("préfère l'identifiant saisi, puis la TVA, puis le BCE", () => {
    expect(identifiantPeppol({ peppolId: "9925:BE0999999999", vatNumber: "BE0123456789" }))
      .toEqual({ schema: "9925", valeur: "BE0999999999" });
    expect(identifiantPeppol({ vatNumber: "BE0123456789" })).toEqual({ schema: "0208", valeur: "0123456789" });
    expect(identifiantPeppol({ registrationNumber: "0123.456.789" })).toEqual({ schema: "0208", valeur: "0123456789" });
    expect(identifiantPeppol({})).toBeNull();
    expect(identifiantPeppol({ peppolId: "n'importe quoi" })).toBeNull();
  });
});

describe("facture UBL", () => {
  const vendeur: PartieFacture = {
    nom: "ZupEat SRL", tva: "BE0111222333", adresse: "Rue Neuve 1", codePostal: "1000",
    ville: "Bruxelles", pays: "BE", peppol: { schema: "0208", valeur: "0111222333" },
  };
  const acheteur: PartieFacture = {
    nom: "Pizza & Co <SRL>", tva: "BE0123456789", adresse: "Av. Louise 2", codePostal: "1050",
    ville: "Ixelles", pays: "BE", peppol: { schema: "0208", valeur: "0123456789" },
  };

  it("calcule les totaux en centimes sans dérive", () => {
    const t = totaux([{ libelle: "a", montantHt: 0.1 }, { libelle: "b", montantHt: 0.2 }], 21);
    expect(t).toEqual({ htCentimes: 30, tvaCentimes: 6, ttcCentimes: 36 });
  });

  it("produit un document Peppol BIS 3.0 cohérent", () => {
    const xml = genererUbl({
      numero: "ZE-2026-000001",
      emiseLe: new Date("2026-09-01T10:00:00Z"),
      echeance: new Date("2026-10-01T10:00:00Z"),
      referenceAcheteur: "COMMISSION-2026-08",
      vendeur, acheteur, iban: "BE68 5390 0754 7034",
      lignes: [{ libelle: "Commission", montantHt: 100 }, { libelle: "Frais de service", montantHt: 10.5 }],
      tauxTva: 21,
    });

    expect(xml).toContain("urn:fdc:peppol.eu:2017:poacc:billing:3.0");
    expect(xml).toContain("<cbc:ID>ZE-2026-000001</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-09-01</cbc:IssueDate>");
    expect(xml).toContain('<cbc:EndpointID schemeID="0208">0123456789</cbc:EndpointID>');
    // Les caractères réservés du nom sont échappés.
    expect(xml).toContain("Pizza &amp; Co &lt;SRL&gt;");
    // 110,50 HT + 23,21 TVA (arrondi de 23,205) = 133,71
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">110.50</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">23.21</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">133.71</cbc:PayableAmount>');
    expect(xml).toContain("<cbc:ID>BE68539007547034</cbc:ID>");
    expect((xml.match(/<cac:InvoiceLine>/g) || []).length).toBe(2);
  });

  it("montre ce qui est déjà retenu sur les reversements", () => {
    const xml = genererUbl({
      numero: "ZE-2026-000002",
      emiseLe: new Date("2026-09-01T10:00:00Z"),
      echeance: new Date("2026-10-01T10:00:00Z"),
      referenceAcheteur: "COMMISSION-2026-08",
      vendeur, acheteur, iban: "BE68539007547034",
      lignes: [{ libelle: "Commission retenue", montantHt: 100 }],
      dejaRegle: 100,
      tauxTva: 21,
    });

    // 121,00 TTC dont 100,00 retenus : il reste la TVA, 21,00, à payer.
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="EUR">121.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:PrepaidAmount currencyID="EUR">100.00</cbc:PrepaidAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">21.00</cbc:PayableAmount>');
  });

  it("n'affiche ni prépayé ni coordonnées bancaires quand tout est retenu", () => {
    const xml = genererUbl({
      numero: "ZE-2026-000003",
      emiseLe: new Date("2026-09-01T10:00:00Z"),
      echeance: new Date("2026-10-01T10:00:00Z"),
      referenceAcheteur: "COMMISSION-2026-08",
      vendeur, acheteur, iban: "BE68539007547034",
      lignes: [{ libelle: "Commission retenue", montantHt: 100 }],
      dejaRegle: 121,
      tauxTva: 21,
    });

    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">0.00</cbc:PayableAmount>');
    expect(xml).not.toContain("<cac:PaymentMeans>");
  });

  it("borne la part réglée entre zéro et le TTC", () => {
    expect(partReglee(12100, 5000)).toEqual({ prepayeCentimes: 5000, aPayerCentimes: 7100 });
    // Un centime d'écart d'arrondi entre la retenue et le TTC recalculé.
    expect(partReglee(12099, 12100)).toEqual({ prepayeCentimes: 12099, aPayerCentimes: 0 });
    expect(partReglee(12100, -5)).toEqual({ prepayeCentimes: 0, aPayerCentimes: 12100 });
  });
});
