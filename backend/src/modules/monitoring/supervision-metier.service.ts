import { db } from "../../services/db";
import { getEnv } from "../../config/env";
import { Outbox } from "../jobs/outbox.service";
import { reversementsDepuis } from "../payouts/merchant-payout.service";
import { debutDeSemaine } from "../../utils/semaine-bruxelles";
import { PREFIXE_SAUVEGARDE_COMPLETE } from "./backup.service";
import { PagesLegalesService } from "../legal/pages-legales.service";

/**
 * Les alertes « métier » : ce qui est cassé sans qu'aucune requête n'échoue.
 *
 * La vigie surveille le serveur (erreurs 5xx, lenteur, base). Elle ne voit pas
 * une commande payée que le commerçant n'a jamais reçue, un webhook Stripe qui
 * n'aboutit pas, un remboursement qui n'arrive pas, un lundi sans relevés ou
 * une sauvegarde qui a cessé : tout cela est silencieux. Chaque contrôle
 * compte des lignes en base et ne produit un incident que passé un délai de grâce.
 *
 * Rien n'est corrigé ici : on prévient (les incidents ouverts et clos sont
 * suivis par la vigie, qui envoie les courriels).
 */

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Les délais de grâce, en un seul endroit. */
export const DELAIS_METIER = {
  /** Le temps d'annoncer au commerçant une commande payée (outbox comprise). */
  commandeNonAnnoncee: 10 * MINUTE,
  /** Au-delà, le worker de l'outbox a du retard. */
  outboxEnRetard: 5 * MINUTE,
  /** Stripe renvoie un événement non acquitté pendant des jours : 10 minutes sans succès, c'est anormal. */
  webhookBloque: 10 * MINUTE,
  /** Un remboursement carte aboutit en quelques jours ouvrés au plus. */
  remboursementEnAttente: 3 * JOUR,
  /** Les relevés s'arrêtent le lundi 00 h 00 ; on laisse 12 h avant de s'inquiéter. */
  releveManquant: 12 * HEURE,
  /** Sauvegarde nocturne attendue. */
  sauvegarde: 2 * JOUR,
};

export interface MesuresMetier {
  commandesNonAnnoncees: number;
  outbox: { enAttente: number; echecs: number; retardMs: number };
  webhooksBloques: number;
  remboursementsEnAttente: number;
  remboursementsAReprendre?: number;
  /** Null : reversements non activés (PAYOUTS_START_DATE absente). */
  commandesNonReversees: number | null;
  /** Null : hors production, ou pas de contrôle. Sinon l'âge de la dernière sauvegarde complète. */
  ageSauvegardeMs: number | null | "aucune";
  /** Les pages légales encore au texte de départ ou à champs à remplir ; null hors production. */
  pagesLegalesACompleter: string[] | null;
}

export interface ConstatMetier {
  cle: string;
  niveau: "ATTENTION" | "CRITIQUE";
  titre: string;
  detail: string;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Pure : les mesures deviennent des constats. Testable sans base. */
export function constatsDepuisMesures(m: MesuresMetier): ConstatMetier[] {
  const constats: ConstatMetier[] = [];

  if (m.commandesNonAnnoncees > 0) {
    constats.push({
      cle: "metier:commande-non-annoncee",
      niveau: "CRITIQUE",
      titre: "Commande payée non annoncée au commerçant",
      detail: `${pluriel(m.commandesNonAnnoncees, "commande est payée", "commandes sont payées")} depuis plus de ${DELAIS_METIER.commandeNonAnnoncee / MINUTE} min sans avoir été transmise au commerçant. Le client a payé, personne ne prépare.`,
    });
  }

  if (m.outbox.echecs > 0) {
    constats.push({
      cle: "metier:outbox-echecs",
      niveau: "CRITIQUE",
      titre: "Messages abandonnés dans la file d'envoi",
      detail: `${pluriel(m.outbox.echecs, "message a été abandonné", "messages ont été abandonnés")} après plusieurs tentatives (annonces de commande, courriels de suivi). À rejouer ou à traiter à la main.`,
    });
  } else if (m.outbox.retardMs >= DELAIS_METIER.outboxEnRetard) {
    constats.push({
      cle: "metier:outbox-retard",
      niveau: "ATTENTION",
      titre: "File d'envoi en retard",
      detail: `Le plus ancien message attend depuis ${Math.round(m.outbox.retardMs / MINUTE)} min (${m.outbox.enAttente} en attente). Le worker est-il actif ?`,
    });
  }

  if (m.webhooksBloques > 0) {
    constats.push({
      cle: "metier:webhook-bloque",
      niveau: "CRITIQUE",
      titre: "Événements Stripe non traités",
      detail: `${pluriel(m.webhooksBloques, "événement Stripe n'a", "événements Stripe n'ont")} pas pu être traité depuis plus de ${DELAIS_METIER.webhookBloque / MINUTE} min (paiement ou remboursement non pris en compte). Voir la table StripeEvent (lastError).`,
    });
  }

  if ((m.remboursementsAReprendre ?? 0) > 0) {
    constats.push({
      cle: "metier:remboursements-a-reprendre", niveau: "CRITIQUE",
      titre: "Commandes payées sans remboursement réussi",
      detail: `${m.remboursementsAReprendre} cas à examiner, y compris sans identifiant Stripe. GET /api/superowner/orders/refunds/review ; vérifier lastError et l'historique, puis POST /api/superowner/orders/:id/refund/retry (permission billing). Voir docs/REMBOURSEMENTS-REPRISE.md.`,
    });
  }

  if (m.remboursementsEnAttente > 0) {
    constats.push({
      cle: "metier:remboursement-en-attente",
      niveau: "ATTENTION",
      titre: "Remboursements toujours en attente",
      detail: `${pluriel(m.remboursementsEnAttente, "remboursement attend", "remboursements attendent")} la confirmation de Stripe depuis plus de ${DELAIS_METIER.remboursementEnAttente / JOUR} jours : à vérifier dans le tableau de bord Stripe.`,
    });
  }

  if (m.commandesNonReversees != null && m.commandesNonReversees > 0) {
    constats.push({
      cle: "metier:releves-manquants",
      niveau: "ATTENTION",
      titre: "Relevés de reversement non créés",
      detail: `${pluriel(m.commandesNonReversees, "commande terminée n'est", "commandes terminées ne sont")} rattachée${m.commandesNonReversees > 1 ? "s" : ""} à aucun relevé alors que la semaine est close : l'arrêté du lundi a-t-il tourné ?`,
    });
  }

  if (m.ageSauvegardeMs === "aucune") {
    constats.push({
      cle: "metier:sauvegarde",
      niveau: "ATTENTION",
      titre: "Aucune sauvegarde complète enregistrée",
      detail: "Planifiez `deploy/zup.sh backup` sur le serveur (voir DEPLOIEMENT-SCALEWAY.md).",
    });
  } else if (typeof m.ageSauvegardeMs === "number" && m.ageSauvegardeMs > DELAIS_METIER.sauvegarde) {
    constats.push({
      cle: "metier:sauvegarde",
      niveau: "ATTENTION",
      titre: "Sauvegarde complète trop ancienne",
      detail: `La dernière date de ${Math.floor(m.ageSauvegardeMs / JOUR)} jours : la sauvegarde nocturne ne passe plus (voir ~/sauvegardes.log sur le serveur).`,
    });
  }

  if (m.pagesLegalesACompleter && m.pagesLegalesACompleter.length > 0) {
    constats.push({
      cle: "metier:pages-legales",
      niveau: "ATTENTION",
      titre: "Pages légales à compléter",
      detail: `${m.pagesLegalesACompleter.join(", ")} : texte de départ non publié ou champs entre crochets à remplir (identité de la société, médiateur…). À publier depuis l'espace superowner, puis à faire valider juridiquement.`,
    });
  }

  return constats;
}

/**
 * Un champ à remplir ressemble à « [Raison sociale] ». Un lien Markdown
 * « [texte](adresse) » n'en est pas un.
 */
export const aDesChampsAremplir = (contenu: string) => /\[[^\]\n]+\](?!\()/.test(contenu);

/** Compte, en base, ce que les contrôles regardent. */
export async function mesurer(maintenant = new Date()): Promise<MesuresMetier> {
  const avant = (delaiMs: number) => new Date(maintenant.getTime() - delaiMs);

  const debutReversements = reversementsDepuis();
  const finDeSemaineCloseLe = new Date(debutDeSemaine(maintenant).getTime() + DELAIS_METIER.releveManquant);

  const enProduction = getEnv().NODE_ENV === "production";

  const [commandesNonAnnoncees, outbox, webhooksBloques, remboursementsEnAttente, remboursementsAReprendre, commandesNonReversees, derniereSauvegarde, pages] =
    await Promise.all([
      db.order.count({
        where: {
          paymentStatus: "SUCCEEDED",
          submittedAt: null,
          status: "PENDING",
          deletedAt: null,
          payments: { some: { paidAt: { lt: avant(DELAIS_METIER.commandeNonAnnoncee) } } },
        },
      }),
      Outbox.etat(maintenant),
      db.stripeEvent.count({
        where: { processedAt: null, receivedAt: { lt: avant(DELAIS_METIER.webhookBloque) } },
      }),
      db.payment.count({
        where: {
          status: "SUCCEEDED",
          stripeRefundId: { not: null },
          refundedAt: null,
          updatedAt: { lt: avant(DELAIS_METIER.remboursementEnAttente) },
        },
      }),
      db.payment.count({ where: { status: "SUCCEEDED", OR: [
        { refundOperation: { is: { status: "ABANDONED" } } },
        { order: { OR: [{ status: "REJECTED" }, { deletedAt: { not: null } }] },
          OR: [{ refundOperation: { is: null } }, { refundOperation: { is: { status: { not: "SUCCEEDED" }, createdAt: { lt: avant(DELAIS_METIER.webhookBloque) } } } }] },
      ] } }),
      // Seulement une fois les reversements activés, et après l'arrêté du lundi.
      debutReversements && maintenant >= finDeSemaineCloseLe
        ? db.order.count({
            where: {
              status: "COMPLETED",
              paymentStatus: { not: "REFUNDED" },
              merchantPayoutId: null,
              deletedAt: null,
              store: { org: { isDemo: false } },
              createdAt: { gte: debutReversements, lt: debutDeSemaine(maintenant) },
            },
          })
        : Promise.resolve(null),
      enProduction
        ? db.backup.findFirst({
            where: { status: "COMPLETED", name: { startsWith: PREFIXE_SAUVEGARDE_COMPLETE } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
        : Promise.resolve(undefined),
      enProduction ? PagesLegalesService.toutes() : Promise.resolve(null),
    ]);

  return {
    commandesNonAnnoncees,
    outbox,
    webhooksBloques,
    remboursementsEnAttente,
    remboursementsAReprendre,
    commandesNonReversees,
    ageSauvegardeMs:
      derniereSauvegarde === undefined
        ? null
        : derniereSauvegarde
          ? maintenant.getTime() - derniereSauvegarde.createdAt.getTime()
          : "aucune",
    pagesLegalesACompleter: pages
      ? pages.filter((p) => p.parDefaut || aDesChampsAremplir(p.contenu)).map((p) => p.slug)
      : null,
  };
}

/** Les incidents métier du moment. Une panne de mesure ne doit jamais masquer les autres contrôles de la vigie. */
export async function controlesMetier(maintenant = new Date()): Promise<ConstatMetier[]> {
  return constatsDepuisMesures(await mesurer(maintenant));
}
