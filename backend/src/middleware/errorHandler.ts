import { Express, Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Les champs, en français.
 *
 * Un message de validation ne nomme pas toujours son champ : « Minimum 6
 * caractères » ne dit pas de quoi. Le nom technique (`password`) serait
 * compréhensible mais laid ; un champ absent de cette table retombe dessus
 * plutôt que de disparaître.
 */
const ETIQUETTES: Record<string, string> = {
  email: "E-mail",
  password: "Mot de passe",
  currentPassword: "Mot de passe actuel",
  newPassword: "Nouveau mot de passe",
  name: "Nom",
  slug: "Nom d'adresse",
  phone: "Téléphone",
  address: "Adresse",
  city: "Ville",
  postalCode: "Code postal",
  price: "Prix",
  quantity: "Quantité",
  code: "Code",
  value: "Valeur",
  rating: "Note",
  comment: "Commentaire",
  radiusKm: "Rayon",
  baseFee: "Frais de livraison",
  minOrder: "Montant minimum",
  customerName: "Nom du client",
  customerEmail: "E-mail du client",
  customerPhone: "Téléphone du client",
  deliveryAddress: "Adresse de livraison",
  deliveryCity: "Ville de livraison",
  totalAmount: "Montant total",
};

/**
 * Pourquoi la requête est refusée, en une phrase lisible.
 *
 * Le refus sortait en « Validation error », et les vraies raisons — pourtant
 * écrites en français dans les schémas — restaient enterrées dans `details`,
 * que les écrans n'affichent pas. L'utilisateur voyait donc un message anglais
 * qui ne lui disait pas quoi corriger.
 */
function raisonDuRefus(err: ZodError): string {
  const raisons = err.issues.map((probleme) => {
    const champ = probleme.path
      .filter((segment) => typeof segment === "string" || typeof segment === "number")
      .join(".");

    if (!champ) return probleme.message;

    const etiquette = ETIQUETTES[champ] || champ;

    // « Email invalide » nomme déjà son champ : le préfixer bégaierait.
    const nommeDeja =
      probleme.message.toLowerCase().includes(etiquette.toLowerCase()) ||
      probleme.message.toLowerCase().includes(champ.toLowerCase());

    return nommeDeja ? probleme.message : `${etiquette} : ${probleme.message}`;
  });

  return [...new Set(raisons)].join(" — ") || "Requête invalide";
}

export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  /**
   * Un refus attendu n'est pas une panne.
   *
   * Tout partait en `ERROR` avec sa pile d'appels : une session à refaire, une
   * TVA mal saisie, une page demandée qui n'existe pas remplissaient le journal
   * du même bruit que les vraies pannes — au point qu'on ne distingue plus ce
   * qui appelle une intervention de ce qui est le fonctionnement normal.
   *
   * Un 4xx est donc un avertissement, sans pile. Une pile ne dit rien d'utile
   * sur une saisie refusée : elle pointe la ligne qui a refusé, qu'on connaît
   * déjà par le message.
   */
  /**
   * Un corps JSON mal formé est du même ordre : c'est l'appelant qui a mal
   * écrit sa requête, pas le serveur qui a cassé. `body-parser` le signale avec
   * un `status` de 400 ; sans le lire, on répondait 500 et on journalisait une
   * pile d'appels pour une virgule en trop.
   */
  const statutPorte = (err as { status?: number; statusCode?: number }).status;

  const statut =
    err instanceof ApiError
      ? err.statusCode
      : err instanceof ZodError
        ? 400
        : err instanceof SyntaxError && typeof statutPorte === "number"
          ? statutPorte
          : 500;

  const attendu = statut < 500;

  const contexte = {
    name: err.name,
    message: err.message,
    path: req.path,
    method: req.method,
    ...(attendu ? {} : { stack: err.stack }),
  };

  if (attendu) {
    logger.warn("Requête refusée", contexte);
  } else {
    logger.error("Error caught", contexte);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: raisonDuRefus(err),
      details: err.flatten(),
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  if (err instanceof SyntaxError && attendu) {
    return res.status(statut).json({
      error: "Corps de requête illisible : ce n'est pas du JSON valide.",
      code: "INVALID_JSON",
    });
  }

  // Fallback error
  return res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

export const setupErrorHandling = (app: Express) => {
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: "Not found",
      path: req.path,
    });
  });

  // Global error handler (must be last)
  app.use(errorHandler);
};
