import {
  enregistrerAdresseLivraison,
  lireAdressesRecentes,
  lireAdresseLivraison,
  oublierAdresseLivraison,
} from "../adresseLivraison";
import { oublierJeton, poserJeton } from "../jeton-session";

const adresse = (n: number) => ({
  label: `Rue ${n}, Namur`,
  street: `Rue ${n}`,
  city: "Namur",
  postalCode: "5000",
  latitude: 50.46,
  longitude: 4.86,
});
beforeEach(() => {
  localStorage.clear();
  oublierJeton();
});

test("garde les cinq dernières adresses distinctes après relecture et remonte une adresse réutilisée", () => {
  for (let i = 1; i <= 7; i++) enregistrerAdresseLivraison(adresse(i));
  expect(lireAdressesRecentes().map((a) => a.street)).toEqual([
    "Rue 7",
    "Rue 6",
    "Rue 5",
    "Rue 4",
    "Rue 3",
  ]);
  enregistrerAdresseLivraison({ ...adresse(4), street: "  RUE  4  " });
  expect(lireAdressesRecentes().map((a) => a.street.trim())).toEqual([
    "RUE  4",
    "Rue 7",
    "Rue 6",
    "Rue 5",
    "Rue 3",
  ]);
  expect(lireAdresseLivraison()?.street).toBe("  RUE  4  ");
});

test("migre l’ancienne adresse unique sans la perdre lors du choix suivant", () => {
  localStorage.setItem("zupeat.adresseLivraison", JSON.stringify(adresse(1)));
  enregistrerAdresseLivraison(adresse(2));
  expect(lireAdressesRecentes().map((a) => a.street)).toEqual([
    "Rue 2",
    "Rue 1",
  ]);
});

test("sépare les historiques des comptes et supporte un stockage corrompu", () => {
  const connecter = (userId: string) =>
    poserJeton(`header.${btoa(JSON.stringify({ userId }))}.signature`);
  connecter("alice");
  enregistrerAdresseLivraison(adresse(1));
  enregistrerAdresseLivraison(adresse(2));
  localStorage.removeItem("zupeat.adresseLivraison");
  connecter("bob");
  expect(lireAdressesRecentes()).toEqual([]);
  enregistrerAdresseLivraison(adresse(3));
  connecter("alice");
  expect(lireAdressesRecentes().map((a) => a.street)).toEqual([
    "Rue 2",
    "Rue 1",
  ]);
  localStorage.setItem("zupeat.adressesRecentes.alice", "{cassé");
  expect(lireAdressesRecentes()).toHaveLength(1);
  oublierAdresseLivraison();
  expect(lireAdressesRecentes()).toEqual([]);
});
