/**
 * Les semaines de versement, à l'heure de Bruxelles.
 *
 * Une semaine va du lundi 00 h 00 au lundi suivant 00 h 00, heure belge — été
 * comme hiver. Le serveur tourne en UTC : un minuit « serveur » tomberait à
 * 1 h ou 2 h du matin, et une course livrée le dimanche à 23 h 30 changerait
 * de semaine selon la saison.
 */

const FUSEAU = "Europe/Brussels";

/** Le décalage de Bruxelles par rapport à UTC à cet instant, en minutes. */
function decalageMinutes(instant: Date) {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSEAU,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const v = (type: string) => Number(parties.find((p) => p.type === type)?.value);
  const local = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((local - instant.getTime()) / 60000);
}

/** L'instant UTC du minuit bruxellois du jour (a, m, j). */
function minuitBruxelles(annee: number, mois: number, jour: number) {
  const approx = new Date(Date.UTC(annee, mois, jour));
  const premier = new Date(approx.getTime() - decalageMinutes(approx) * 60000);
  // Le décalage peut changer entre minuit UTC et minuit local : on recale.
  return new Date(approx.getTime() - decalageMinutes(premier) * 60000);
}

/** Le lundi 00 h 00 (Bruxelles) de la semaine qui contient cet instant. */
export function debutDeSemaine(instant = new Date()) {
  const local = new Date(instant.getTime() + decalageMinutes(instant) * 60000);
  const recul = (local.getUTCDay() + 6) % 7;
  return minuitBruxelles(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - recul);
}

/** La semaine écoulée : du lundi précédent au lundi de cette semaine, 00 h 00. */
export function semaineEcoulee(instant = new Date()) {
  const fin = debutDeSemaine(instant);
  const veille = new Date(fin.getTime() - 12 * 3600000);
  return { periodStart: debutDeSemaine(veille), periodEnd: fin };
}

/** Le jour (« 2026-10-02 ») de cet instant, à l'heure de Bruxelles. */
export function jourBruxelles(instant: Date) {
  // fr-CA écrit les dates en AAAA-MM-JJ.
  return new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU }).format(instant);
}

/**
 * Les `nombre` derniers jours de Bruxelles, du plus ancien à aujourd'hui.
 * Calculés sur le calendrier, pas en retranchant 24 h : un jour de
 * changement d'heure dure 23 ou 25 heures.
 */
export function derniersJoursBruxelles(nombre: number, instant = new Date()) {
  const [annee, mois, jour] = jourBruxelles(instant).split("-").map(Number);
  return Array.from({ length: nombre }, (_, i) =>
    new Date(Date.UTC(annee, mois - 1, jour - (nombre - 1 - i))).toISOString().slice(0, 10)
  );
}
