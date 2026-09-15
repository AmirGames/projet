/**
 * Vide la base de vérification.
 *
 * Les scripts partent tous du même postulat : le premier compte inscrit
 * devient la plateforme. Sans remise à zéro, la deuxième exécution échoue
 * partout avec des « Accès refusé » qui ressemblent à des régressions et n'en
 * sont pas.
 *
 * Passe par Prisma plutôt que par psql, pour fonctionner à l'identique sous
 * Windows, macOS et Linux.
 */

import { PrismaClient } from "@prisma/client";

/**
 * Garde-fou : effacer une base de développement par inadvertance coûterait
 * bien plus cher que la gêne de cette vérification.
 */
export function baseDeTest(url = process.env.DATABASE_URL || "") {
  if (process.env.VERIF_AUTORISER_RESET === "oui") return true;

  // On ne regarde que le nom de la base, pas l'URL entière : un mot de passe
  // ou un hôte contenant « test » ne doit pas suffire à donner le feu vert.
  const nom = (url.split("?")[0].split("/").pop() || "").toLowerCase();
  return nom.includes("test");
}

export async function reinitialiser() {
  const url = process.env.DATABASE_URL || "";

  if (!baseDeTest(url)) {
    const nom = url.split("?")[0].split("/").pop() || "(inconnue)";
    throw new Error(
      `Refus de vider « ${nom} » : le nom de la base ne contient pas « test ».\n` +
        `Visez une base dédiée, ou forcez avec VERIF_AUTORISER_RESET=oui si c'est bien voulu.`
    );
  }

  const prisma = new PrismaClient();

  try {
    const tables = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;

    if (tables.length === 0) return 0;

    const liste = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE ${liste} RESTART IDENTITY CASCADE`);

    return tables.length;
  } finally {
    await prisma.$disconnect();
  }
}

// Utilisable seul : node scripts/verification/reinitialiser.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const nombre = await reinitialiser();
  console.log(`${nombre} tables vidées.`);
}
