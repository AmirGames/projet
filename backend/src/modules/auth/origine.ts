import { AsyncLocalStorage } from "node:async_hooks";
import { Request, Response, NextFunction } from "express";

/**
 * D'où vient la requête en cours.
 *
 * Les deux journaux — actions administratives et événements de sécurité —
 * affichaient une adresse IP et un navigateur vides : la table d'audit ne
 * gardait rien, et les événements de sécurité n'étaient renseignés qu'aux
 * endroits où quelqu'un avait pensé à passer `req.ip`. Une section
 * « Informations réseau » vide ne sert à rien : elle ne dit ni qui, ni d'où.
 *
 * Plutôt que de faire descendre la requête jusque dans chaque service — une
 * trentaine de points d'écriture, dont le prochain aurait été oublié — on la
 * dépose ici pour la durée du traitement. Les journaux la lisent au moment
 * d'écrire, sans que l'appelant ait à y penser.
 */

export interface Origine {
  ipAddress?: string;
  userAgent?: string;
  /** L'instant où la requête est arrivée, pour mesurer sa durée. */
  debutA?: number;
}

const contexte = new AsyncLocalStorage<Origine>();

/** L'origine de la requête en cours, vide hors requête (tâche de fond, script). */
export function origineActuelle(): Origine {
  return contexte.getStore() || {};
}

/**
 * Le temps écoulé depuis l'arrivée de la requête, en millisecondes.
 *
 * Le journal des accès affichait une colonne « durée » toujours à zéro : elle
 * n'était mesurée nulle part. Rend `undefined` hors requête, pour ne pas
 * inventer un zéro qui ressemble à une mesure.
 */
export function dureeDeLaRequete(): number | undefined {
  const debut = contexte.getStore()?.debutA;
  return debut === undefined ? undefined : Date.now() - debut;
}

/**
 * Nettoie l'adresse rendue par Express.
 *
 * Derrière un proxy, `req.ip` peut arriver sous la forme `::ffff:82.64.1.2` :
 * lisible par une machine, pas par un humain qui relit un journal.
 */
function adresseLisible(brute: string | undefined): string | undefined {
  if (!brute) return undefined;

  const sansPrefixe = brute.startsWith("::ffff:") ? brute.slice(7) : brute;

  // L'accès local prend les deux formes selon la pile réseau : une seule suffit.
  if (sansPrefixe === "::1" || sansPrefixe === "127.0.0.1") return "127.0.0.1";

  return sansPrefixe;
}

export function middlewareOrigine(req: Request, _res: Response, next: NextFunction) {
  const origine: Origine = {
    debutA: Date.now(),
    ipAddress: adresseLisible(req.ip),
    // Tronqué : certains agents dépassent les deux cents caractères, sans rien
    // apprendre de plus à qui relit.
    userAgent: (req.headers["user-agent"] || "").toString().slice(0, 200) || undefined,
  };

  contexte.run(origine, () => next());
}
