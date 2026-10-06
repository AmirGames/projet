jest.mock("../../../services/db", () => ({
  db: { order: { findMany: jest.fn() } },
}));

import { db } from "../../../services/db";
import { adressesDuClient } from "../adresses-client.service";
import { adressesFavoritesSchema } from "../adresses-favorites";

const profil = {
  id: "client-connecte",
  address: "Rue Neuve 2",
  city: "Namur",
  postalCode: "5000",
};
const commande = {
  deliveryAddress: "Rue Neuve 2",
  deliveryCity: "Namur",
  deliveryPostal: "5000",
  deliveryLat: 50.46,
  deliveryLng: 4.86,
  createdAt: new Date("2026-10-04T10:00:00Z"),
};

const favori = { id: "maison", kind: "HOME", name: "", street: "Rue Neuve 2", city: "Namur", postalCode: "5000", latitude: 50.46, longitude: 4.86 };

test("conserve les noms et les coordonnées des favoris avant les destinations récentes", async () => {
  (db.order.findMany as jest.Mock).mockResolvedValue([commande, { ...commande, deliveryAddress: "Rue Récente" }]);
  const adresses = await adressesDuClient({ ...profil, savedAddresses: [favori, { ...favori, id: "travail", kind: "WORK" }, { ...favori, id: "maman", kind: "OTHER", name: "Maman", street: "Rue de Givet" }] });
  expect(adresses).toHaveLength(4);
  expect(adresses.slice(0, 3).map((a) => a.name)).toEqual(["Domicile", "Travail", "Maman"]);
  expect(adresses[0]).toMatchObject({ kind: "HOME", latitude: 50.46, longitude: 4.86, source: "saved" });
  expect(adresses.at(-1)?.street).toBe("Rue Récente");
});

test("refuse deux domiciles, un favori sans nom et des coordonnées invalides", () => {
  expect(adressesFavoritesSchema.safeParse([favori, { ...favori, id: "autre" }]).success).toBe(false);
  expect(adressesFavoritesSchema.safeParse([{ ...favori, kind: "OTHER" }]).success).toBe(false);
  expect(adressesFavoritesSchema.safeParse([{ ...favori, latitude: 100 }]).success).toBe(false);
  expect(adressesFavoritesSchema.safeParse([{ ...favori, longitude: null }]).success).toBe(false);
  expect(adressesFavoritesSchema.safeParse([]).success).toBe(true);
});

test("lit uniquement les livraisons du compte, sans limiter l'historique à 50 commandes", async () => {
  (db.order.findMany as jest.Mock).mockResolvedValue(
    Array.from({ length: 65 }, (_, i) => ({
      ...commande,
      deliveryAddress: `Rue ${i}`,
    })),
  );
  const adresses = await adressesDuClient({ ...profil, address: null });
  expect(adresses).toHaveLength(65);
  expect(db.order.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        customerId: profil.id,
        deletedAt: null,
        deliveryType: "DELIVERY",
        deliveryAddress: { not: null },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  expect(
    (db.order.findMany as jest.Mock).mock.calls.at(-1)[0],
  ).not.toHaveProperty("take");
});

test("fusionne le profil et les doublons en gardant les coordonnées de la dernière commande", async () => {
  (db.order.findMany as jest.Mock).mockResolvedValue([
    commande,
    { ...commande, deliveryAddress: "  RUE   NEUVE 2 ", deliveryLat: 51 },
    { ...commande, deliveryAddress: "Rue Ancienne 4", deliveryCity: "Liège" },
    { ...commande, deliveryAddress: "   " },
  ]);
  const adresses = await adressesDuClient(profil);
  expect(adresses).toHaveLength(2);
  expect(adresses[0]).toMatchObject({
    street: profil.address,
    source: "saved",
    latitude: 50.46,
    longitude: 4.86,
  });
  expect(adresses[1]).toMatchObject({
    street: "Rue Ancienne 4",
    city: "Liège",
    source: "order",
  });
});

test("range les adresses par dernière utilisation plutôt que de placer un ancien profil avant les commandes récentes", async () => {
  (db.order.findMany as jest.Mock).mockResolvedValue([
    {
      ...commande,
      deliveryAddress: "Rue Récente 5",
      createdAt: new Date("2026-10-04T11:00:00Z"),
    },
    { ...commande, createdAt: new Date("2026-10-03T11:00:00Z") },
  ]);
  const adresses = await adressesDuClient({
    ...profil,
    updatedAt: new Date("2026-01-01T11:00:00Z"),
  });
  expect(adresses.map((a) => a.street)).toEqual([
    "Rue Récente 5",
    "Rue Neuve 2",
  ]);
  expect(adresses[1].lastUsedAt).toBe("2026-10-03T11:00:00.000Z");
});
