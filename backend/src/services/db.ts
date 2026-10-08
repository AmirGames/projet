import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { encryptionExtension } from "../modules/privacy/encrypted-fields";
import { encrypt } from "../modules/privacy/crypto";

import { dureeDeLaRequete, origineActuelle } from "../modules/auth/origine";

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
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    // Le carnet personnel ne doit pas sortir avec les fiches client des commerçants ou les avis.
    omit: { customer: { savedAddresses: true } },
    log: [
      ...(journaliserLesRequetes
        ? [{ emit: "stdout" as const, level: "query" as const }]
        : []),
      { emit: "stdout", level: "info" },
      { emit: "stdout", level: "warn" },
      // Les erreurs Prisma peuvent inclure les arguments : elles passent par le gestionnaire expurgé.
      { emit: "event", level: "error" },
    ],
  }).$extends(encryptionExtension);
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
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const concerne =
            model === "SystemAuditLog" || model === "SecurityEvent";
          const creation = operation === "create" || operation === "createMany";

          if (concerne && creation) {
            const origine = origineActuelle();
            const lignes = (args as any)?.data;

            const duree = dureeDeLaRequete();

            const completer = (ligne: any) => {
              if (!ligne || typeof ligne !== "object") return ligne;
              // Ces champs sont chiffrés au repos : ajoutés en clair ici, ils
              // seraient écrits tels quels et leur relecture échouerait en
              // production (« Migration requise »). Le chiffrement ignore ce
              // qui l'est déjà.
              if (ligne.ipAddress === undefined && origine.ipAddress)
                ligne.ipAddress = encrypt(
                  JSON.stringify(origine.ipAddress),
                  `${model}.ipAddress`,
                );
              if (ligne.userAgent === undefined && origine.userAgent)
                ligne.userAgent = encrypt(
                  JSON.stringify(origine.userAgent),
                  `${model}.userAgent`,
                );

              // Seuls les événements de sécurité portent une durée.
              if (
                model === "SecurityEvent" &&
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

          return query(args);
        },
      },
    },
  });
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
export function surEcritureCommande(
  annonceur: (ecriture: EcritureCommande) => void,
) {
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

const texte = (valeur: unknown) =>
  typeof valeur === "string" ? valeur : undefined;

/**
 * Toute écriture sur une commande est annoncée, d'où qu'elle vienne.
 *
 * Une commande change de main sans passer par ses routes : le livreur la
 * récupère et la livre depuis son espace, une tâche de fond l'annule faute de
 * réponse, la fermeture d'un commerce les solde toutes. Le relais des
 * requêtes ne les rattache pas au commerçant ; la base, elle, les voit
 * toutes passer.
 */
function annoncerLesCommandes(client: PrismaClientAvecOrigine) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const resultat: any = await query(args);

          const action = ECRITURES[operation];
          if (!annonceurCommandes || !action) return resultat;
          if (model !== "Order" && model !== "OrderDelivery") return resultat;

          try {
            const donnees = (args as any)?.data;
            if (
              model === "OrderDelivery" &&
              action === "modification" &&
              donnees &&
              typeof donnees === "object" &&
              !Array.isArray(donnees) &&
              Object.keys(donnees).every((champ) =>
                CHAMPS_DE_POSITION.has(champ),
              )
            ) {
              return resultat;
            }

            const ou = (args as any)?.where || {};
            const ligne = operation.endsWith("Many") ? null : resultat;

            const ecriture: EcritureCommande =
              model === "Order"
                ? {
                    action,
                    orderId: texte(ligne?.id) ?? texte(ou.id),
                    storeId: texte(ligne?.storeId) ?? texte(ou.storeId),
                  }
                : {
                    action,
                    orderId: texte(ligne?.orderId) ?? texte(ou.orderId),
                    deliveryId: texte(ligne?.id) ?? texte(ou.id),
                  };

            if (ecriture.orderId || ecriture.deliveryId || ecriture.storeId)
              annonceurCommandes(ecriture);
          } catch {
            // Une annonce manquée ne doit jamais faire échouer l'écriture.
          }

          return resultat;
        },
      },
    },
  });
}

type PrismaClientBrut = ReturnType<typeof prismaClientSingleton>;
type PrismaClientAvecOrigine = ReturnType<typeof garderLOrigine>;
type PrismaClientSingleton = ReturnType<typeof annoncerLesCommandes>;

const globalForPrisma = global as unknown as { prisma: PrismaClientSingleton };

export const db: PrismaClientSingleton =
  globalForPrisma.prisma ||
  annoncerLesCommandes(garderLOrigine(prismaClientSingleton()));

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Le client reçu par `db.$transaction(async (tx) => …)` : celui de `db`, extensions comprises. */
export type ClientTransaction = Parameters<Extract<Parameters<typeof db.$transaction>[0], (...args: never[]) => unknown>>[0];
