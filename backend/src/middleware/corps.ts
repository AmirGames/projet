import express, { type RequestHandler } from "express";

/** Plafond des corps JSON / urlencoded sur toute l'API. */
const LIMITE_CORPS = "200kb";

/**
 * Les lecteurs de corps de l'API. Aucune route ordinaire n'a besoin de plus
 * (les fichiers passent en multipart, pas en base64 dans le JSON) ; une route
 * qui en aurait besoin monte son propre parser plus large, avant celui-ci.
 */
export const lecteursDeCorps: RequestHandler[] = [
  express.json({ limit: LIMITE_CORPS }),
  express.urlencoded({ limit: LIMITE_CORPS, extended: true }),
];
