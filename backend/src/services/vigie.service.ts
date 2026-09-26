import { db } from "./db";
import { logger } from "../config/logger";
import { emailTransporter } from "../config/email";
import { etatTempsReel } from "../config/socket";
import { EmailService } from "./email.service";
import { Notifier } from "./notifier.service";
import { Surveillance, resumeErreur } from "./surveillance.service";
import { Disponibilite } from "./disponibilite.service";

/**
 * La vigie : elle regarde les mesures à intervalle régulier, ouvre un incident
 * quand un seuil est franchi, le referme quand tout rentre dans l'ordre, et
 * prévient la plateforme dans les deux cas.
 *
 * Sans elle, les mesures n'existent que pour qui ouvre la page : une panne à
 * trois heures du matin se découvrait au réveil, par les clients.
 */

const INTERVALLE_MS = 30_000;
/** Un contrôle de courriel ouvre une connexion : on ne le refait pas à chaque passage. */
const INTERVALLE_SMTP_MS = 5 * 60_000;
/** Deux passages sans défaut avant de refermer : un seuil qui oscille ne doit pas alerter en boucle. */
const PASSAGES_POUR_REFERMER = 2;
/** Un même incident ne renvoie pas d'alerte plus d'une fois par quart d'heure. */
const RELANCE_MIN_MS = 15 * 60_000;
const HISTORIQUE_MAX = 50;

/** Les seuils, en un seul endroit. */
export const SEUILS = {
  /** Sur les cinq dernières minutes, et seulement au-delà de ce volume. */
  requetesMin: 20,
  tauxErreur5xxAttention: 2,
  tauxErreur5xxCritique: 10,
  p95AttentionMs: 1500,
  p95CritiqueMs: 5000,
  boucleAttentionMs: 200,
  tasAttentionPourcent: 85,
  baseLenteMs: 500,
  erreursNavigateurAttention: 25,
};

export type Niveau = "ATTENTION" | "CRITIQUE";

export interface Incident {
  cle: string;
  niveau: Niveau;
  titre: string;
  detail: string;
  ouvertLe: string;
  resoluLe?: string;
  passagesSains: number;
}

type EtatDependance = "OK" | "ATTENTION" | "PANNE" | "NON_CONFIGURE";

interface Dependance {
  cle: string;
  libelle: string;
  etat: EtatDependance;
  detail: string;
  dureeMs?: number;
  verifieLe: string;
}

const ouverts = new Map<string, Incident>();
const historique: Incident[] = [];
const derniereAlerte = new Map<string, number>();
let dependances: Dependance[] = [];
let dernierSmtp: { instant: number; dependance: Dependance } | null = null;
let dernierPassage: string | null = null;
let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

// ---------------------------------------------------------------------------
// Dépendances
// ---------------------------------------------------------------------------

const avecDelai = <T>(promesse: Promise<T>, ms: number) =>
  Promise.race([
    promesse,
    new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error(`Pas de réponse en ${ms} ms`)), ms).unref?.()),
  ]);

async function verifierBase(): Promise<Dependance> {
  const depart = Date.now();
  try {
    await avecDelai(db.$queryRaw`SELECT 1`, 3000);
    const dureeMs = Date.now() - depart;
    return {
      cle: "base",
      libelle: "Base de données",
      etat: dureeMs > SEUILS.baseLenteMs ? "ATTENTION" : "OK",
      detail: `Répond en ${dureeMs} ms`,
      dureeMs,
      verifieLe: new Date().toISOString(),
    };
  } catch (err) {
    return {
      cle: "base",
      libelle: "Base de données",
      etat: "PANNE",
      detail: resumeErreur(err),
      verifieLe: new Date().toISOString(),
    };
  }
}

async function verifierSmtp(): Promise<Dependance> {
  if (dernierSmtp && Date.now() - dernierSmtp.instant < INTERVALLE_SMTP_MS) {
    return dernierSmtp.dependance;
  }

  const depart = Date.now();
  let dependance: Dependance;
  try {
    await avecDelai(emailTransporter.verify(), 5000);
    dependance = {
      cle: "email",
      libelle: "Envoi des courriels (SMTP)",
      etat: "OK",
      detail: `Serveur joint en ${Date.now() - depart} ms`,
      dureeMs: Date.now() - depart,
      verifieLe: new Date().toISOString(),
    };
  } catch (err) {
    dependance = {
      cle: "email",
      libelle: "Envoi des courriels (SMTP)",
      // Sans serveur configuré, c'est un poste de développement, pas une panne.
      etat: process.env.SMTP_HOST ? "PANNE" : "NON_CONFIGURE",
      detail: process.env.SMTP_HOST
        ? resumeErreur(err)
        : "SMTP_HOST absent : les courriels ne partent pas",
      verifieLe: new Date().toISOString(),
    };
  }

  dernierSmtp = { instant: Date.now(), dependance };
  return dependance;
}

function verifierConfigurations(): Dependance[] {
  const maintenant = new Date().toISOString();
  const { redis } = etatTempsReel();
  const canaux = Notifier.canaux;
  const stripeActif = process.env.ENABLE_STRIPE !== "false";

  return [
    {
      cle: "redis",
      libelle: "Temps réel multi-instances (Redis)",
      etat: !redis.configure ? "NON_CONFIGURE" : redis.pret ? "OK" : "PANNE",
      detail: !redis.configure
        ? "REDIS_URL absent : une seule instance possible"
        : redis.pret
          ? "Instances reliées"
          : "Redis injoignable : le temps réel ne marche plus qu'entre clients d'une même instance",
      verifieLe: maintenant,
    },
    {
      cle: "stripe",
      libelle: "Paiement en ligne (Stripe)",
      etat: !stripeActif || !process.env.STRIPE_SECRET_KEY
        ? "NON_CONFIGURE"
        : process.env.STRIPE_WEBHOOK_SECRET
          ? "OK"
          : "ATTENTION",
      detail: !stripeActif
        ? "Désactivé (ENABLE_STRIPE=false)"
        : !process.env.STRIPE_SECRET_KEY
          ? "STRIPE_SECRET_KEY absent"
          : process.env.STRIPE_WEBHOOK_SECRET
            ? "Clé et secret de webhook présents"
            : "STRIPE_WEBHOOK_SECRET absent : les paiements ne seront jamais confirmés",
      verifieLe: maintenant,
    },
    {
      cle: "sms",
      libelle: "SMS (Twilio)",
      etat: canaux.sms ? "OK" : "NON_CONFIGURE",
      detail: canaux.sms ? "Identifiants présents" : "Identifiants Twilio absents : aucun SMS ne part",
      verifieLe: maintenant,
    },
    {
      cle: "push",
      libelle: "Notifications push navigateur",
      etat: canaux.push ? "OK" : "NON_CONFIGURE",
      detail: canaux.push ? "Clés VAPID valides" : "Clés VAPID absentes ou invalides",
      verifieLe: maintenant,
    },
  ];
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

interface Constat {
  cle: string;
  niveau: Niveau;
  titre: string;
  detail: string;
}

function evaluer(): Constat[] {
  const constats: Constat[] = [];
  const fenetre = Surveillance.fenetre(5);
  const processus = Surveillance.processus();

  for (const dependance of dependances) {
    if (dependance.etat !== "PANNE") continue;
    constats.push({
      cle: `dependance:${dependance.cle}`,
      niveau: dependance.cle === "base" ? "CRITIQUE" : "ATTENTION",
      titre: `${dependance.libelle} en panne`,
      detail: dependance.detail,
    });
  }

  const base = dependances.find((d) => d.cle === "base");
  if (base?.etat === "ATTENTION") {
    constats.push({
      cle: "base:lente",
      niveau: "ATTENTION",
      titre: "Base de données lente",
      detail: base.detail,
    });
  }

  if (fenetre.requetes >= SEUILS.requetesMin) {
    if (fenetre.tauxErreur5xx >= SEUILS.tauxErreur5xxAttention) {
      constats.push({
        cle: "http:erreurs",
        niveau: fenetre.tauxErreur5xx >= SEUILS.tauxErreur5xxCritique ? "CRITIQUE" : "ATTENTION",
        titre: "Taux d'erreurs serveur élevé",
        detail: `${fenetre.erreurs5xx} réponses 5xx sur ${fenetre.requetes} requêtes (${fenetre.tauxErreur5xx} %) sur 5 minutes`,
      });
    }

    if (fenetre.p95Ms >= SEUILS.p95AttentionMs) {
      constats.push({
        cle: "http:lenteur",
        niveau: fenetre.p95Ms >= SEUILS.p95CritiqueMs ? "CRITIQUE" : "ATTENTION",
        titre: "Temps de réponse dégradé",
        detail: `95 % des requêtes répondent en moins de ${fenetre.p95Ms} ms (seuil ${SEUILS.p95AttentionMs} ms)`,
      });
    }
  }

  if (processus.boucle.p99Ms >= SEUILS.boucleAttentionMs) {
    constats.push({
      cle: "processus:boucle",
      niveau: "ATTENTION",
      titre: "Serveur saturé",
      detail: `La boucle d'événements prend jusqu'à ${processus.boucle.p99Ms} ms de retard : un calcul bloque le serveur`,
    });
  }

  if (processus.memoire.tasPourcent >= SEUILS.tasAttentionPourcent) {
    constats.push({
      cle: "processus:memoire",
      niveau: "ATTENTION",
      titre: "Mémoire presque pleine",
      detail: `${processus.memoire.tasUtiliseMo} Mo utilisés sur ${processus.memoire.tasLimiteMo} Mo (${processus.memoire.tasPourcent} %)`,
    });
  }

  for (const tache of Surveillance.taches()) {
    if (tache.etat !== "PANNE" && tache.etat !== "RETARD") continue;
    constats.push({
      cle: `tache:${tache.cle}`,
      niveau: "ATTENTION",
      titre:
        tache.etat === "PANNE"
          ? `Tâche « ${tache.libelle} » en échec`
          : `Tâche « ${tache.libelle} » à l'arrêt`,
      detail:
        tache.etat === "PANNE"
          ? `${tache.echecsDeSuite} échecs de suite : ${tache.derniereErreur}`
          : `Aucun passage terminé depuis ${tache.derniereFin ?? "le démarrage"}`,
    });
  }

  // L'API se sonde elle-même : sa panne est déjà dite par celle de la base.
  for (const cible of Disponibilite.enEchec()) {
    if (cible.cle === "api") continue;
    constats.push({
      cle: `disponibilite:${cible.cle}`,
      niveau: cible.cle === "site" ? "CRITIQUE" : "ATTENTION",
      titre: `${cible.libelle} injoignable`,
      detail: `${cible.url} : ${cible.erreur} (${cible.echecsDeSuite} relevés en échec de suite)`,
    });
  }

  if (fenetre.erreursNavigateur >= SEUILS.erreursNavigateurAttention) {
    constats.push({
      cle: "navigateur:erreurs",
      niveau: "ATTENTION",
      titre: "Erreurs en série chez les visiteurs",
      detail: `${fenetre.erreursNavigateur} erreurs remontées des navigateurs en 5 minutes`,
    });
  }

  return constats;
}

// ---------------------------------------------------------------------------
// Alertes
// ---------------------------------------------------------------------------

async function destinataires(): Promise<string[]> {
  const configures = (process.env.MONITORING_ALERT_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  try {
    const proprietaires = await db.user.findMany({
      where: { isSuperOwner: true },
      select: { email: true },
    });
    return [...new Set([...configures, ...proprietaires.map((p) => p.email)])];
  } catch {
    // Base coupée : on prévient au moins les adresses configurées.
    return configures;
  }
}

async function alerter(incident: Incident, ouverture: boolean) {
  if (process.env.NODE_ENV === "test" || process.env.MONITORING_ALERTS === "false") return;

  const derniere = derniereAlerte.get(incident.cle) ?? 0;
  if (ouverture && Date.now() - derniere < RELANCE_MIN_MS) return;
  if (ouverture) derniereAlerte.set(incident.cle, Date.now());

  const prefixe = ouverture ? (incident.niveau === "CRITIQUE" ? "🔴" : "🟠") : "✅";
  const sujet = ouverture
    ? `${prefixe} [Zupone] ${incident.titre}`
    : `${prefixe} [Zupone] Rétabli : ${incident.titre}`;
  const texte = ouverture
    ? `${incident.detail}\n\nOuvert le ${new Date(incident.ouvertLe).toLocaleString("fr-FR")}.`
    : `L'incident est clos (ouvert le ${new Date(incident.ouvertLe).toLocaleString("fr-FR")}).`;
  const lien = `${process.env.FRONTEND_URL || "http://localhost:3000"}/superowner/monitoring`;

  const webhook = process.env.MONITORING_WEBHOOK_URL;
  if (webhook) {
    // `text` pour Slack et Mattermost, `content` pour Discord.
    const message = `${sujet}\n${texte}\n${lien}`;
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, content: message }),
    }).catch((err) =>
      logger.warn("Alerte de surveillance : webhook injoignable", {
        error: err instanceof Error ? err.message : err,
      })
    );
  }

  // Prévenir par courriel que les courriels ne partent plus n'arriverait pas.
  if (incident.cle === "dependance:email") return;

  for (const email of await destinataires()) {
    EmailService.sendEmail({
      to: email,
      subject: sujet,
      text: `${texte}\n\n${lien}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
        <h2 style="color:${ouverture ? "#dc2626" : "#16a34a"}">${sujet}</h2>
        <p>${texte.replace(/\n/g, "<br>")}</p>
        <p><a href="${lien}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Ouvrir la surveillance</a></p>
      </div>`,
    }).catch(() => {
      // EmailService journalise déjà l'échec.
    });
  }
}

// ---------------------------------------------------------------------------
// Passage
// ---------------------------------------------------------------------------

async function passer() {
  if (enCours) return;
  enCours = true;

  try {
    const [base, smtp] = await Promise.all([verifierBase(), verifierSmtp()]);
    dependances = [base, smtp, ...verifierConfigurations()];

    const constats = evaluer();
    const vus = new Set(constats.map((c) => c.cle));

    for (const constat of constats) {
      const existant = ouverts.get(constat.cle);
      if (existant) {
        // Un incident qui s'aggrave passe au niveau supérieur, et le dit.
        const aggrave = existant.niveau === "ATTENTION" && constat.niveau === "CRITIQUE";
        existant.niveau = constat.niveau;
        existant.detail = constat.detail;
        existant.passagesSains = 0;
        if (aggrave) {
          derniereAlerte.delete(existant.cle);
          await alerter(existant, true);
        }
        continue;
      }

      const incident: Incident = {
        ...constat,
        ouvertLe: new Date().toISOString(),
        passagesSains: 0,
      };
      ouverts.set(constat.cle, incident);
      logger.warn("Surveillance : incident ouvert", { cle: incident.cle, detail: incident.detail });
      await alerter(incident, true);
    }

    for (const [cle, incident] of ouverts) {
      if (vus.has(cle)) continue;
      incident.passagesSains += 1;
      if (incident.passagesSains < PASSAGES_POUR_REFERMER) continue;

      incident.resoluLe = new Date().toISOString();
      ouverts.delete(cle);
      historique.unshift(incident);
      if (historique.length > HISTORIQUE_MAX) historique.length = HISTORIQUE_MAX;
      logger.info("Surveillance : incident clos", { cle });
      await alerter(incident, false);
    }

    dernierPassage = new Date().toISOString();
  } catch (err) {
    logger.error("Surveillance : passage impossible", {
      error: err instanceof Error ? err.message : err,
    });
  } finally {
    enCours = false;
  }
}

// ---------------------------------------------------------------------------
// Interface publique
// ---------------------------------------------------------------------------

export const Vigie = {
  demarrer() {
    if (minuteur) return;
    passer();
    minuteur = setInterval(passer, INTERVALLE_MS);
    minuteur.unref?.();
    logger.info("Surveillance du site activée", { intervalleMs: INTERVALLE_MS });
  },

  arreter() {
    if (!minuteur) return;
    clearInterval(minuteur);
    minuteur = null;
  },

  /** Un passage immédiat, pour le bouton « Relever » et les tests. */
  passer,

  /**
   * Le serveur peut-il servir ? Pour les sondes externes (UptimeRobot,
   * répartiteur de charge, Kubernetes) : 200 si la base répond, 503 sinon.
   */
  async pret() {
    const base = await verifierBase();
    return {
      pret: base.etat !== "PANNE",
      base: { etat: base.etat, dureeMs: base.dureeMs ?? null, detail: base.detail },
      dureeFonctionnementS: Surveillance.processus().dureeFonctionnementS,
    };
  },

  /** Tout ce que montre la page de surveillance. */
  instantane() {
    const incidents = [...ouverts.values()];
    const statut = incidents.some((i) => i.niveau === "CRITIQUE")
      ? "PANNE"
      : incidents.length > 0
        ? "DEGRADE"
        : "OK";

    return {
      statut,
      dernierPassage,
      seuils: SEUILS,
      alertes: {
        courriel: process.env.MONITORING_ALERTS !== "false",
        webhook: Boolean(process.env.MONITORING_WEBHOOK_URL),
        adressesSupplementaires: (process.env.MONITORING_ALERT_EMAILS || "").split(",").filter((e) => e.trim()).length,
      },
      incidents: { ouverts: incidents, historique: [...historique] },
      trafic: {
        cinqMinutes: Surveillance.fenetre(5),
        uneHeure: Surveillance.fenetre(60),
        serie: Surveillance.serie(60),
      },
      processus: Surveillance.processus(),
      tempsReel: etatTempsReel(),
      dependances,
      taches: Surveillance.taches(),
      routes: Surveillance.routes(60),
      erreurs: {
        serveur: Surveillance.erreursServeur(),
        navigateur: Surveillance.erreursNavigateur(),
      },
    };
  },
};
