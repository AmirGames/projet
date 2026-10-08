import { IdentifiantPeppol } from "./peppol-id";

/**
 * Une facture Peppol BIS Billing 3.0 (UBL 2.1), générée sans dépendance.
 *
 * Fonction pure : elle reçoit tout ce qu'elle écrit et ne lit rien. Les
 * montants se calculent en centimes entiers, pour que la somme des lignes, la
 * TVA et le total ne divergent jamais d'un centime — le réseau rejette une
 * facture dont les totaux ne tombent pas juste.
 */

export interface PartieFacture {
  nom: string;
  /** Numéro de TVA complet, « BE0123456789 ». */
  tva: string;
  /** Numéro d'entreprise (BCE), sans séparateur. */
  numeroEntreprise?: string | null;
  adresse: string;
  codePostal: string;
  ville: string;
  /** Code ISO à deux lettres. */
  pays: string;
  email?: string | null;
  peppol: IdentifiantPeppol;
}

export interface LigneFacture {
  libelle: string;
  /** Montant hors taxe, en euros. */
  montantHt: number;
}

export interface EntreeFacture {
  numero: string;
  emiseLe: Date;
  echeance: Date;
  /** Obligatoire dans Peppol : la référence que l'acheteur reconnaîtra. */
  referenceAcheteur: string;
  note?: string;
  vendeur: PartieFacture;
  acheteur: PartieFacture;
  iban?: string | null;
  bic?: string | null;
  lignes: LigneFacture[];
  /** Déjà réglé, en euros : ce que les reversements ont retenu. */
  dejaRegle?: number;
  /** Taux de TVA en pourcentage (21 en Belgique pour ce type de service). */
  tauxTva: number;
}

export interface TotauxFacture {
  htCentimes: number;
  tvaCentimes: number;
  ttcCentimes: number;
}

/**
 * Ce qui reste à payer : le total TTC moins ce qui a été retenu. Jamais négatif
 * ni supérieur au TTC — une facture ne peut pas être « plus que payée », et
 * l'écart d'un centime d'arrondi entre une retenue et un TTC recalculé s'absorbe ici.
 */
export function partReglee(ttcCentimes: number, dejaRegleCentimes: number) {
  const prepaye = Math.min(Math.max(0, dejaRegleCentimes), ttcCentimes);
  return { prepayeCentimes: prepaye, aPayerCentimes: ttcCentimes - prepaye };
}

const CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
const PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

const enCentimes = (euros: number) => Math.round(euros * 100);

export function totaux(lignes: LigneFacture[], tauxTva: number): TotauxFacture {
  const htCentimes = lignes.reduce((somme, l) => somme + enCentimes(l.montantHt), 0);
  const tvaCentimes = Math.round((htCentimes * tauxTva) / 100);
  return { htCentimes, tvaCentimes, ttcCentimes: htCentimes + tvaCentimes };
}

const montant = (centimes: number) => (centimes / 100).toFixed(2);

const jour = (date: Date) => date.toISOString().slice(0, 10);

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function partie(p: PartieFacture, role: "AccountingSupplierParty" | "AccountingCustomerParty"): string {
  const bce = p.numeroEntreprise || p.peppol.valeur;
  return `  <cac:${role}>
    <cac:Party>
      <cbc:EndpointID schemeID="${echapper(p.peppol.schema)}">${echapper(p.peppol.valeur)}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${echapper(p.nom)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${echapper(p.adresse)}</cbc:StreetName>
        <cbc:CityName>${echapper(p.ville)}</cbc:CityName>
        <cbc:PostalZone>${echapper(p.codePostal)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${echapper(p.pays)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${echapper(p.tva)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${echapper(p.nom)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0208">${echapper(bce)}</cbc:CompanyID>
      </cac:PartyLegalEntity>${
        p.email
          ? `
      <cac:Contact><cbc:ElectronicMail>${echapper(p.email)}</cbc:ElectronicMail></cac:Contact>`
          : ""
      }
    </cac:Party>
  </cac:${role}>`;
}

export function genererUbl(entree: EntreeFacture): string {
  const t = totaux(entree.lignes, entree.tauxTva);
  const { prepayeCentimes, aPayerCentimes } = partReglee(t.ttcCentimes, enCentimes(entree.dejaRegle ?? 0));
  const taux = entree.tauxTva.toFixed(2);
  const devise = 'currencyID="EUR"';
  const categorieTva = (indent: string) =>
    `${indent}<cac:TaxCategory>
${indent}  <cbc:ID>S</cbc:ID>
${indent}  <cbc:Percent>${taux}</cbc:Percent>
${indent}  <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
${indent}</cac:TaxCategory>`;

  const lignes = entree.lignes
    .map((l, i) => {
      const ht = enCentimes(l.montantHt);
      return `  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount ${devise}>${montant(ht)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${echapper(l.libelle)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${taux}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount ${devise}>${montant(ht)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
    })
    .join("\n");

  // Rien à payer : pas de coordonnées bancaires à afficher.
  const paiement = entree.iban && aPayerCentimes > 0
    ? `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${echapper(entree.numero)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${echapper(entree.iban.replace(/\s/g, ""))}</cbc:ID>${
        entree.bic
          ? `
      <cac:FinancialInstitutionBranch><cbc:ID>${echapper(entree.bic)}</cbc:ID></cac:FinancialInstitutionBranch>`
          : ""
      }
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${CUSTOMIZATION_ID}</cbc:CustomizationID>
  <cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>
  <cbc:ID>${echapper(entree.numero)}</cbc:ID>
  <cbc:IssueDate>${jour(entree.emiseLe)}</cbc:IssueDate>
  <cbc:DueDate>${jour(entree.echeance)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>${
    entree.note ? `\n  <cbc:Note>${echapper(entree.note)}</cbc:Note>` : ""
  }
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${echapper(entree.referenceAcheteur)}</cbc:BuyerReference>
${partie(entree.vendeur, "AccountingSupplierParty")}
${partie(entree.acheteur, "AccountingCustomerParty")}
${paiement}  <cac:TaxTotal>
    <cbc:TaxAmount ${devise}>${montant(t.tvaCentimes)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount ${devise}>${montant(t.htCentimes)}</cbc:TaxableAmount>
      <cbc:TaxAmount ${devise}>${montant(t.tvaCentimes)}</cbc:TaxAmount>
${categorieTva("      ")}
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount ${devise}>${montant(t.htCentimes)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount ${devise}>${montant(t.htCentimes)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount ${devise}>${montant(t.ttcCentimes)}</cbc:TaxInclusiveAmount>
${prepayeCentimes > 0 ? `    <cbc:PrepaidAmount ${devise}>${montant(prepayeCentimes)}</cbc:PrepaidAmount>\n` : ""}    <cbc:PayableAmount ${devise}>${montant(aPayerCentimes)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lignes}
</Invoice>
`;
}
