import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Pas env() : il échoue sans la variable, alors que `prisma generate`
    // (build, image Docker) n'a pas besoin de la base.
    // En production les migrations doivent utiliser le rôle propriétaire,
    // explicitement fourni. Aucun repli sur les identifiants applicatifs.
    url: process.env.NODE_ENV === "production"
      ? process.env.DATABASE_URL_MIGRATION
      : process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL,
  },
});
