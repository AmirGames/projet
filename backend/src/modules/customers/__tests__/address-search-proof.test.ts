import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { lireSelectionAdresseZupDrive } from "../../zupdrive/adresse-selection-signee";

const rechercher: any = jest.fn();
jest.mock("../address.service", () => ({
  AddressService: { rechercher },
  completerIndice: (_requete: string, indice: unknown) => indice,
  fournisseurActif: () => "photon",
  indiceValide: () => ({}),
}));

import router from "../address.routes";

const app = express();
app.use("/api/addresses", router);

const namur = {
  label: "Place d'Armes, 5000 Namur, Belgique",
  street: "Place d'Armes",
  city: "Namur",
  postalCode: "5000",
  country: "Belgique",
  countryCode: "be",
  latitude: 50.4632,
  longitude: 4.8665,
};

beforeEach(() => {
  jest.clearAllMocks();
  rechercher.mockResolvedValue({ suggestions: [namur], available: true });
});

describe("preuve de sélection des adresses ZupDrive", () => {
  it("signe les suggestions uniquement quand l'usage ZupDrive est demandé", async () => {
    const reponseZupDrive = await request(app).get("/api/addresses/search?q=Namur&usage=zupdrive");
    const preuve = reponseZupDrive.body.suggestions[0].preuveAdresse;

    expect(reponseZupDrive.status).toBe(200);
    expect(lireSelectionAdresseZupDrive(preuve)).toMatchObject({
      ok: true,
      adresse: {
        adresse: namur.label,
        latitude: namur.latitude,
        longitude: namur.longitude,
        codePostal: namur.postalCode,
      },
    });

    const reponseGenerique = await request(app).get("/api/addresses/search?q=Namur");
    expect(reponseGenerique.body.suggestions[0]).not.toHaveProperty("preuveAdresse");
  });

  it("ne signe pas une suggestion sans coordonnées belges vérifiables", async () => {
    rechercher.mockResolvedValue({
      suggestions: [{ ...namur, countryCode: "fr", latitude: null, longitude: null }],
      available: true,
    });

    const reponse = await request(app).get("/api/addresses/search?q=Namur&usage=zupdrive");
    expect(reponse.body.suggestions[0].preuveAdresse).toBeNull();
  });
});
