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
    url: process.env.DATABASE_URL,
  },
});
