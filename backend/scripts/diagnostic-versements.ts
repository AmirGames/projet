import { db } from "../src/services/db";
import { diagnostiquerVersements } from "../src/modules/payouts/payout-diagnostic.service";

try {
  const resultat = await diagnostiquerVersements();
  console.log(JSON.stringify(resultat, null, 2));
  if (resultat.ecarts.length) process.exitCode = 2;
} catch {
  // Les erreurs Prisma peuvent porter les arguments et des données personnelles.
  console.error(
    "Diagnostic impossible : vérifier accès PostgreSQL, migrations et trousseau de chiffrement.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
