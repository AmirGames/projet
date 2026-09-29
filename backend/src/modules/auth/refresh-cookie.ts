import { Request, Response } from "express";
import { ApiError } from "../../middleware/errorHandler";
import { originesAutorisees } from "../../config/origines-autorisees";
import { origineCentrale } from "./sso.service";

/**
 * Le jeton de renouvellement du navigateur, en cookie httpOnly.
 *
 * Illisible du JavaScript de la page : une faille XSS ne peut plus l'emporter.
 * Le mobile, lui, garde le sien dans le stockage sécurisé et l'envoie dans le
 * corps ; les deux voies coexistent.
 *
 * Un cookie part tout seul avec la requête : /auth/refresh et /auth/logout,
 * appelés par cette voie, vérifient donc l'origine (CSRF).
 *
 * Le cookie n'est posé que si le client le demande (en-tête
 * `X-Refresh-Transport: cookie`) : sans lui, la réponse garde `refreshToken`
 * dans le corps, comme avant.
 */
export const NOM_COOKIE_REFRESH = "zup_refresh";
const CHEMIN = "/api/auth";
const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;

const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: CHEMIN,
});

export function veutLeCookie(req: Request): boolean {
  return req.get("x-refresh-transport") === "cookie";
}

export function lireCookieRefresh(req: Request): string | undefined {
  for (const morceau of (req.headers.cookie || "").split(";")) {
    const [nom, ...reste] = morceau.trim().split("=");
    if (nom === NOM_COOKIE_REFRESH) return decodeURIComponent(reste.join("="));
  }
  return undefined;
}

/**
 * Livre le refresh au client : dans le cookie s'il l'a demandé (ou `force`, quand
 * il est déjà venu par le cookie) (rend undefined,
 * rien à mettre dans le corps), sinon tel quel pour le corps de la réponse.
 */
export function livrerRefresh(req: Request, res: Response, refreshToken: string, force = false): string | undefined {
  if (!force && !veutLeCookie(req)) return refreshToken;
  res.cookie(NOM_COOKIE_REFRESH, refreshToken, { ...options(), maxAge: TRENTE_JOURS_MS });
  return undefined;
}

export function effacerCookieRefresh(res: Response) {
  res.clearCookie(NOM_COOKIE_REFRESH, options());
}

/** L'origine de la requête doit être un domaine du site : refuse sinon (CSRF). */
export function exigerOrigine(req: Request) {
  let origine = req.get("origin");
  if (!origine) {
    try {
      origine = new URL(req.get("referer") || "").origin;
    } catch {
      origine = undefined;
    }
  }
  const centrale = origineCentrale();
  if (!origine || !(originesAutorisees().includes(origine) || origine === centrale)) {
    throw new ApiError(403, "Origine non autorisée", "CSRF_ORIGINE");
  }
}
