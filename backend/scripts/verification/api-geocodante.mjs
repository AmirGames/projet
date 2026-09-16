import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ouvrirFauxServiceAdresses } from "./faux-service-adresses.mjs";

/**
 * Une API branchée sur le faux service d'adresses.
 *
 * Situer une adresse passe par un fournisseur qui est sur Internet. Une
 * vérification qui l'appelle vraiment ne dit plus rien de la plateforme : elle
 * échoue dès que le réseau manque, et passe pour une régression. Les suites qui
 * ont besoin d'un géocodage démarrent donc leur propre API, pointée sur le faux
 * service — la base, elle, reste la même, et les jetons déjà obtenus y sont
 * valables.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function ouvrirApiGeocodante({ port = 4611, portAdresses = 4601 } = {}) {
  const faux = await ouvrirFauxServiceAdresses(portAdresses);
  const base = `http://127.0.0.1:${port}`;

  const enfant = spawn(
    process.execPath,
    [join(RACINE, "node_modules", ".bin", "tsx"), join(RACINE, "src", "server.ts")],
    {
      cwd: RACINE,
      env: {
        ...process.env,
        PORT: String(port),
        ADDRESS_PROVIDER: "ban",
        ADDRESS_API_URL: faux.urlBan,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  // Sans consommer la sortie, le tampon se remplit et le processus se bloque.
  enfant.stdout.on("data", () => undefined);
  enfant.stderr.on("data", () => undefined);

  const limite = Date.now() + 40000;
  let prete = false;

  while (Date.now() < limite && !prete) {
    try {
      prete = (await fetch(`${base}/health`)).ok;
    } catch {
      // Pas encore prête.
    }

    if (!prete) await new Promise((r) => setTimeout(r, 500));
  }

  if (!prete) {
    enfant.kill();
    await faux.fermer();
    throw new Error(`API géocodante injoignable sur le port ${port}`);
  }

  const requete =
    (methode) =>
    (chemin, corps, jeton) =>
      fetch(base + chemin, {
        method: methode,
        headers: {
          "Content-Type": "application/json",
          ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
        },
        ...(corps ? { body: JSON.stringify(corps) } : {}),
      });

  return {
    base,
    /** Le faux fournisseur, pour simuler sa panne. */
    adresses: faux,
    post: requete("POST"),
    patch: requete("PATCH"),
    put: requete("PUT"),
    get: (chemin, jeton) =>
      fetch(base + chemin, { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} }),

    async fermer() {
      enfant.kill();
      await faux.fermer();
    },
  };
}
