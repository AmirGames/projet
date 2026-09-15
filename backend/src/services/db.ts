import { PrismaClient } from "@prisma/client";

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

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = global as unknown as { prisma: PrismaClientSingleton };

export const db = globalForPrisma.prisma || prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
