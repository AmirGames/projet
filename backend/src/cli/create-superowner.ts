import "dotenv/config";

import {
  ConfigurationSuperownerInvalide,
  creerSuperownerInitial,
  parametresDeLEnvironnement,
} from "../modules/auth/superowner-initial.service";
import { db } from "../services/db";

/**
 * Crée le superowner de la plateforme (voir superowner-initial.service.ts).
 *
 *   npm run create-superowner                 développement (tsx)
 *   node dist/create-superowner.js            image de production
 *
 * `--si-configure` : ne fait rien, sans erreur, quand SUPEROWNER_EMAIL est
 * absent. C'est ainsi que le conteneur l'appelle à chaque démarrage.
 */
async function principal(): Promise<number> {
  const parametres = parametresDeLEnvironnement();

  if (!parametres.email && process.argv.includes("--si-configure")) {
    return 0;
  }

  try {
    const resultat = await creerSuperownerInitial(parametres);
    const messages = {
      cree: `Superowner créé : ${resultat.email}`,
      promu: `Compte existant promu superowner : ${resultat.email}`,
      existant: `Un superowner existe déjà (${resultat.email}) : rien n'a changé.`,
    };
    console.log(messages[resultat.statut]);
    return 0;
  } catch (err) {
    if (err instanceof ConfigurationSuperownerInvalide) {
      console.error(err.message);
      return 1;
    }
    throw err;
  } finally {
    await db.$disconnect();
  }
}

principal().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
