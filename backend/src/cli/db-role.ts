import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getEnv } from "../config/env";

/** Sonde strictement en lecture seule : aucun DDL ni changement de session. */
async function main() {
  const env = getEnv();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  try {
    const [role] = await db.$queryRaw<Array<{
      current_user: string;
      session_user: string;
      database_name: string;
      schema_name: string;
      can_create_schema: boolean;
      can_select_migrations: boolean;
    }>>`SELECT current_user, session_user, current_database() AS database_name,
        current_schema() AS schema_name,
        has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create_schema,
        COALESCE(has_table_privilege(current_user, to_regclass('public."_prisma_migrations"'), 'SELECT'), false) AS can_select_migrations`;
    const expected = process.env.DATABASE_URL_APP
      ? decodeURIComponent(new URL(process.env.DATABASE_URL_APP).username)
      : undefined;
    const result = {
      role: role.current_user,
      sessionRole: role.session_user,
      database: role.database_name,
      schema: role.schema_name,
      canCreateSchema: role.can_create_schema,
      canReadMigrationHistory: role.can_select_migrations,
      expectedApplicationRoleMatches: expected ? expected === role.current_user : null,
    };
    console.log(JSON.stringify(result, null, 2));
    if (env.NODE_ENV === "production" && (role.can_create_schema || result.expectedApplicationRoleMatches === false)) {
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("Sonde de rôle SQL impossible; aucune modification SQL n'a été effectuée.", error instanceof Error ? error.message : "Erreur inconnue");
  process.exitCode = 1;
});
