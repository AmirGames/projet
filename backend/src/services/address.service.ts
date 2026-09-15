import { logger } from "../config/logger";

/**
 * Recherche d'adresses, avec deux fournisseurs interchangeables.
 *
 *   ban    — Base Adresse Nationale, la base officielle française. La plus
 *            précise et la plus complète sur la France, mais elle s'arrête
 *            aux frontières : une adresse belge ne renvoie rien.
 *   photon — OpenStreetMap, couverture mondiale, sans clé d'API. Moins fin
 *            que la BAN sur la France, mais il répond partout.
 *
 * Le choix se fait par ADDRESS_PROVIDER. Tant que vous ne servez que la
 * France, « ban » donne de meilleures adresses ; dès que vous ouvrez un autre
 * pays, « photon » devient nécessaire.
 */

export interface Suggestion {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

export type Fournisseur = "ban" | "photon";

const DELAI_MS = 4000;

/** Une même saisie revient souvent : frappe, correction, retour arrière. */
const cache = new Map<string, { expireA: number; resultats: Suggestion[] }>();
const DUREE_CACHE_MS = 5 * 60 * 1000;

/** Sans purge, la table grandit indéfiniment au fil des recherches. */
const TAILLE_MAX_CACHE = 500;

export function fournisseurActif(): Fournisseur {
  return process.env.ADDRESS_PROVIDER === "photon" ? "photon" : "ban";
}

/**
 * Pays auxquels limiter la recherche, en codes ISO à deux lettres.
 * Vide signifie « partout ». N'a d'effet que sur Photon : la BAN ne connaît
 * que la France.
 */
function paysAutorises(): string[] {
  return (process.env.ADDRESS_COUNTRIES || "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
}

function normaliserBan(entite: any): Suggestion {
  const p = entite?.properties || {};
  const coords = entite?.geometry?.coordinates || [];

  return {
    label: p.label || "",
    // « name » porte le numéro et la voie ; à défaut on retombe sur le libellé.
    street: p.name || p.label || "",
    city: p.city || "",
    postalCode: p.postcode || "",
    country: "France",
    longitude: typeof coords[0] === "number" ? coords[0] : null,
    latitude: typeof coords[1] === "number" ? coords[1] : null,
  };
}

function normaliserPhoton(entite: any): Suggestion {
  const p = entite?.properties || {};
  const coords = entite?.geometry?.coordinates || [];

  // Photon sépare le numéro du nom de voie, et n'a pas de libellé tout fait.
  const voie = [p.housenumber, p.street || p.name].filter(Boolean).join(" ");
  const ville = p.city || p.town || p.village || p.county || "";

  return {
    label: [voie, p.postcode, ville, p.country].filter(Boolean).join(", "),
    street: voie || p.name || "",
    city: ville,
    postalCode: p.postcode || "",
    country: p.country || "",
    longitude: typeof coords[0] === "number" ? coords[0] : null,
    latitude: typeof coords[1] === "number" ? coords[1] : null,
  };
}

function construireUrl(requete: string, limite: number): string {
  if (fournisseurActif() === "photon") {
    // Photon n'a pas de filtre par pays : le tri se fait sur la réponse.
    const base = process.env.PHOTON_API_URL || "https://photon.komoot.io/api/";
    return `${base}?q=${encodeURIComponent(requete)}&limit=${limite}&lang=fr`;
  }

  const base = process.env.ADDRESS_API_URL || "https://api-adresse.data.gouv.fr/search/";
  return `${base}?q=${encodeURIComponent(requete)}&limit=${limite}`;
}

/** Codes ISO des pays, tels que Photon les renvoie dans « countrycode ». */
function dansLePerimetre(entite: any): boolean {
  const pays = paysAutorises();
  if (pays.length === 0) return true;

  const code = (entite?.properties?.countrycode || "").toLowerCase();
  return pays.includes(code);
}

export class AddressService {
  /**
   * Suggestions pour une saisie.
   *
   * Ne lève jamais : le service d'adresses est un confort, pas une
   * dépendance. En cas de panne, `available: false` laisse la saisie
   * manuelle prendre le relais.
   */
  static async rechercher(requete: string, limite: number) {
    // En dessous de trois caractères, tous les fournisseurs renvoient du bruit.
    if (requete.length < 3) {
      return { suggestions: [] as Suggestion[], available: true };
    }

    const fournisseur = fournisseurActif();
    const cle = `${fournisseur}|${requete.toLowerCase()}|${limite}`;
    const enCache = cache.get(cle);

    if (enCache && Date.now() < enCache.expireA) {
      return { suggestions: enCache.resultats, available: true };
    }

    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);

    try {
      // Photon ignore le périmètre demandé : on élargit la requête pour avoir
      // de quoi filtrer sans se retrouver les mains vides.
      const demandees = fournisseur === "photon" && paysAutorises().length > 0 ? limite * 4 : limite;

      const reponse = await fetch(construireUrl(requete, demandees), {
        signal: controleur.signal,
        headers: { "User-Agent": "Zupone/1.0" },
      });

      if (!reponse.ok) {
        throw new Error(`Réponse ${reponse.status}`);
      }

      const donnees: any = await reponse.json();
      const entites: any[] = donnees.features || [];

      const suggestions = entites
        .filter((entite) => fournisseur === "ban" || dansLePerimetre(entite))
        .map(fournisseur === "ban" ? normaliserBan : normaliserPhoton)
        .filter((s: Suggestion) => s.label)
        .slice(0, limite);

      if (cache.size > TAILLE_MAX_CACHE) cache.clear();
      cache.set(cle, { expireA: Date.now() + DUREE_CACHE_MS, resultats: suggestions });

      return { suggestions, available: true };
    } catch (err) {
      logger.warn("Service d'adresses injoignable", {
        fournisseur,
        error: err instanceof Error ? err.message : err,
      });

      return { suggestions: [] as Suggestion[], available: false };
    } finally {
      clearTimeout(minuteur);
    }
  }

  /** Vide le cache : utile après un changement de fournisseur. */
  static viderCache() {
    cache.clear();
  }
}
