import type { Server } from "http";

export interface DependancesArret {
  serveur: Pick<Server, "close" | "closeIdleConnections" | "closeAllConnections">;
  /** Ferme les connexions temps réel (elles retiendraient le serveur ouvert indéfiniment). */
  fermerTempsReel?: () => Promise<unknown> | unknown;
  arreterLesTaches: () => void;
  arreterLeader: () => Promise<unknown>;
  deconnecterBase: () => Promise<unknown>;
  journal: { info: (message: string, meta?: object) => void; warn: (message: string, meta?: object) => void };
  /** Délai maximal d'attente des requêtes en cours. */
  delaiMaxMs?: number;
}

/**
 * Arrêt propre : on cesse d'accepter, on laisse finir les requêtes en cours
 * (un paiement, un webhook Stripe), puis seulement on rend le bail de leader
 * et on coupe la base. Passé le délai, les connexions restantes sont fermées.
 *
 * Avant, la base était déconnectée et le processus quittait sans attendre :
 * une requête en cours à l'instant du déploiement était coupée en plein
 * traitement.
 */
export async function arretGracieux(deps: DependancesArret) {
  const delaiMs = deps.delaiMaxMs ?? 25_000;

  // Plus de nouvelles requêtes ; la promesse se résout quand les dernières ont fini.
  const serveurFerme = new Promise<void>((resolve) => deps.serveur.close(() => resolve()));
  deps.serveur.closeIdleConnections();

  // Les tâches de fond s'arrêtent : elles ne prennent plus de nouveau passage.
  deps.arreterLesTaches();

  if (deps.fermerTempsReel) {
    try {
      await deps.fermerTempsReel();
    } catch (err) {
      deps.journal.warn("Fermeture du temps réel incomplète", { error: err instanceof Error ? err.message : err });
    }
  }

  let delaiDepasse = false;
  let minuteur: NodeJS.Timeout | undefined;
  await Promise.race([
    serveurFerme,
    new Promise<void>((resolve) => {
      minuteur = setTimeout(() => {
        delaiDepasse = true;
        resolve();
      }, delaiMs);
    }),
  ]);
  if (minuteur) clearTimeout(minuteur);

  if (delaiDepasse) {
    deps.journal.warn("Requêtes encore en cours après le délai d'arrêt : connexions fermées", { delaiMs });
    deps.serveur.closeAllConnections();
  } else {
    deps.journal.info("Requêtes en cours terminées");
  }

  // Après les requêtes : un autre nœud reprend les tâches, la base se ferme.
  await deps.arreterLeader();
  await deps.deconnecterBase();
  deps.journal.info("Arrêt terminé");
  return { delaiDepasse };
}
