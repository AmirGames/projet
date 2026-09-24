import { PrismaClient } from "@prisma/client";

import { dureeDeLaRequete, origineActuelle } from "../config/origine";

/**
 * Journalisation des requêtes SQL.
 *
 * Chaque requête était affichée, y compris celles du balayage des courses qui
 * tourne toutes les cinq secondes : la console défilait sans arrêt et les
 * messages utiles — un envoi de courriel refusé, une erreur métier — se
 * perdaient dedans.
 *
 * Elles restent disponibles à la demande : PRISMA_LOG_QUERIES=true.
 */
const journaliserLesRequetes = process.env.PRISMA_LOG_QUERIES === "true";

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      ...(journaliserLesRequetes
        ? [{ emit: "stdout" as const, level: "query" as const }]
        : []),
      { emit: "stdout", level: "info" },
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ],
  });
};

/**
 * Les journaux gardent l'origine de la requête.
 *
 * Treize endroits écrivent dans le journal d'audit, aucun ne renseignait
 * l'adresse ni le navigateur : la page affichait donc « — » partout. Les
 * remplir ici les remplit tous, y compris ceux qui seront écrits demain.
 *
 * L'appelant garde le dernier mot : une valeur qu'il fournit n'est pas
 * remplacée, et hors requête — tâche de fond, script — rien n'est ajouté.
 */
function garderLOrigine(client: PrismaClientBrut) {
  client.$use(async (params, next) => {
    const concerne = params.model === "SystemAuditLog" || params.model === "SecurityEvent";
    const creation = params.action === "create" || params.action === "createMany";

    if (concerne && creation) {
      const origine = origineActuelle();
      const lignes = params.args?.data;

      const duree = dureeDeLaRequete();

      const completer = (ligne: any) => {
        if (!ligne || typeof ligne !== "object") return ligne;
        if (ligne.ipAddress === undefined && origine.ipAddress) ligne.ipAddress = origine.ipAddress;
        if (ligne.userAgent === undefined && origine.userAgent) ligne.userAgent = origine.userAgent;

        // Seuls les événements de sécurité portent une durée.
        if (
          params.model === "SecurityEvent" &&
          ligne.durationMs === undefined &&
          duree !== undefined
        ) {
          ligne.durationMs = duree;
        }

        return ligne;
      };

      if (Array.isArray(lignes)) lignes.forEach(completer);
      else completer(lignes);
    }

    return next(params);
  });

  return client;
}

/** Une écriture sur une commande ou sa livraison, telle que la base la voit. */
export interface EcritureCommande {
  action: "creation" | "modification" | "suppression";
  orderId?: string;
  /** La livraison, quand la commande n'est pas connue directement. */
  deliveryId?: string;
  storeId?: string;
}

let annonceurCommandes: ((ecriture: EcritureCommande) => void) | null = null;

/** Branche celui qui annonce les écritures sur les commandes (le temps réel). */
export function surEcritureCommande(annonceur: (ecriture: EcritureCommande) => void) {
  annonceurCommandes = annonceur;
}

const ECRITURES: Record<string, EcritureCommande["action"]> = {
  create: "creation",
  createMany: "creation",
  update: "modification",
  updateMany: "modification",
  upsert: "modification",
  delete: "suppression",
  deleteMany: "suppression",
};

/**
 * Ce que la position du livreur écrit, toutes les quelques secondes. Elle a
 * son propre canal (`delivery-update`) : l'annoncer ici ferait relire tous
 * les écrans de commandes en permanence.
 */
const CHAMPS_DE_POSITION = new Set([
  "driverLat",
  "driverLng",
  "driverLocationAt",
  "nearCustomerNotifiedAt",
  "updatedAt",
]);

const texte = (valeur: unknown) => (typeof valeur === "string" ? valeur : undefined);

/**
 * Toute écriture sur une commande est annoncée, d'où qu'elle vienne.
 *
 * Une commande change de main sans passer par ses routes : le livreur la
 * récupère et la livre depuis son espace, une tâche de fond l'annule faute de
 * réponse, la fermeture d'un commerce les solde toutes. Le relais des
 * requêtes ne les rattache pas au commerçant ; la base, elle, les voit
 * toutes passer.
 */
function annoncerLesCommandes(client: PrismaClientBrut) {
  client.$use(async (params, next) => {
    const resultat = await next(params);

    const action = ECRITURES[params.action];
    if (!annonceurCommandes || !action) return resultat;
    if (params.model !== "Order" && params.model !== "OrderDelivery") return resultat;

    try {
      const donnees = params.args?.data;
      if (
        params.model === "OrderDelivery" &&
        action === "modification" &&
        donnees &&
        typeof donnees === "object" &&
        !Array.isArray(donnees) &&
        Object.keys(donnees).every((champ) => CHAMPS_DE_POSITION.has(champ))
      ) {
        return resultat;
      }

      const ou = params.args?.where || {};
      const ligne = params.action.endsWith("Many") ? null : resultat;

      const ecriture: EcritureCommande =
        params.model === "Order"
          ? { action, orderId: texte(ligne?.id) ?? texte(ou.id), storeId: texte(ligne?.storeId) ?? texte(ou.storeId) }
          : { action, orderId: texte(ligne?.orderId) ?? texte(ou.orderId), deliveryId: texte(ligne?.id) ?? texte(ou.id) };

      if (ecriture.orderId || ecriture.deliveryId || ecriture.storeId) annonceurCommandes(ecriture);
    } catch {
      // Une annonce manquée ne doit jamais faire échouer l'écriture.
    }

    return resultat;
  });

  return client;
}

type PrismaClientBrut = ReturnType<typeof prismaClientSingleton>;
type PrismaClientSingleton = PrismaClientBrut;

const globalForPrisma = global as unknown as { prisma: PrismaClientSingleton };

export const db = globalForPrisma.prisma || annoncerLesCommandes(garderLOrigine(prismaClientSingleton()));

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
