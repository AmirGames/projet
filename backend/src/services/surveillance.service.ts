import { monitorEventLoopDelay } from "perf_hooks";
import { getHeapStatistics } from "v8";
import os from "os";

/**
 * Surveillance du site en fonctionnement.
 *
 * La page « Santé » donne un score à partir de ce qui est en base (sauvegardes,
 * attribution des courses, webhooks). Elle ne voit pas ce qui se passe en ce
 * moment : un serveur qui répond 500 à une requête sur dix, une page qui
 * plante dans le navigateur des clients, une tâche de fond qui ne tourne plus.
 * Tout cela se relève ici, en mémoire, au fil des requêtes.
 *
 * En mémoire signifie « par processus » et « depuis le démarrage » : c'est la
 * vue d'une instance sur la dernière heure, pas un entrepôt de métriques. Pour
 * l'historique long, `/health/ready` se branche sur n'importe quel service de
 * surveillance externe.
 */

const MINUTE = 60_000;
/** Une heure de minutes, glissante. */
const MINUTES_GARDEES = 60;
/** Au-delà, les durées d'une minute sont échantillonnées : le p95 reste juste. */
const DUREES_PAR_MINUTE = 2000;
const DUREES_PAR_ROUTE = 300;
const ERREURS_GARDEES = 100;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Centile d'une liste de durées, en millisecondes. */
export function centile(valeurs: number[], rang: number): number {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  const index = Math.min(triees.length - 1, Math.ceil((rang / 100) * triees.length) - 1);
  return Math.round(triees[Math.max(0, index)]);
}

/** Ajoute une durée à un échantillon borné, sans biaiser vers les premières. */
function echantillonner(liste: number[], valeur: number, max: number, vues: number) {
  if (liste.length < max) {
    liste.push(valeur);
    return;
  }
  const index = Math.floor(Math.random() * vues);
  if (index < max) liste[index] = valeur;
}

/** Garde les N derniers éléments. */
function empiler<T>(liste: T[], element: T, max: number) {
  liste.unshift(element);
  if (liste.length > max) liste.length = max;
}

/**
 * Une erreur en une ligne lisible.
 *
 * Prisma rend plusieurs paragraphes (l'appel, le fichier, puis la cause) : la
 * cause est la dernière ligne, c'est elle qui dit quoi faire.
 */
export function resumeErreur(err: unknown): string {
  const brut = err instanceof Error ? err.message : String(err);
  const lignes = brut.split("\n").map((l) => l.trim()).filter(Boolean);
  return (lignes[lignes.length - 1] || brut).slice(0, 300);
}

const debutDeMinute = (instant: number) => instant - (instant % MINUTE);

// ---------------------------------------------------------------------------
// Trafic, minute par minute
// ---------------------------------------------------------------------------

interface Minute {
  debut: number;
  requetes: number;
  erreurs4xx: number;
  erreurs5xx: number;
  durees: number[];
  erreursNavigateur: number;
}

const minutes: Minute[] = [];

function minuteCourante(instant = Date.now()): Minute {
  const debut = debutDeMinute(instant);
  const derniere = minutes[minutes.length - 1];
  if (derniere && derniere.debut === debut) return derniere;

  const nouvelle: Minute = {
    debut,
    requetes: 0,
    erreurs4xx: 0,
    erreurs5xx: 0,
    durees: [],
    erreursNavigateur: 0,
  };
  minutes.push(nouvelle);

  const limite = debut - MINUTES_GARDEES * MINUTE;
  while (minutes.length > 0 && minutes[0].debut <= limite) minutes.shift();

  return nouvelle;
}

/** Les minutes écoulées de la fenêtre, y compris celles sans trafic. */
function serieMinutes(nombre: number) {
  const maintenant = debutDeMinute(Date.now());
  const parDebut = new Map(minutes.map((m) => [m.debut, m]));

  return Array.from({ length: nombre }, (_, i) => {
    const debut = maintenant - (nombre - 1 - i) * MINUTE;
    const m = parDebut.get(debut);
    return {
      debut: new Date(debut).toISOString(),
      requetes: m?.requetes ?? 0,
      erreurs4xx: m?.erreurs4xx ?? 0,
      erreurs5xx: m?.erreurs5xx ?? 0,
      p95Ms: m ? centile(m.durees, 95) : 0,
      erreursNavigateur: m?.erreursNavigateur ?? 0,
    };
  });
}

/** Le bilan des N dernières minutes (la minute en cours comprise). */
export function bilanFenetre(nombreMinutes: number) {
  const depuis = debutDeMinute(Date.now()) - (nombreMinutes - 1) * MINUTE;
  const retenues = minutes.filter((m) => m.debut >= depuis);

  const requetes = retenues.reduce((s, m) => s + m.requetes, 0);
  const erreurs4xx = retenues.reduce((s, m) => s + m.erreurs4xx, 0);
  const erreurs5xx = retenues.reduce((s, m) => s + m.erreurs5xx, 0);
  const erreursNavigateur = retenues.reduce((s, m) => s + m.erreursNavigateur, 0);
  const durees = retenues.flatMap((m) => m.durees);

  return {
    minutes: nombreMinutes,
    requetes,
    requetesParMinute: Math.round((requetes / nombreMinutes) * 10) / 10,
    erreurs4xx,
    erreurs5xx,
    tauxErreur5xx: requetes > 0 ? Math.round((erreurs5xx / requetes) * 1000) / 10 : 0,
    p50Ms: centile(durees, 50),
    p95Ms: centile(durees, 95),
    p99Ms: centile(durees, 99),
    erreursNavigateur,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

interface StatRoute {
  route: string;
  requetes: number;
  erreurs5xx: number;
  erreurs4xx: number;
  dureeTotale: number;
  dureeMax: number;
  durees: number[];
  derniereFois: number;
}

const routes = new Map<string, StatRoute>();
/** Garde-fou : un balayage d'URL inventées ne doit pas remplir la mémoire. */
const ROUTES_MAX = 500;

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export interface ErreurServeur {
  instant: string;
  route: string;
  statut: number;
  message: string;
  pile?: string;
}

export interface ErreurNavigateur {
  empreinte: string;
  message: string;
  source?: string;
  page: string;
  pile?: string;
  navigateur?: string;
  occurrences: number;
  premiereFois: string;
  derniereFois: string;
}

const erreursServeur: ErreurServeur[] = [];
const erreursNavigateur = new Map<string, ErreurNavigateur>();

// ---------------------------------------------------------------------------
// Tâches de fond
// ---------------------------------------------------------------------------

interface Tache {
  cle: string;
  libelle: string;
  intervalleMs: number;
  declareeLe: number;
  executions: number;
  echecs: number;
  echecsDeSuite: number;
  enCours: boolean;
  dernierDebut?: number;
  derniereFin?: number;
  derniereDureeMs?: number;
  derniereReussite?: number;
  derniereErreur?: string;
}

const taches = new Map<string, Tache>();

// ---------------------------------------------------------------------------
// Processus
// ---------------------------------------------------------------------------

const demarrageLe = Date.now();
const boucle = monitorEventLoopDelay({ resolution: 20 });
boucle.enable();

let dernierCpu = process.cpuUsage();
let dernierReleveCpu = Date.now();
let cpuPourcent = 0;
let boucleP99Ms = 0;
let boucleMaxMs = 0;

/**
 * Le processeur et la boucle d'événements se mesurent sur un intervalle : on
 * relève toutes les cinq secondes, et on remet l'histogramme à zéro pour que
 * la valeur affichée soit récente, pas la pire depuis le démarrage.
 */
const releveProcessus = setInterval(() => {
  const maintenant = Date.now();
  const cpu = process.cpuUsage(dernierCpu);
  const ecouleMicro = (maintenant - dernierReleveCpu) * 1000;
  cpuPourcent = ecouleMicro > 0 ? Math.round(((cpu.user + cpu.system) / ecouleMicro) * 1000) / 10 : 0;
  dernierCpu = process.cpuUsage();
  dernierReleveCpu = maintenant;

  boucleP99Ms = Math.round((boucle.percentile(99) / 1e6) * 10) / 10;
  boucleMaxMs = Math.round((boucle.max / 1e6) * 10) / 10;
  boucle.reset();
}, 5000);
releveProcessus.unref?.();

function etatProcessus() {
  const memoire = process.memoryUsage();
  const tas = getHeapStatistics();
  const mo = (octets: number) => Math.round(octets / 1024 / 1024);

  return {
    demarreLe: new Date(demarrageLe).toISOString(),
    dureeFonctionnementS: Math.round((Date.now() - demarrageLe) / 1000),
    versionNode: process.version,
    pid: process.pid,
    hote: os.hostname(),
    environnement: process.env.NODE_ENV || "development",
    cpuPourcent,
    memoire: {
      residenteMo: mo(memoire.rss),
      tasUtiliseMo: mo(memoire.heapUsed),
      tasLimiteMo: mo(tas.heap_size_limit),
      tasPourcent: Math.round((memoire.heapUsed / tas.heap_size_limit) * 1000) / 10,
      externeMo: mo(memoire.external),
    },
    boucle: { p99Ms: boucleP99Ms, maxMs: boucleMaxMs },
    systeme: {
      charge: os.loadavg().map((c) => Math.round(c * 100) / 100),
      coeurs: os.cpus().length,
      memoireLibreMo: mo(os.freemem()),
      memoireTotaleMo: mo(os.totalmem()),
    },
  };
}

// ---------------------------------------------------------------------------
// L'interface publique
// ---------------------------------------------------------------------------

export const Surveillance = {
  /** Une requête HTTP terminée. */
  requete(route: string, statut: number, dureeMs: number) {
    const minute = minuteCourante();
    minute.requetes += 1;
    if (statut >= 500) minute.erreurs5xx += 1;
    else if (statut >= 400) minute.erreurs4xx += 1;
    echantillonner(minute.durees, dureeMs, DUREES_PAR_MINUTE, minute.requetes);

    let stat = routes.get(route);
    if (!stat) {
      if (routes.size >= ROUTES_MAX) return;
      stat = {
        route,
        requetes: 0,
        erreurs5xx: 0,
        erreurs4xx: 0,
        dureeTotale: 0,
        dureeMax: 0,
        durees: [],
        derniereFois: 0,
      };
      routes.set(route, stat);
    }

    stat.requetes += 1;
    if (statut >= 500) stat.erreurs5xx += 1;
    else if (statut >= 400) stat.erreurs4xx += 1;
    stat.dureeTotale += dureeMs;
    stat.dureeMax = Math.max(stat.dureeMax, dureeMs);
    stat.derniereFois = Date.now();
    // Les plus récentes : une route qui ralentit doit se voir tout de suite.
    stat.durees.push(dureeMs);
    if (stat.durees.length > DUREES_PAR_ROUTE) stat.durees.shift();
  },

  /** Une panne côté serveur (réponse 5xx), avec de quoi la retrouver. */
  erreurServeur(erreur: Omit<ErreurServeur, "instant">) {
    empiler(
      erreursServeur,
      {
        ...erreur,
        instant: new Date().toISOString(),
        // Les premières lignes suffisent à situer la panne.
        pile: erreur.pile?.split("\n").slice(0, 8).join("\n"),
      },
      ERREURS_GARDEES
    );
  },

  /**
   * Une erreur survenue dans le navigateur d'un visiteur.
   *
   * Regroupées par empreinte : la même erreur vue mille fois est une ligne
   * avec mille occurrences, pas mille lignes.
   */
  erreurNavigateur(erreur: {
    message: string;
    source?: string;
    page: string;
    pile?: string;
    navigateur?: string;
  }) {
    minuteCourante().erreursNavigateur += 1;

    const premiereLigne = erreur.pile?.split("\n").find((l) => l.trim().startsWith("at ")) || "";
    const empreinte = `${erreur.message.slice(0, 200)}|${erreur.source || premiereLigne}`;
    const maintenant = new Date().toISOString();
    const existante = erreursNavigateur.get(empreinte);

    if (existante) {
      existante.occurrences += 1;
      existante.derniereFois = maintenant;
      existante.page = erreur.page;
      return;
    }

    // La plus ancienne cède sa place.
    if (erreursNavigateur.size >= ERREURS_GARDEES) {
      const plusAncienne = [...erreursNavigateur.values()].sort((a, b) =>
        a.derniereFois.localeCompare(b.derniereFois)
      )[0];
      erreursNavigateur.delete(plusAncienne.empreinte);
    }

    erreursNavigateur.set(empreinte, {
      empreinte,
      ...erreur,
      pile: erreur.pile?.split("\n").slice(0, 8).join("\n"),
      occurrences: 1,
      premiereFois: maintenant,
      derniereFois: maintenant,
    });
  },

  /** Déclare une tâche de fond, pour qu'une tâche qui ne tourne jamais se voie. */
  declarerTache(cle: string, libelle: string, intervalleMs: number) {
    if (taches.has(cle)) return;
    taches.set(cle, {
      cle,
      libelle,
      intervalleMs,
      declareeLe: Date.now(),
      executions: 0,
      echecs: 0,
      echecsDeSuite: 0,
      enCours: false,
    });
  },

  /**
   * Exécute un passage de tâche en relevant sa durée et son issue.
   *
   * L'erreur est relevée puis relancée : la tâche garde sa propre façon de
   * la journaliser.
   */
  async executerTache<T>(cle: string, passage: () => Promise<T>): Promise<T> {
    const tache = taches.get(cle);
    if (!tache) return passage();

    tache.enCours = true;
    tache.dernierDebut = Date.now();

    try {
      const resultat = await passage();
      tache.derniereReussite = Date.now();
      tache.echecsDeSuite = 0;
      return resultat;
    } catch (err) {
      tache.echecs += 1;
      tache.echecsDeSuite += 1;
      tache.derniereErreur = resumeErreur(err);
      throw err;
    } finally {
      tache.executions += 1;
      tache.enCours = false;
      tache.derniereFin = Date.now();
      tache.derniereDureeMs = tache.derniereFin - (tache.dernierDebut ?? tache.derniereFin);
    }
  },

  processus: etatProcessus,
  fenetre: bilanFenetre,
  serie: serieMinutes,

  routes(limite = 50) {
    return [...routes.values()]
      .map((r) => ({
        route: r.route,
        requetes: r.requetes,
        erreurs4xx: r.erreurs4xx,
        erreurs5xx: r.erreurs5xx,
        tauxErreur5xx: Math.round((r.erreurs5xx / r.requetes) * 1000) / 10,
        moyenneMs: Math.round(r.dureeTotale / r.requetes),
        p95Ms: centile(r.durees, 95),
        maxMs: Math.round(r.dureeMax),
        derniereFois: new Date(r.derniereFois).toISOString(),
      }))
      .sort((a, b) => b.requetes - a.requetes)
      .slice(0, limite);
  },

  erreursServeur: () => [...erreursServeur],

  erreursNavigateur: () =>
    [...erreursNavigateur.values()].sort((a, b) => b.derniereFois.localeCompare(a.derniereFois)),

  taches() {
    const maintenant = Date.now();
    return [...taches.values()].map((t) => {
      // En retard : aucun passage terminé depuis trois intervalles (avec une
      // minute de grâce, pour les tâches très fréquentes).
      const reference = t.derniereFin ?? t.declareeLe;
      const retard = maintenant - reference > t.intervalleMs * 3 + MINUTE;
      const etat = t.echecsDeSuite >= 3 ? "PANNE" : retard ? "RETARD" : t.echecsDeSuite > 0 ? "ATTENTION" : "OK";

      return {
        cle: t.cle,
        libelle: t.libelle,
        intervalleMs: t.intervalleMs,
        etat,
        enCours: t.enCours,
        executions: t.executions,
        echecs: t.echecs,
        echecsDeSuite: t.echecsDeSuite,
        derniereFin: t.derniereFin ? new Date(t.derniereFin).toISOString() : null,
        derniereReussite: t.derniereReussite ? new Date(t.derniereReussite).toISOString() : null,
        derniereDureeMs: t.derniereDureeMs ?? null,
        derniereErreur: t.derniereErreur ?? null,
      };
    });
  },

  /** Pour les tests : repartir d'une page blanche. */
  reinitialiser() {
    minutes.length = 0;
    routes.clear();
    erreursServeur.length = 0;
    erreursNavigateur.clear();
    taches.clear();
  },
};
