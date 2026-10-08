import { db } from "../../services/db";
import { lireAdressesFavorites } from "./adresses-favorites";

interface ProfilAdresse {
  id: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  updatedAt?: Date;
  savedAddresses?: unknown;
}

export interface Adresse {
  id?: string;
  kind?: "HOME" | "WORK" | "OTHER";
  name?: string;
  label: string;
  street: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  source: "saved" | "order";
  lastUsedAt: string;
}

const cle = (adresse: Adresse) =>
  [adresse.street, adresse.city, adresse.postalCode]
    .map((texte) => texte.trim().replace(/\s+/g, " ").toLocaleLowerCase())
    .join("|");

/** Toutes les destinations du compte, sans la limite de la liste des commandes. */
export async function adressesDuClient(
  client: ProfilAdresse,
): Promise<Adresse[]> {
  const commandes = await db.order.findMany({
    where: {
      customerId: client.id,
      deletedAt: null,
      deliveryType: "DELIVERY",
      deliveryAddress: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      deliveryAddress: true,
      deliveryCity: true,
      deliveryPostal: true,
      deliveryLat: true,
      deliveryLng: true,
      createdAt: true,
    },
  });
  const adresses = new Map<string, Adresse>();
  for (const commande of commandes) {
    const street = commande.deliveryAddress?.trim();
    if (!street) continue;
    const city = commande.deliveryCity?.trim() || "";
    const adresse: Adresse = {
      label: [street, city].filter(Boolean).join(", "),
      street,
      city,
      postalCode: commande.deliveryPostal?.trim() || "",
      latitude: commande.deliveryLat,
      longitude: commande.deliveryLng,
      source: "order",
      lastUsedAt: commande.createdAt.toISOString(),
    };
    if (!adresses.has(cle(adresse))) adresses.set(cle(adresse), adresse);
  }
  if (client.address?.trim()) {
    const street = client.address.trim();
    const city = client.city?.trim() || "";
    const adresse: Adresse = {
      label: [street, city].filter(Boolean).join(", "),
      street,
      city,
      postalCode: client.postalCode?.trim() || "",
      latitude: null,
      longitude: null,
      source: "saved",
      lastUsedAt: client.updatedAt?.toISOString() || new Date(0).toISOString(),
    };
    // L'adresse du profil garde les coordonnées de sa dernière commande.
    const precedente = adresses.get(cle(adresse));
    adresses.set(cle(adresse), {
      ...adresse,
      latitude: precedente?.latitude ?? null,
      longitude: precedente?.longitude ?? null,
      lastUsedAt: precedente?.lastUsedAt || adresse.lastUsedAt,
    });
  }
  const rang = { HOME: 0, WORK: 1, OTHER: 2 };
  const favorites = lireAdressesFavorites(client.savedAddresses)
    .sort((a, b) => rang[a.kind] - rang[b.kind])
    .map((adresse) => ({
      ...adresse,
      label: [adresse.street, adresse.city].join(", "),
      source: "saved" as const,
      lastUsedAt: client.updatedAt?.toISOString() || new Date(0).toISOString(),
    }));
  const lieuxFavoris = new Set(favorites.map(cle));
  return [
    ...favorites,
    ...[...adresses.values()]
      .filter((adresse) => !lieuxFavoris.has(cle(adresse)))
      .sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt)),
  ];
}
