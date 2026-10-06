import { useMemo, useSyncExternalStore } from "react";

/**
 * L'adresse de livraison choisie par le client, gardée d'une visite à l'autre.
 *
 * Comme sur les grandes plateformes, on la demande une fois sur l'accueil :
 * elle sert ensuite à trouver les restaurants proches et pré-remplit le
 * tunnel de commande. Elle vit dans le navigateur, donc un invité en profite
 * autant qu'un client connecté.
 */

export interface AdresseLivraison {
  /** Ce qu'on affiche : « Rue Asty Moulin 63, Namur ». */
  label: string;
  street: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  id?: string;
  kind?: 'HOME' | 'WORK' | 'OTHER';
  name?: string;
}

const CLE = "zupeat.adresseLivraison";
const CLE_HISTORIQUE = "zupeat.adressesRecentes";

export interface AdresseRecente extends AdresseLivraison {
  lastUsedAt: string;
}

export function cleAdresse(adresse: AdresseLivraison): string {
  return [adresse.street, adresse.city, adresse.postalCode]
    .map((texte) =>
      texte
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " "),
    )
    .join("|");
}

// Le jeton sert uniquement à ranger le cache local par compte, jamais à autoriser une requête.
function cleHistorique(): string {
  try {
    const jeton = localStorage.getItem("accessToken");
    if (jeton) {
      const charge = jeton.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
      const userId = charge && JSON.parse(atob(charge)).userId;
      if (typeof userId === "string") return `${CLE_HISTORIQUE}.${userId}`;
    }
  } catch {
    /* Une ancienne session sans jeton exploitable reste un historique local. */
  }
  return `${CLE_HISTORIQUE}.invite`;
}

export function lireAdressesRecentes(): AdresseRecente[] {
  try {
    const liste = JSON.parse(localStorage.getItem(cleHistorique()) || "[]");
    if (Array.isArray(liste) && liste.length) {
      const uniques = new Map<string, AdresseRecente>();
      for (const adresse of liste) {
        if (
          !adresse ||
          typeof adresse.street !== "string" ||
          !adresse.street.trim() ||
          typeof adresse.label !== "string" ||
          typeof adresse.city !== "string" ||
          typeof adresse.postalCode !== "string" ||
          typeof adresse.lastUsedAt !== "string"
        )
          continue;
        if (!uniques.has(cleAdresse(adresse)))
          uniques.set(cleAdresse(adresse), adresse);
      }
      if (uniques.size) return [...uniques.values()].slice(0, 5);
    }
  } catch {
    /* Stockage bloqué ou ancien contenu : conserver au moins l'adresse courante. */
  }
  const courante = lireAdresseLivraison();
  return courante?.street
    ? [{ ...courante, lastUsedAt: new Date(0).toISOString() }]
    : [];
}

function lireBrut(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

function analyser(brut: string | null): AdresseLivraison | null {
  if (!brut) return null;
  try {
    const adresse = JSON.parse(brut);
    return adresse && typeof adresse.label === "string" ? adresse : null;
  } catch {
    return null;
  }
}

export function lireAdresseLivraison(): AdresseLivraison | null {
  return analyser(lireBrut());
}

const sansAbonnement = () => () => {};

/**
 * L'adresse enregistrée, lue au rendu : `undefined` au rendu serveur et à
 * l'hydratation (le serveur ne voit pas le stockage du navigateur), puis
 * l'adresse ou `null`.
 */
export function useAdresseLivraisonEnregistree():
  AdresseLivraison | null | undefined {
  const brut = useSyncExternalStore<string | null | undefined>(
    sansAbonnement,
    lireBrut,
    () => undefined,
  );
  return useMemo(
    () => (brut === undefined ? undefined : analyser(brut)),
    [brut],
  );
}

export function enregistrerAdresseLivraison(adresse: AdresseLivraison): void {
  const precedentes = lireAdressesRecentes();
  try {
    localStorage.setItem(CLE, JSON.stringify(adresse));
    if (adresse.street.trim()) {
      const recentes = [
        { ...adresse, lastUsedAt: new Date().toISOString() },
        ...precedentes.filter(
          (precedente) => cleAdresse(precedente) !== cleAdresse(adresse),
        ),
      ].slice(0, 5);
      localStorage.setItem(cleHistorique(), JSON.stringify(recentes));
    }
  } catch {
    // Navigation privée ou stockage bloqué : l'adresse vaut pour la visite.
  }
}

export function oublierAdresseLivraison(): void {
  try {
    localStorage.removeItem(CLE);
    localStorage.removeItem(cleHistorique());
  } catch {
    // Rien à faire.
  }
}
