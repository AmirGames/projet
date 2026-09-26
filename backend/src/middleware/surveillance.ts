import { Request, Response, NextFunction } from "express";
import { Surveillance } from "../services/surveillance.service";

/**
 * Un chemin ramené à sa forme générique.
 *
 * `/api/orders/cmf3k…/status` et `/api/orders/cmf9x…/status` sont la même
 * route : sans cela, chaque commande ouvrirait sa propre ligne et la table
 * des routes ne dirait plus rien. On ne lit pas `req.route` : quand une erreur
 * sort d'un routeur, Express a déjà effacé son préfixe, et la même route se
 * retrouverait sous deux noms selon qu'elle a réussi ou non.
 */
export function routeGenerique(chemin: string): string {
  const segments = chemin
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .slice(0, 8)
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":n";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ":id";
      if (segment.includes("@")) return ":email";
      // Identifiants générés (cuid, jetons) : longs, lettres et chiffres mêlés.
      if (segment.length >= 16 && /\d/.test(segment) && /[a-z]/i.test(segment)) return ":id";
      return segment;
    });

  // Les fichiers déposés ne sont qu'une seule et même route.
  if (segments[0] === "uploads") return "/uploads/*";

  return "/" + segments.join("/");
}

/** Chaque requête terminée alimente la surveillance : volume, statut, durée. */
export function mesurerRequetes(req: Request, res: Response, next: NextFunction) {
  const depart = process.hrtime.bigint();

  res.on("finish", () => {
    const dureeMs = Number(process.hrtime.bigint() - depart) / 1e6;
    // Une page introuvable ne mérite pas sa propre ligne : un balayage d'URL
    // inventées en ouvrirait des centaines.
    const route =
      res.statusCode === 404 && !req.route
        ? `${req.method} (introuvable)`
        : `${req.method} ${routeGenerique(req.originalUrl || req.url)}`;

    Surveillance.requete(route, res.statusCode, dureeMs);
  });

  next();
}
