import { db } from "./db";

/**
 * Santé de la plateforme, en un chiffre et ses raisons.
 *
 * La carte du tableau de bord affichait « 0 % » en permanence : la route ne
 * renvoyait pas le champ que la page lisait. Un indicateur qui ne mesure rien
 * est pire qu'absent — celui-ci repose sur cinq relevés, et chacun dit ce
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
      poids: 30,
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
      poids: 30,
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

/** Une sauvegarde récente existe-t-elle. */
async function controlerSauvegardes(): Promise<Controle> {
  const derniere = await db.backup.findFirst({
    where: { status: "COMPLETED" },
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
      detail: "Aucune sauvegarde terminée",
      remede: "Lancez une sauvegarde depuis Données : sans elle, une perte est définitive.",
    };
  }

  const jours = Math.floor((Date.now() - derniere.createdAt.getTime()) / JOUR);
  const score = jours <= 7 ? 1 : jours <= 30 ? 0.5 : 0.2;

  return {
    cle: "sauvegardes",
    libelle: "Sauvegardes",
    poids: 20,
    score,
    etat: etatDuScore(score),
    detail:
      jours === 0
        ? "Sauvegarde du jour"
        : `Dernière sauvegarde il y a ${jours} jour${jours > 1 ? "s" : ""}`,
    remede: score === 1 ? "" : "Lancez une sauvegarde depuis Données : la dernière commence à dater.",
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
      poids: 15,
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
    poids: 15,
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
