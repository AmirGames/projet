import type { AdresseLivraison } from "@/lib/adresseLivraison";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function verifierAnnulation(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("Localisation annulée", "AbortError");
}

export interface AdresseLocalisee {
  adresse: AdresseLivraison;
  accuracy: number | null;
  hasHouseNumber: boolean;
}

/** Le GPS propose une adresse à vérifier ; il ne choisit jamais la destination. */
export async function localiserAdresse(
  signal?: AbortSignal,
): Promise<AdresseLocalisee> {
  if (!navigator.geolocation) throw new Error("geolocationNotSupported");
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      () => reject(new Error("cantAccessLocation")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
  verifierAnnulation(signal);
  let resultat;
  try {
    const parametres = new URLSearchParams({
      lat: String(position.coords.latitude),
      lon: String(position.coords.longitude),
    });
    const reponse = await fetch(
      `${API_URL}/api/addresses/reverse?${parametres}`,
      { signal },
    );
    if (!reponse.ok) throw new Error();
    resultat = await reponse.json();
  } catch (erreur) {
    verifierAnnulation(signal);
    throw new Error("locationAddressUnavailable", { cause: erreur });
  }
  verifierAnnulation(signal);
  if (!resultat.adresse?.street) throw new Error("locationAddressUnavailable");
  return {
    adresse: resultat.adresse,
    accuracy: Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null,
    hasHouseNumber: resultat.hasHouseNumber === true,
  };
}
