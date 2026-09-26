import { db } from "./db";
import { logger } from "../config/logger";
import { Surveillance, resumeErreur } from "./surveillance.service";

/**
 * La disponibilité du site, dans la durée.
 *
 * La surveillance dit ce qui se passe maintenant, et oublie tout au
 * redémarrage. Ici, chaque cible (l'API, le site, les adresses ajoutées) est
 * interrogée toutes les minutes et le résultat est gardé en base 90 jours :
 * c'est de là que sortent les « 99,95 % sur 30 jours » et la frise des jours.
 *
 * Un serveur arrêté ne relève rien. Pour l'API, un trou dans les relevés est
 * donc compté comme une indisponibilité — c'est justement la panne qu'on veut
 * voir. Pour les autres cibles, un trou veut seulement dire qu'on ne regardait
 * pas : la période est mise de côté, ni comptée pour, ni contre.
 */

const INTERVALLE_MS = Number(process.env.UPTIME_INTERVALLE_MS || 60_000);
/** Au-delà de trois relevés manqués, ce n'est plus un retard : l'API était arrêtée. */
const TROU_MS = Math.max(3 * INTERVALLE_MS, 3 * 60_000);
const DELAI_SONDE_MS = 10_000;
const CONSERVATION_JOURS = 90;
const JOUR = 24 * 60 * 60 * 1000;

export interface Cible {
  cle: string;
  libelle: string;
  /** Absente pour l'API : elle se sonde de l'intérieur (la base répond-elle). */
  url?: string;
}

export function cibles(): Cible[] {
  const liste: Cible[] = [{ cle: "api", libelle: "API et base de données" }];

  const site = process.env.UPTIME_SITE_URL || process.env.FRONTEND_URL;
  if (site && process.env.UPTIME_SITE !== "false") {
    liste.push({ cle: "site", libelle: "Site public", url: site });
  }

  // UPTIME_URLS="Vitrine|https://zupone.fr/store/demo,Espace pro|https://pro.zupone.fr"
  for (const entree of (process.env.UPTIME_URLS || "").split(",")) {
    const [libelle, url] = entree.split("|").map((morceau) => morceau?.trim());
    if (!libelle || !url) continue;
    const cle = libelle
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (cle && !liste.some((c) => c.cle === cle)) liste.push({ cle, libelle, url });
  }

  return liste;
}

// ---------------------------------------------------------------------------
// Les sondes
// ---------------------------------------------------------------------------

interface Releve {
  ok: boolean;
  statusCode: number | null;
  durationMs: number | null;
  error: string | null;
}

async function sonderApi(): Promise<Releve> {
  const depart = Date.now();
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, rejeter) =>
        setTimeout(() => rejeter(new Error(`Pas de réponse en ${DELAI_SONDE_MS / 1000} s`)), DELAI_SONDE_MS).unref?.()
      ),
    ]);
    return { ok: true, statusCode: null, durationMs: Date.now() - depart, error: null };
  } catch (err) {
    return { ok: false, statusCode: null, durationMs: null, error: `Base : ${resumeErreur(err)}` };
  }
}

async function sonderUrl(url: string): Promise<Releve> {
  const depart = Date.now();
  const abandon = new AbortController();
  const minuteur = setTimeout(() => abandon.abort(), DELAI_SONDE_MS);

  try {
    const reponse = await fetch(url, {
      signal: abandon.signal,
      redirect: "follow",
      headers: { "User-Agent": "Zupone-Disponibilite/1.0" },
    });
    // Le corps n'intéresse pas : on le libère sans le lire.
    await reponse.body?.cancel().catch(() => undefined);
    const ok = reponse.status < 400;
    return {
      ok,
      statusCode: reponse.status,
      durationMs: Date.now() - depart,
      error: ok ? null : `Réponse HTTP ${reponse.status}`,
    };
  } catch (err) {
    const message = abandon.signal.aborted
      ? `Pas de réponse en ${DELAI_SONDE_MS / 1000} s`
      : resumeErreur((err as { cause?: unknown })?.cause ?? err);
    return { ok: false, statusCode: null, durationMs: null, error: message };
  } finally {
    clearTimeout(minuteur);
  }
}

// ---------------------------------------------------------------------------
// L'état courant, en mémoire, pour la vigie
// ---------------------------------------------------------------------------

interface EtatCourant {
  ok: boolean;
  echecsDeSuite: number;
  depuis: number;
  dernierReleve: number;
  erreur: string | null;
}

const etats = new Map<string, EtatCourant>();

function noter(cle: string, releve: Releve) {
  const maintenant = Date.now();
  const avant = etats.get(cle);
  etats.set(cle, {
    ok: releve.ok,
    echecsDeSuite: releve.ok ? 0 : (avant?.echecsDeSuite ?? 0) + 1,
    depuis: avant && avant.ok === releve.ok ? avant.depuis : maintenant,
    dernierReleve: maintenant,
    erreur: releve.error,
  });
}

// ---------------------------------------------------------------------------
// Des relevés aux périodes
// ---------------------------------------------------------------------------

/** Une ligne où quelque chose change : premier relevé, bascule, ou trou. */
export interface Transition {
  ok: boolean;
  instant: Date;
  okPrecedent: boolean | null;
  instantPrecedent: Date | null;
  error: string | null;
  statusCode: number | null;
}

export interface Periode {
  debut: number;
  fin: number;
  /** Encore en cours au moment du calcul. */
  enCours?: boolean;
  cause: string;
}

/**
 * Les périodes d'indisponibilité, et celles où l'on ne regardait pas.
 *
 * Fonction pure : les transitions viennent de la base, triées par instant.
 */
export function calculerPeriodes(
  transitions: Transition[],
  options: { trouEstUnePanne: boolean; maintenant: number; trouMs?: number }
) {
  const trouMs = options.trouMs ?? TROU_MS;
  const pannes: Periode[] = [];
  const aveugles: { debut: number; fin: number }[] = [];
  let ouverte: Periode | null = null;

  for (const t of transitions) {
    const instant = t.instant.getTime();
    const precedent = t.instantPrecedent?.getTime();

    // Un trou dans les relevés.
    if (precedent !== undefined && instant - precedent > trouMs) {
      if (options.trouEstUnePanne) {
        // Une panne déjà ouverte absorbe le trou ; sinon il en ouvre une.
        if (!ouverte) {
          ouverte = { debut: precedent, fin: instant, cause: "Serveur arrêté ou injoignable : aucun relevé" };
        }
      } else {
        if (ouverte) {
          ouverte.fin = precedent;
          pannes.push(ouverte);
          ouverte = null;
        }
        aveugles.push({ debut: precedent, fin: instant });
      }
    }

    if (t.ok) {
      if (ouverte) {
        ouverte.fin = instant;
        pannes.push(ouverte);
        ouverte = null;
      }
    } else if (!ouverte) {
      ouverte = { debut: instant, fin: instant, cause: t.error || "Échec" };
    }
  }

  if (ouverte) {
    ouverte.fin = options.maintenant;
    ouverte.enCours = true;
    pannes.push(ouverte);
  }

  return { pannes, aveugles };
}

const recouvrement = (a: { debut: number; fin: number }, debut: number, fin: number) =>
  Math.max(0, Math.min(a.fin, fin) - Math.max(a.debut, debut));

/** La part du temps observé où la cible répondait, sur [debut, fin]. */
export function disponibiliteSur(
  periodes: { pannes: Periode[]; aveugles: { debut: number; fin: number }[] },
  premierReleve: number,
  debut: number,
  fin: number
): number | null {
  const depuis = Math.max(debut, premierReleve);
  if (fin <= depuis) return null;

  const aveugle = periodes.aveugles.reduce((s, p) => s + recouvrement(p, depuis, fin), 0);
  const observe = fin - depuis - aveugle;
  if (observe <= 0) return null;

  const panne = periodes.pannes.reduce((s, p) => s + recouvrement(p, depuis, fin), 0);
  return Math.max(0, Math.min(100, (1 - panne / observe) * 100));
}

// ---------------------------------------------------------------------------
// Le passage
// ---------------------------------------------------------------------------

let minuteur: NodeJS.Timeout | null = null;
let enCours = false;
let dernierePurge = 0;

async function passer() {
  if (enCours) return;
  enCours = true;

  try {
    await Surveillance.executerTache("disponibilite", async () => {
      const liste = cibles();
      const releves = await Promise.all(
        liste.map(async (cible) => ({
          cible,
          releve: cible.url ? await sonderUrl(cible.url) : await sonderApi(),
        }))
      );

      for (const { cible, releve } of releves) noter(cible.cle, releve);

      // Base coupée : rien ne s'écrit, et le trou dans les relevés de l'API
      // dira la panne une fois la base revenue.
      await db.uptimeCheck.createMany({
        data: releves.map(({ cible, releve }) => ({ target: cible.cle, ...releve })),
      });

      if (Date.now() - dernierePurge > JOUR) {
        dernierePurge = Date.now();
        const { count } = await db.uptimeCheck.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - CONSERVATION_JOURS * JOUR) } },
        });
        if (count > 0) logger.info("Disponibilité : anciens relevés purgés", { nombre: count });
      }
    });
  } catch (err) {
    logger.warn("Disponibilité : relevé non enregistré", { error: resumeErreur(err) });
  } finally {
    enCours = false;
  }
}

// ---------------------------------------------------------------------------
// Interface publique
// ---------------------------------------------------------------------------

export const Disponibilite = {
  demarrer() {
    if (minuteur || process.env.UPTIME_ENABLED === "false") return;
    Surveillance.declarerTache("disponibilite", "Relevés de disponibilité", INTERVALLE_MS);
    passer();
    minuteur = setInterval(passer, INTERVALLE_MS);
    minuteur.unref?.();
    logger.info("Relevés de disponibilité activés", {
      intervalleMs: INTERVALLE_MS,
      cibles: cibles().map((c) => c.cle),
    });
  },

  arreter() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  },

  passer,

  /** Pour la vigie : les cibles en échec depuis au moins deux relevés. */
  enEchec() {
    return cibles()
      .map((cible) => ({ cible, etat: etats.get(cible.cle) }))
      .filter(({ etat }) => etat && etat.echecsDeSuite >= 2)
      .map(({ cible, etat }) => ({
        cle: cible.cle,
        libelle: cible.libelle,
        url: cible.url,
        echecsDeSuite: etat!.echecsDeSuite,
        depuis: new Date(etat!.depuis).toISOString(),
        erreur: etat!.erreur,
      }));
  },

  /** Tout ce que montre la section Disponibilité. */
  async bilan(jours = CONSERVATION_JOURS) {
    const maintenant = Date.now();
    const depuis = new Date(maintenant - jours * JOUR);

    const [transitions, premiers, moyennes] = await Promise.all([
      db.$queryRaw<(Transition & { target: string })[]>`
        WITH s AS (
          SELECT target, ok, "createdAt" AS instant, error, "statusCode",
                 lag(ok) OVER w AS "okPrecedent",
                 lag("createdAt") OVER w AS "instantPrecedent"
          FROM "UptimeCheck"
          WHERE "createdAt" >= ${depuis}
          WINDOW w AS (PARTITION BY target ORDER BY "createdAt")
        )
        SELECT * FROM s
        WHERE "okPrecedent" IS NULL
           OR ok <> "okPrecedent"
           OR EXTRACT(EPOCH FROM (instant - "instantPrecedent")) * 1000 > ${TROU_MS}
        ORDER BY target, instant`,
      db.uptimeCheck.groupBy({
        by: ["target"],
        where: { createdAt: { gte: depuis } },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      db.$queryRaw<{ target: string; jour: Date; moyenne: number | null }[]>`
        SELECT target, date_trunc('day', "createdAt") AS jour, avg("durationMs")::float AS moyenne
        FROM "UptimeCheck"
        WHERE "createdAt" >= ${depuis} AND ok
        GROUP BY 1, 2`,
    ]);

    const debutDuJour = (instant: number) => instant - (instant % JOUR);

    return {
      intervalleMs: INTERVALLE_MS,
      conservationJours: CONSERVATION_JOURS,
      cibles: cibles().map((cible) => {
        const premier = premiers.find((p) => p.target === cible.cle);
        const etat = etats.get(cible.cle);

        if (!premier?._min.createdAt) {
          return { ...cible, depuis: null, etat: etat ? (etat.ok ? "OK" : "PANNE") : "INCONNU", disponibilite: {}, jours: [], incidents: [] };
        }

        const premierReleve = premier._min.createdAt.getTime();
        // L'API d'une autre instance peut encore relever : un trou en fin de
        // série n'est compté que jusqu'au dernier relevé connu.
        const periodes = calculerPeriodes(
          transitions.filter((t) => t.target === cible.cle),
          { trouEstUnePanne: cible.cle === "api", maintenant }
        );

        const sur = (duree: number) => {
          const valeur = disponibiliteSur(periodes, premierReleve, maintenant - duree, maintenant);
          return valeur === null ? null : Math.round(valeur * 1000) / 1000;
        };

        const moyennesCible = new Map(
          moyennes.filter((m) => m.target === cible.cle).map((m) => [m.jour.getTime(), m.moyenne])
        );

        const aujourdhui = debutDuJour(maintenant);
        const frise = Array.from({ length: jours }, (_, i) => {
          const debut = aujourdhui - (jours - 1 - i) * JOUR;
          const valeur = disponibiliteSur(periodes, premierReleve, debut, Math.min(debut + JOUR, maintenant));
          const pannesDuJour = periodes.pannes.filter((p) => recouvrement(p, debut, debut + JOUR) > 0);
          return {
            jour: new Date(debut).toISOString().slice(0, 10),
            disponibilite: valeur === null ? null : Math.round(valeur * 1000) / 1000,
            indisponibleMin: Math.round(pannesDuJour.reduce((s, p) => s + recouvrement(p, debut, debut + JOUR), 0) / 60000),
            tempsReponseMs: moyennesCible.get(debut) != null ? Math.round(moyennesCible.get(debut)!) : null,
          };
        });

        return {
          ...cible,
          depuis: new Date(premierReleve).toISOString(),
          dernierReleve: premier._max.createdAt?.toISOString() ?? null,
          etat: etat ? (etat.ok ? "OK" : "PANNE") : "INCONNU",
          etatDepuis: etat ? new Date(etat.depuis).toISOString() : null,
          derniereErreur: etat?.ok ? null : etat?.erreur ?? null,
          disponibilite: {
            "24h": sur(JOUR),
            "7j": sur(7 * JOUR),
            "30j": sur(30 * JOUR),
            "90j": sur(90 * JOUR),
          },
          jours: frise,
          incidents: periodes.pannes
            .map((p) => ({
              debut: new Date(p.debut).toISOString(),
              fin: p.enCours ? null : new Date(p.fin).toISOString(),
              dureeS: Math.round(Math.max(p.fin - p.debut, 0) / 1000),
              cause: p.cause,
            }))
            .reverse()
            .slice(0, 30),
        };
      }),
    };
  },
};
