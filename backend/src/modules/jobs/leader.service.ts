import { randomBytes } from "crypto";
import { hostname } from "os";
import { db } from "../../services/db";
import { logger } from "../../config/logger";

/**
 * Une seule instance lance les tâches de fond.
 *
 * Les tâches (relances de webhooks, arrêté du lundi, vigie, refus des commandes
 * sans réponse…) sont lancées dans le processus de l'API, avec un verrou
 * `enCours` qui ne protège qu'une instance. Avec deux instances, chaque tâche
 * tournerait deux fois : doubles alertes, doubles relances.
 *
 * Un bail en base désigne le leader. Il est pris par une écriture conditionnelle
 * (atomique dans PostgreSQL) et renouvelé tant que l'instance vit ; s'il n'est
 * pas renouvelé (processus arrêté, base injoignable), il expire et une autre
 * instance le prend. Redis n'est pas utilisé : il n'est pas persistant en
 * production et ne doit pas devenir la source de vérité d'un verrou.
 *
 * Limite assumée : après l'expiration du bail, l'ancien leader peut encore
 * finir un passage en cours pendant que le nouveau démarre. Les tâches doivent
 * donc rester idempotentes (c'est la règle du dépôt) ; le bail réduit les
 * doublons, il ne les garantit pas impossibles.
 */

const NOM = "taches-de-fond";
export const DUREE_BAIL_MS = Number(process.env.JOBS_LEASE_MS || 30_000);
const RENOUVELLEMENT_MS = Math.max(1000, Math.floor(DUREE_BAIL_MS / 3));

export const identifiantInstance = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;

/** Prend ou renouvelle le bail. `true` si cette instance en est titulaire. */
export async function prendreLeBail(
  proprietaire: string,
  dureeMs = DUREE_BAIL_MS,
  maintenant = new Date()
): Promise<boolean> {
  const expireLe = new Date(maintenant.getTime() + dureeMs);

  // Libre, expiré, ou déjà à nous : une seule instance peut réussir cette écriture.
  const pris = await db.jobLease.updateMany({
    where: { name: NOM, OR: [{ owner: proprietaire }, { expiresAt: { lt: maintenant } }] },
    data: { owner: proprietaire, expiresAt: expireLe },
  });
  if (pris.count === 1) return true;

  try {
    await db.jobLease.create({ data: { name: NOM, owner: proprietaire, expiresAt: expireLe } });
    return true;
  } catch (err: any) {
    // Le bail existe et appartient à une instance vivante.
    if (err?.code === "P2002") return false;
    throw err;
  }
}

/** Rend le bail : une autre instance reprend sans attendre l'expiration. */
export async function rendreLeBail(proprietaire: string) {
  await db.jobLease.updateMany({
    where: { name: NOM, owner: proprietaire },
    data: { expiresAt: new Date(0) },
  });
}

let minuteur: NodeJS.Timeout | null = null;
let estLeader = false;
let dernierRenouvellement = 0;

interface Rappels {
  /** Cette instance devient leader : lancer les tâches. */
  gagne: () => void;
  /** Cette instance cesse de l'être : arrêter les tâches. */
  perdu: () => void;
}

export const Leader = {
  get actif() {
    return estLeader;
  },

  demarrer(rappels: Rappels) {
    if (minuteur) return;

    const passer = async () => {
      let titulaire = false;
      try {
        titulaire = await prendreLeBail(identifiantInstance);
        if (titulaire) dernierRenouvellement = Date.now();
      } catch (err) {
        // Base injoignable : on garde le rôle tant que le bail n'a pas pu expirer
        // côté base, puis on le lâche — une autre instance l'aura reprise.
        titulaire = estLeader && Date.now() - dernierRenouvellement < DUREE_BAIL_MS;
        logger.warn("Bail des tâches de fond non renouvelé", { error: err instanceof Error ? err.message : err });
      }

      if (titulaire && !estLeader) {
        estLeader = true;
        logger.info("Cette instance lance les tâches de fond", { instance: identifiantInstance });
        rappels.gagne();
      } else if (!titulaire && estLeader) {
        estLeader = false;
        logger.warn("Cette instance n'est plus leader : tâches de fond arrêtées", { instance: identifiantInstance });
        rappels.perdu();
      }
    };

    void passer();
    minuteur = setInterval(() => void passer(), RENOUVELLEMENT_MS);
    minuteur.unref?.();
  },

  async arreter() {
    if (minuteur) clearInterval(minuteur);
    minuteur = null;
    if (estLeader) {
      estLeader = false;
      await rendreLeBail(identifiantInstance).catch(() => undefined);
    }
  },
};
