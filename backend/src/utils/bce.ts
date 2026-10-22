/**
 * Normalise un numéro d'entreprise belge et vérifie son chiffre de contrôle.
 * Ce contrôle de structure ne confirme ni l'existence, ni l'état actif, ni
 * l'activité déclarée de l'entreprise dans la Banque-Carrefour des Entreprises.
 */
export function numeroBceNormalise(saisie: string): string | null {
  const chiffres = saisie.trim().replace(/^BE/i, "").replace(/[\s.\-]/g, "");
  if (!/^[01]\d{9}$/.test(chiffres)) return null;
  const base = Number(chiffres.slice(0, 8));
  const controle = Number(chiffres.slice(8));
  return 97 - (base % 97) === controle ? chiffres : null;
}
