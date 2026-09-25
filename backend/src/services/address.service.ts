import { logger } from "../config/logger";

/**
 * Recherche d'adresses, avec des fournisseurs interchangeables.
 *
 *   ban    — Base Adresse Nationale, la base officielle française. La plus
 *            précise et la plus complète sur la France, mais elle s'arrête
 *            aux frontières : une adresse belge ne renvoie rien.
 *   photon — OpenStreetMap, couverture mondiale, sans clé d'API. Moins fin
 *            que la BAN sur la France, mais il répond partout.
 *   google — Places API (New). La meilleure pertinence sur une saisie
 *            approximative, et la couverture la plus large. **Payant**, et
 *            exige une clé : sans `GOOGLE_MAPS_API_KEY`, le fournisseur se
 *            déclare injoignable plutôt que d'échouer silencieusement.
 *
 * Le choix se fait par ADDRESS_PROVIDER. Les deux premiers sont gratuits et
 * suffisent à la France et à la Belgique ; Google se justifie quand la
 * pertinence de la saisie prime sur le coût.
 *
 * **La clé ne quitte jamais le serveur.** Google documente un usage depuis le
 * navigateur, avec une clé restreinte par référent ; ici la requête part de
 * l'API, si bien que la clé n'apparaît dans aucune page et se restreint par
 * adresse IP — bien plus étanche.
 */

export interface Suggestion {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  /** Code ISO du pays en minuscules (« fr », « be »), vide si inconnu. */
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Où se trouve, vraisemblablement, la personne qui tape.
 *
 * Le navigateur le devine (fuseau horaire, langue, position si elle est déjà
 * autorisée) : c'est ce qui permet à un client belge de voir des adresses
 * belges d'abord, au lieu d'avoir à taper sa ville pour sortir de la France.
 * Ce n'est qu'une préférence d'ordre, jamais un filtre.
 */
export interface Indice {
  pays?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Un point au cœur de chaque pays, pour orienter Photon quand on connaît le
 * pays sans connaître la position.
 */
const CENTRES: Record<string, { latitude: number; longitude: number }> = {
  fr: { latitude: 46.6, longitude: 2.4 },
  be: { latitude: 50.64, longitude: 4.67 },
  lu: { latitude: 49.78, longitude: 6.09 },
  ch: { latitude: 46.8, longitude: 8.23 },
  mc: { latitude: 43.74, longitude: 7.42 },
};

export type Fournisseur = "ban" | "photon" | "ban+photon" | "google";

const DELAI_MS = 4000;

/** Une même saisie revient souvent : frappe, correction, retour arrière. */
const cache = new Map<string, { expireA: number; resultats: Suggestion[] }>();
const DUREE_CACHE_MS = 5 * 60 * 1000;

/** Sans purge, la table grandit indéfiniment au fil des recherches. */
const TAILLE_MAX_CACHE = 500;

/**
 * Le fournisseur d'adresses.
 *
 * - `ban` : la Base Adresse Nationale, la plus précise — mais **elle ne connaît
 *   que la France** ;
 * - `photon` : OpenStreetMap, le monde entier, moins fin sur les adresses
 *   françaises ;
 * - `ban+photon` : la BAN pour la France, Photon pour les autres pays. C'est ce
 *   qu'il faut dès qu'un pays voisin s'ajoute — la Belgique, par exemple —
 *   sans rien perdre de la qualité française.
 */
export function fournisseurActif(): Fournisseur {
  const choisi = (process.env.ADDRESS_PROVIDER || "").trim().toLowerCase();

  if (choisi === "photon") return "photon";
  if (choisi === "ban+photon" || choisi === "mixte") return "ban+photon";
  if (choisi === "google") return "google";

  return "ban";
}

/**
 * Pays auxquels limiter la recherche, en codes ISO à deux lettres.
 * Vide signifie « partout ». N'a d'effet que sur Photon : la BAN ne connaît
 * que la France, qu'elle rend donc toujours.
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
    countryCode: "fr",
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
    countryCode: (p.countrycode || "").toLowerCase(),
    longitude: typeof coords[0] === "number" ? coords[0] : null,
    latitude: typeof coords[1] === "number" ? coords[1] : null,
  };
}

/**
 * Une adresse Google, ramenée à la forme commune.
 *
 * Places (New) rend l'adresse découpée en « composants » typés plutôt qu'en
 * champs nommés : le numéro et la voie arrivent séparés, comme chez Photon.
 */
function normaliserGoogle(lieu: any): Suggestion {
  const composants: any[] = lieu?.addressComponents || [];

  const trouver = (type: string) => composants.find((c) => (c?.types || []).includes(type));
  const composant = (type: string) => trouver(type)?.longText || "";

  const numero = composant("street_number");
  const voie = composant("route");
  const ville = composant("locality") || composant("postal_town") || composant("administrative_area_level_2");

  return {
    label: lieu?.formattedAddress || "",
    street: [numero, voie].filter(Boolean).join(" ") || lieu?.displayName?.text || "",
    city: ville,
    postalCode: composant("postal_code"),
    country: composant("country"),
    countryCode: (trouver("country")?.shortText || "").toLowerCase(),
    latitude: typeof lieu?.location?.latitude === "number" ? lieu.location.latitude : null,
    longitude: typeof lieu?.location?.longitude === "number" ? lieu.location.longitude : null,
  };
}

/** Le point vers lequel orienter la recherche : la position, sinon le pays. */
function pointDeReference(indice: Indice): { latitude: number; longitude: number } | null {
  if (typeof indice.latitude === "number" && typeof indice.longitude === "number") {
    return { latitude: indice.latitude, longitude: indice.longitude };
  }

  return (indice.pays && CENTRES[indice.pays]) || null;
}

function construireUrl(
  requete: string,
  limite: number,
  fournisseur: "ban" | "photon",
  indice: Indice = {}
): string {
  const point = pointDeReference(indice);

  if (fournisseur === "photon") {
    // Photon n'a pas de filtre par pays : le tri se fait sur la réponse. Il
    // sait en revanche favoriser les résultats proches d'un point.
    const base = process.env.PHOTON_API_URL || "https://photon.komoot.io/api/";
    const biais = point ? `&lat=${point.latitude}&lon=${point.longitude}` : "";
    return `${base}?q=${encodeURIComponent(requete)}&limit=${limite}&lang=fr${biais}`;
  }

  // La BAN ne prend une position qu'en guise de priorité, et seulement une
  // vraie : le centre d'un pays ne lui apprendrait rien.
  const base = process.env.ADDRESS_API_URL || "https://api-adresse.data.gouv.fr/search/";
  const biais =
    typeof indice.latitude === "number" && typeof indice.longitude === "number"
      ? `&lat=${indice.latitude}&lon=${indice.longitude}`
      : "";
  return `${base}?q=${encodeURIComponent(requete)}&limit=${limite}${biais}`;
}

/**
 * Nettoie l'indice venu du navigateur : un pays hors du périmètre ou une
 * position fantaisiste sont ignorés plutôt que refusés.
 */
export function indiceValide(brut: { pays?: unknown; latitude?: unknown; longitude?: unknown }): Indice {
  const indice: Indice = {};

  const pays = typeof brut.pays === "string" ? brut.pays.trim().toLowerCase() : "";
  const autorises = paysAutorises();
  if (/^[a-z]{2}$/.test(pays) && (autorises.length === 0 || autorises.includes(pays))) {
    indice.pays = pays;
  }

  const latitude = Number(brut.latitude);
  const longitude = Number(brut.longitude);
  if (
    brut.latitude !== undefined &&
    brut.longitude !== undefined &&
    brut.latitude !== "" &&
    brut.longitude !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    // Deux décimales, soit un bon kilomètre : assez pour orienter, pas assez
    // pour pister, et le cache reste utile d'une frappe à l'autre.
    indice.latitude = Math.round(latitude * 100) / 100;
    indice.longitude = Math.round(longitude * 100) / 100;
  }

  return indice;
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
  /**
   * Interroge un fournisseur. Rend une liste vide plutôt que de lever : en mode
   * mixte, la panne de l'un ne doit pas emporter les résultats de l'autre.
   */
  /**
   * Google Places (New) : une requête POST, une clé en en-tête, un masque de
   * champs obligatoire.
   *
   * On appelle `places:searchText` et non `places:autocomplete`, bien que ce
   * dernier porte le nom d'« autocomplétion » : la complétion ne rend que des
   * libellés et des identifiants, sans coordonnées. Il faudrait un second
   * appel « Place Details » à chaque adresse retenue — deux fois plus d'appels
   * facturés, et un aller-retour de plus pour l'écran — là où `searchText`
   * rend en une fois ce que les deux autres fournisseurs rendent déjà :
   * libellé, voie, ville, code postal, pays et coordonnées.
   *
   * Le masque de champs n'est pas un détail : sans lui l'API refuse la
   * requête, et demander plus de champs que nécessaire se facture plus cher.
   */
  private static async interrogerGoogle(
    requete: string,
    limite: number,
    indice: Indice = {}
  ): Promise<{ suggestions: Suggestion[]; joignable: boolean }> {
    const cle = (process.env.GOOGLE_MAPS_API_KEY || "").trim();

    if (!cle) {
      // Sans clé, mieux vaut le dire que rendre une liste vide qu'on prendrait
      // pour « aucune adresse ne correspond ».
      logger.warn("GOOGLE_MAPS_API_KEY absente : fournisseur Google inutilisable");
      return { suggestions: [], joignable: false };
    }

    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);

    try {
      const base = process.env.GOOGLE_PLACES_API_URL || "https://places.googleapis.com/v1";
      const pays = paysAutorises();

      const reponse = await fetch(`${base}/places:searchText`, {
        method: "POST",
        signal: controleur.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": cle,
          "X-Goog-FieldMask":
            "places.formattedAddress,places.location,places.addressComponents,places.displayName",
        },
        body: JSON.stringify({
          textQuery: requete,
          languageCode: "fr",
          // Un seul pays peut être transmis : au-delà, le tri se fait sur la
          // réponse, comme pour Photon. À défaut, celui du navigateur oriente.
          ...(pays.length === 1
            ? { regionCode: pays[0].toUpperCase() }
            : indice.pays
              ? { regionCode: indice.pays.toUpperCase() }
              : {}),
          ...(typeof indice.latitude === "number" && typeof indice.longitude === "number"
            ? {
                locationBias: {
                  circle: {
                    center: { latitude: indice.latitude, longitude: indice.longitude },
                    radius: 50000,
                  },
                },
              }
            : {}),
          maxResultCount: Math.min(limite, 20),
        }),
      });

      if (!reponse.ok) {
        // Le corps porte la raison — clé refusée, quota dépassé, API non
        // activée : la taire condamnerait à deviner.
        const raison = await reponse.text().catch(() => "");
        throw new Error(`Réponse ${reponse.status} ${raison.slice(0, 200)}`);
      }

      const donnees: any = await reponse.json();

      const suggestions = (donnees.places || [])
        .map(normaliserGoogle)
        .filter((s: Suggestion) => s.label)
        .filter((s: Suggestion) => {
          if (pays.length === 0) return true;

          // Google rend le pays en toutes lettres : on compare sur ce qu'on
          // sait, faute de code ISO dans la réponse.
          const NOMS: Record<string, string[]> = {
            fr: ["france"],
            be: ["belgique", "belgium"],
          };

          return pays.some((code) =>
            (NOMS[code] || [code]).some((nom) => s.country.toLowerCase().includes(nom))
          );
        })
        .slice(0, limite);

      return { suggestions, joignable: true };
    } catch (err) {
      logger.warn("Service d'adresses injoignable", {
        fournisseur: "google",
        error: err instanceof Error ? err.message : err,
      });

      return { suggestions: [], joignable: false };
    } finally {
      clearTimeout(minuteur);
    }
  }

  private static async interroger(
    fournisseur: "ban" | "photon",
    requete: string,
    limite: number,
    indice: Indice = {}
  ): Promise<{ suggestions: Suggestion[]; joignable: boolean }> {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);

    try {
      // Photon ignore le périmètre demandé : on élargit la requête pour avoir
      // de quoi filtrer sans se retrouver les mains vides.
      const demandees =
        fournisseur === "photon" && paysAutorises().length > 0 ? limite * 4 : limite;

      const reponse = await fetch(construireUrl(requete, demandees, fournisseur, indice), {
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

      return { suggestions, joignable: true };
    } catch (err) {
      logger.warn("Service d'adresses injoignable", {
        fournisseur,
        error: err instanceof Error ? err.message : err,
      });

      return { suggestions: [], joignable: false };
    } finally {
      clearTimeout(minuteur);
    }
  }

  static async rechercher(requete: string, limite: number, indice: Indice = {}) {
    // En dessous de trois caractères, tous les fournisseurs renvoient du bruit.
    if (requete.length < 3) {
      return { suggestions: [] as Suggestion[], available: true };
    }

    const fournisseur = fournisseurActif();
    const cle = [
      fournisseur,
      requete.toLowerCase(),
      limite,
      indice.pays || "",
      indice.latitude ?? "",
      indice.longitude ?? "",
    ].join("|");
    const enCache = cache.get(cle);

    if (enCache && Date.now() < enCache.expireA) {
      return { suggestions: enCache.resultats, available: true };
    }

    /**
     * En mode mixte, les deux fournisseurs sont interrogés de front.
     *
     * La BAN passe devant : sur une adresse française elle est plus fine que
     * Photon, et c'est le gros des saisies. Photon apporte ce qu'elle ne
     * connaît pas — la Belgique, notamment.
     */
    const reponses =
      fournisseur === "google"
        ? [await this.interrogerGoogle(requete, limite, indice)]
        : await Promise.all(
            (fournisseur === "ban+photon"
              ? (["ban", "photon"] as const)
              : ([fournisseur] as const)
            ).map((lequel) => this.interroger(lequel, requete, limite, indice))
          );

    // Une même adresse peut revenir des deux côtés : on garde la première, donc
    // celle de la BAN.
    const vues = new Set<string>();
    const suggestions: Suggestion[] = [];

    for (const reponse of reponses) {
      for (const suggestion of reponse.suggestions) {
        const empreinte = `${suggestion.postalCode}|${suggestion.street}`.toLowerCase();

        if (vues.has(empreinte)) continue;

        vues.add(empreinte);
        suggestions.push(suggestion);
      }
    }

    // Injoignable ne se dit que si *aucun* fournisseur n'a répondu : sinon la
    // saisie manuelle prendrait le relais alors qu'on a des résultats.
    const joignable = reponses.some((reponse) => reponse.joignable);

    if (!joignable) {
      return { suggestions: [] as Suggestion[], available: false };
    }

    // La BAN répond toujours quelque chose, même à une adresse belge : sans ce
    // tri, ses approximations françaises passaient devant les vraies adresses
    // belges de Photon. Le pays de la personne passe donc en tête ; le tri est
    // stable, l'ordre de pertinence est conservé à l'intérieur de chaque pays.
    if (indice.pays) {
      suggestions.sort(
        (a, b) => Number(b.countryCode === indice.pays) - Number(a.countryCode === indice.pays)
      );
    }

    const retenues = suggestions.slice(0, limite);

    if (cache.size > TAILLE_MAX_CACHE) cache.clear();
    cache.set(cle, { expireA: Date.now() + DUREE_CACHE_MS, resultats: retenues });

    return { suggestions: retenues, available: true };
  }

  /**
   * Situer une adresse écrite à la main.
   *
   * Un client qui tape son adresse au lieu de retenir une suggestion n'a pas de
   * coordonnées, et sans coordonnées aucune zone de livraison ne peut être
   * départagée : sa commande était refusée. On la situe donc ici.
   *
   * `disponible` distingue les deux échecs, qui n'appellent pas la même
   * conduite : une adresse introuvable est probablement mal écrite, un service
   * injoignable est notre panne et ne doit pas fermer la boutique.
   */
  static async situer(texte: string, indice: Indice = {}): Promise<{
    point: { latitude: number; longitude: number } | null;
    disponible: boolean;
    adresse: Suggestion | null;
  }> {
    const requete = (texte || "").trim();

    if (requete.length < 3) {
      return { point: null, disponible: true, adresse: null };
    }

    const { suggestions, available } = await this.rechercher(requete, 1, indice);
    const premiere = suggestions[0];

    if (!premiere || premiere.latitude === null || premiere.longitude === null) {
      return { point: null, disponible: available, adresse: premiere || null };
    }

    return {
      point: { latitude: premiere.latitude, longitude: premiere.longitude },
      disponible: true,
      adresse: premiere,
    };
  }

  /** Vide le cache : utile après un changement de fournisseur. */
  static viderCache() {
    cache.clear();
  }
}
