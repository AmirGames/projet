import "dotenv/config";
import { db } from "../services/db";
import { recoverMfaOperator } from "../modules/auth/mfa-operator.service";
import { loadEnv } from "../config/env";

loadEnv();
try {
  const [command, userId, ticket, verifier, approver] = process.argv.slice(2);
  if (command === "inventory") {
    const users = await db.user.findMany({ where: { OR: [{ isSuperOwner: true }, { isSystemAdmin: true }] },
      select: { id: true, status: true, isSuperOwner: true, accesEquipe: { select: { plateforme: true, role: true } },
        mfaFactor: { select: { enabled: true, version: true } } } });
    console.log(JSON.stringify(users, null, 2));
  } else if (command === "recover" && process.argv.length === 7) {
    await recoverMfaOperator({ userId, ticket, verifier, approver });
    console.log("Récupération auditée ; sessions fermées ; nouvel enrôlement requis.");
  } else {
    throw new Error("Usage : mfa-operator inventory | recover <userId> <ticket> <vérificateur> <approbateur distinct>");
  }
} catch {
  console.error("Commande MFA refusée ou indisponible. Vérifier les paramètres et la connexion, sans journaliser de secrets.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
