import { Router, Request, Response } from "express";
import { logger } from "../config/logger";

const router = Router();

/**
 * Relais vers l'API Adresse de l'État (adresse.data.gouv.fr).
 *
 * Passer par le serveur plutôt que d'appeler l'API depuis le navigateur évite
 * les restrictions CORS, permet de changer de fournisseur sans toucher aux
 * pages, et garde la main sur le rythme des appels.
 */

const BASE = process.env.ADDRESS_API_URL || "https://api-adresse.data.gouv.fr/search/";
const DELAI_MS = 4000;

// Une même saisie revient souvent (frappe, correction, retour arrière).
const cache = new Map<string, { expireA: number; resultats: unknown[] }>();
const DUREE_CACHE_MS = 5 * 60 * 1000;

interface Suggestion {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

function normaliser(entite: any): Suggestion {
  const p = entite?.properties || {};
  const coords = entite?.geometry?.coordinates || [];

  return {
    label: p.label || "",
    // « name » porte le numéro et la voie ; à défaut on retombe sur le libellé.
    street: p.name || p.label || "",
    city: p.city || "",
    postalCode: p.postcode || "",
    longitude: typeof coords[0] === "number" ? coords[0] : null,
    latitude: typeof coords[1] === "number" ? coords[1] : null,
  };
}

// GET /addresses/search?q=... - Suggestions d'adresses
router.get("/search", async (req: Request, res: Response) => {
  try {
    const requete = ((req.query.q as string) || "").trim();
    const limite = Math.min(parseInt((req.query.limit as string) || "5") || 5, 10);

    // En dessous de trois caractères, l'API renvoie du bruit.
    if (requete.length < 3) {
      res.json({ suggestions: [], available: true });
      return;
    }

    const cle = `${requete.toLowerCase()}|${limite}`;
    const enCache = cache.get(cle);

    if (enCache && Date.now() < enCache.expireA) {
      res.json({ suggestions: enCache.resultats, available: true });
      return;
    }

    const url = `${BASE}?q=${encodeURIComponent(requete)}&limit=${limite}`;
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);

    try {
      const reponse = await fetch(url, { signal: controleur.signal });

      if (!reponse.ok) {
        throw new Error(`Réponse ${reponse.status}`);
      }

      const donnees: any = await reponse.json();
      const suggestions = (donnees.features || []).map(normaliser).filter((s: Suggestion) => s.label);

      cache.set(cle, { expireA: Date.now() + DUREE_CACHE_MS, resultats: suggestions });

      res.json({ suggestions, available: true });
    } finally {
      clearTimeout(minuteur);
    }
  } catch (err) {
    // Le service d'adresses est un confort, pas une dépendance : s'il est
    // injoignable, la saisie manuelle doit continuer de fonctionner.
    logger.warn("Service d'adresses injoignable", {
      error: err instanceof Error ? err.message : err,
    });

    res.json({ suggestions: [], available: false });
  }
});

export default router;
