/** Champs privés retirés des réponses d'administration sans le droit Facturation. */
const CHAMPS_FINANCIERS = /^(iban|bic|bank|accountHolder|revenue|revenu|totalRevenue|totalEarnings|earnings|commission|customTerms|payout|reversement|montant|amount|totalAmount|subtotal|unitPrice|price|prix|fee|frais|payment|stripe|mrr|billing|monthlyPrice|solde|balance|manquePourEtrePaye)/i;

export function filtrerDonneesFinancieres(valeur: unknown): unknown {
  if (Array.isArray(valeur)) {
    return valeur.filter((item) => !(item && typeof item === "object" &&
      "type" in item && ["bank", "rib", "bank_account"].includes(String(item.type).toLowerCase())))
      .map(filtrerDonneesFinancieres);
  }
  if (!valeur || typeof valeur !== "object" || Object.getPrototypeOf(valeur) !== Object.prototype) return valeur;
  return Object.fromEntries(Object.entries(valeur).filter(([cle]) => !CHAMPS_FINANCIERS.test(cle))
    .map(([cle, contenu]) => [cle, filtrerDonneesFinancieres(contenu)]));
}
