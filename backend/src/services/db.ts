import { PrismaClient } from "@prisma/client";

import { origineActuelle } from "../config/origine";

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

      const completer = (ligne: any) => {
        if (!ligne || typeof ligne !== "object") return ligne;
        if (ligne.ipAddress === undefined && origine.ipAddress) ligne.ipAddress = origine.ipAddress;
        if (ligne.userAgent === undefined && origine.userAgent) ligne.userAgent = origine.userAgent;
        return ligne;
      };

      if (Array.isArray(lignes)) lignes.forEach(completer);
      else completer(lignes);
    }

    return next(params);
  });

  return client;
}

type PrismaClientBrut = ReturnType<typeof prismaClientSingleton>;
type PrismaClientSingleton = PrismaClientBrut;

const globalForPrisma = global as unknown as { prisma: PrismaClientSingleton };

export const db = globalForPrisma.prisma || garderLOrigine(prismaClientSingleton());

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
