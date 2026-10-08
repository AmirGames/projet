/**
 * Les semaines des lots de versement ZupDrive : du lundi 00:00 UTC au lundi suivant.
 *
 * Une seule définition pour le webhook de paiement (qui crée le versement) et pour
 * preparePayout : le lot hebdomadaire regroupe les versements d'une période en comparant
 * ces dates, elles doivent donc être strictement identiques. UTC et non l'heure locale
 * du serveur : le résultat ne dépend ni du fuseau de la machine ni du changement d'heure
 * (une semaine locale ferait 167 ou 169 heures deux fois par an).
 */

const SEMAINE_MS = 7 * 24 * 60 * 60 * 1000;

/** Lundi 00:00:00.000 UTC de la semaine qui contient `date`. */
export function debutSemaineVersement(date: Date = new Date()): Date {
  const decalage = (date.getUTCDay() + 6) % 7; // lundi = 0 … dimanche = 6
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - decalage));
}

/** Fin (exclue) de la semaine commençant à `debut`. */
export function finSemaineVersement(debut: Date): Date {
  return new Date(debut.getTime() + SEMAINE_MS);
}
