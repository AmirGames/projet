import { PREFIXE_SAUVEGARDE_COMPLETE } from "./backup.service";
import { Outbox } from "../jobs/outbox.service";
import { db } from "../../services/db";

/**
 * Santé de la plateforme, en un chiffre et ses raisons.
 *
 * La carte du tableau de bord affichait « 0 % » en permanence : la route ne
 * renvoyait pas le champ que la page lisait. Un indicateur qui ne mesure rien
 * est pire qu'absent — celui-ci repose sur six relevés, et chacun dit ce
 * qu'il faut faire pour le remonter.
 */

export type EtatControle = "OK" | "ATTENTION" | "PANNE";

export interface Controle {
  cle: string;
  libelle: string;
  /** Part du score total, en points sur 100. */
  poids: number;
  /** Ce que vaut ce contrôle, de 0 à 1. */
  score: number;
  etat: EtatControle;
  /** Ce qui a été mesuré, en clair. */
  detail: string;
  /** Ce qu'il faut faire pour le remonter — vide quand tout va bien. */
  remede: string;
}

const MINUTE = 60 * 1000;
const JOUR = 24 * 60 * 60 * 1000;

/** Un score continu ramené à un état lisible. */
function etatDuScore(score: number): EtatControle {
  if (score >= 0.9) return "OK";
  if (score >= 0.5) return "ATTENTION";
  return "PANNE";
}

/** La base répond-elle, et en combien de temps. */
async function controlerBase(): Promise<Controle> {
  const depart = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
    const duree = Date.now() - depart;

    // Au-delà d'une demi-seconde pour un aller-retour vide, ce n'est plus la
    // requête qui coûte : c'est le lien avec la base.
    const score = duree < 100 ? 1 : duree < 500 ? 0.7 : 0.3;

    return {
      cle: "base",
      libelle: "Base de données",
      poids: 25,
      score,
      etat: etatDuScore(score),
      detail: `Aller-retour en ${duree} ms`,
      remede:
        score === 1
          ? ""
          : "La base répond lentement : vérifiez la charge du serveur et les index des tables les plus lues.",
    };
  } catch (err) {
    return {
      cle: "base",
      libelle: "Base de données",
      poids: 25,
      score: 0,
      etat: "PANNE",
      detail: err instanceof Error ? err.message : "Injoignable",
      remede: "La base ne répond pas. Rien d'autre ne fonctionnera tant qu'elle est coupée.",
    };
  }
}

/** Le site est-il ouvert, ou volontairement fermé. */
async function controlerMaintenance(): Promise<Controle> {
  const config = await db.systemConfig.findFirst({
    select: { maintenanceMode: true },
  });

  const ouvert = !config?.maintenanceMode;

  return {
    cle: "maintenance",
    libelle: "Ouverture du service",
    poids: 15,
    score: ouvert ? 1 : 0,
    etat: ouvert ? "OK" : "PANNE",
    detail: ouvert ? "Le site est ouvert au public" : "Mode maintenance activé",
    remede: ouvert
      ? ""
      : "Le site est volontairement fermé. Coupez le mode maintenance dans Configuration pour le rouvrir.",
  };
}

/**
 * Une vraie sauvegarde récente existe-t-elle : dump PostgreSQL + fichiers, faits
 * par `deploy/zup.sh backup`. L'export JSON partiel de l'écran Données n'en est
 * pas une et ne compte pas : il ne permet pas de reprendre après une perte de base.
 */
async function controlerSauvegardes(): Promise<Controle> {
  const derniere = await db.backup.findFirst({
    where: { status: "COMPLETED", name: { startsWith: PREFIXE_SAUVEGARDE_COMPLETE } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!derniere) {
    return {
      cle: "sauvegardes",
      libelle: "Sauvegardes",
      poids: 20,
      score: 0,
      etat: "PANNE",
      detail: "Aucune sauvegarde complète enregistrée",
      remede:
        "Planifiez `deploy/zup.sh backup` sur le serveur (voir DEPLOIEMENT-SCALEWAY.md). L'export partiel de l'écran Données ne remplace pas une sauvegarde.",
    };
  }

  const jours = Math.floor((Date.now() - derniere.createdAt.getTime()) / JOUR);
  // Sauvegarde nocturne attendue : au-delà de deux jours, quelque chose a cessé.
  const score = jours <= 2 ? 1 : jours <= 7 ? 0.5 : 0.2;

  return {
    cle: "sauvegardes",
    libelle: "Sauvegardes",
    poids: 20,
    score,
    etat: etatDuScore(score),
    detail:
      jours === 0
        ? "Sauvegarde complète du jour"
        : `Dernière sauvegarde complète il y a ${jours} jour${jours > 1 ? "s" : ""}`,
    remede: score === 1 ? "" : "La sauvegarde nocturne ne passe plus : consultez ~/sauvegardes.log sur le serveur.",
  };
}

/** Les courses trouvent-elles un livreur. */
async function controlerAttribution(): Promise<Controle> {
  const depuis = new Date(Date.now() - JOUR);

  const [total, sansLivreur] = await Promise.all([
    db.orderDelivery.count({ where: { createdAt: { gte: depuis } } }),
    db.orderDelivery.count({ where: { createdAt: { gte: depuis }, driverId: null } }),
  ]);

  // Pas de course à livrer n'est pas un défaut : on ne reproche pas à la
  // plateforme une journée sans commande.
  if (total === 0) {
    return {
      cle: "attribution",
      libelle: "Attribution des courses",
      poids: 20,
      score: 1,
      etat: "OK",
      detail: "Aucune livraison sur les dernières 24 h",
      remede: "",
    };
  }

  const score = (total - sansLivreur) / total;

  return {
    cle: "attribution",
    libelle: "Attribution des courses",
    poids: 20,
    score,
    etat: etatDuScore(score),
    detail: `${total - sansLivreur} livraison${total - sansLivreur > 1 ? "s" : ""} sur ${total} ${
      total > 1 ? "ont" : "a"
    } trouvé un livreur`,
    remede:
      score >= 0.9
        ? ""
        : "Des courses restent sans livreur : vérifiez le rayon de recherche et la rémunération dans Avancé, et le nombre de livreurs en ligne.",
  };
}

/** Les webhooks partent-ils sans erreur. */
async function controlerWebhooks(): Promise<Controle> {
  const depuis = new Date(Date.now() - JOUR);

  const [total, reussies] = await Promise.all([
    db.webhookDelivery.count({ where: { createdAt: { gte: depuis } } }),
    db.webhookDelivery.count({ where: { createdAt: { gte: depuis }, success: true } }),
  ]);

  if (total === 0) {
    return {
      cle: "webhooks",
      libelle: "Webhooks",
      poids: 10,
      score: 1,
      etat: "OK",
      detail: "Aucun envoi sur les dernières 24 h",
      remede: "",
    };
  }

  const score = reussies / total;

  return {
    cle: "webhooks",
    libelle: "Webhooks",
    poids: 10,
    score,
    etat: etatDuScore(score),
    detail: `${reussies} envoi${reussies > 1 ? "s" : ""} sur ${total} ${
      total > 1 ? "ont abouti" : "a abouti"
    }`,
    remede:
      score >= 0.9
        ? ""
        : "Des envois échouent : vérifiez les adresses appelées dans Webhooks, et désactivez celles qui ne répondent plus.",
  };
}

/**
 * Les messages en file partent-ils (e-mails de suivi de commande).
 *
 * Un message dû depuis plus de cinq minutes veut dire que le worker ne tourne
 * pas ou que le courriel est en panne ; un message abandonné (FAILED) est un
 * e-mail qui n'est jamais parti.
 */
async function controlerNotifications(): Promise<Controle> {
  const [etat, abandonnes] = await Promise.all([
    Outbox.etat(),
    db.outboxMessage.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 7 * JOUR) } } }),
  ]);

  let score = 1;
  if (etat.retardMs > 5 * MINUTE) score = etat.retardMs > 60 * MINUTE ? 0 : 0.5;
  if (abandonnes > 0) score = Math.min(score, 0.5);

  const problemes: string[] = [];
  if (etat.retardMs > 5 * MINUTE) problemes.push(`un message attend depuis ${Math.round(etat.retardMs / MINUTE)} min`);
  if (abandonnes > 0) problemes.push(`${abandonnes} message${abandonnes > 1 ? "s" : ""} abandonné${abandonnes > 1 ? "s" : ""} en 7 jours`);

  return {
    cle: "notifications",
    libelle: "Notifications",
    poids: 10,
    score,
    etat: etatDuScore(score),
    detail: problemes.length === 0
      ? etat.enAttente === 0 ? "Aucun message en attente" : `${etat.enAttente} message${etat.enAttente > 1 ? "s" : ""} en cours d'envoi`
      : problemes.join(" ; "),
    remede: score === 1
      ? ""
      : "Vérifiez le service de courriel (SMTP) et les journaux du serveur ; les messages abandonnés sont dans la table OutboxMessage (statut FAILED).",
  };
}

export class SystemHealthService {
  /**
   * Le score et son détail.
   *
   * Chaque contrôle pèse un nombre de points fixe ; le total est la somme des
   * points obtenus. Un contrôle qui n'a rien à mesurer (aucune livraison,
   * aucun webhook) rend tous ses points : on mesure ce qui existe.
   */
  static async etat() {
    const controles = await Promise.all([
      controlerBase(),
      controlerMaintenance(),
      controlerSauvegardes(),
      controlerAttribution(),
      controlerWebhooks(),
      controlerNotifications(),
    ]);

    const points = controles.reduce(
      (somme, controle) => somme + controle.poids * controle.score,
      0
    );

    return {
      score: Math.round(points),
      controles: controles.map((controle) => ({
        ...controle,
        // Ce que ce contrôle rapporte réellement, pour que la somme se vérifie
        // à l'œil nu.
        pointsObtenus: Math.round(controle.poids * controle.score),
      })),
    };
  }

  /** Le seul score, pour le tableau de bord. */
  static async score() {
    return (await this.etat()).score;
  }
}
