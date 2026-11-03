import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const devis: any = jest.fn();
jest.mock("../course-drive.service", () => ({ CourseDriveService: { devis } }));
jest.mock("../note-course-drive.service", () => ({ COMMENTAIRE_MAX: 500, NOTE_MAX: 5, NOTE_MIN: 1, NoteCourseDriveService: {} }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    next();
  },
}));

import router from "../course-drive.routes";
import { signerSelectionAdresseZupDrive } from "../adresse-selection-signee";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/courses", router);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }),
);

const depart = {
  label: "Place d'Armes, 5000 Namur",
  postalCode: "5000",
  countryCode: "be",
  latitude: 50.4632,
  longitude: 4.8665,
};
const arrivee = {
  label: "Avenue Jean Materne, 5100 Jambes",
  postalCode: "5100",
  countryCode: "be",
  latitude: 50.4555,
  longitude: 4.8759,
};

beforeEach(() => {
  jest.clearAllMocks();
  devis.mockResolvedValue({
    region: "WALLONIE",
    distanceMetres: 1200,
    dureeSecondes: 300,
    prixCentimes: 820,
    nombrePassagers: 1,
    categorieVehicule: "STANDARD",
    devise: "EUR",
    trace: null,
    source: "estimation",
    devis: "devis-signe",
  });
});

describe("devis de course avec preuve d'adresse", () => {
  it("utilise les champs canoniques de la preuve signée", async () => {
    const preuveDepart = signerSelectionAdresseZupDrive(depart)!;
    const preuveArrivee = signerSelectionAdresseZupDrive(arrivee)!;
    const reponse = await request(app)
      .post("/api/zupdrive/courses/devis")
      .set("x-user", "passager-1")
      .send({ depart: { preuveAdresse: preuveDepart }, arrivee: { preuveAdresse: preuveArrivee }, nombrePassagers: 2 });

    expect(reponse.status).toBe(200);
    expect(devis).toHaveBeenCalledWith("passager-1", {
      adresse: depart.label,
      latitude: depart.latitude,
      longitude: depart.longitude,
      codePostal: depart.postalCode,
    }, {
      adresse: arrivee.label,
      latitude: arrivee.latitude,
      longitude: arrivee.longitude,
      codePostal: arrivee.postalCode,
    }, 2);
  });

  it("refuse les coordonnées/adresses envoyées hors de la preuve par le client", async () => {
    const preuveDepart = signerSelectionAdresseZupDrive(depart)!;
    const preuveArrivee = signerSelectionAdresseZupDrive(arrivee)!;
    const reponse = await request(app)
      .post("/api/zupdrive/courses/devis")
      .set("x-user", "passager-1")
      .send({
        depart: { preuveAdresse: preuveDepart, latitude: 50.8467, longitude: 4.3525, codePostal: "1000" },
        arrivee: { preuveAdresse: preuveArrivee },
      });

    expect(reponse.status).toBe(400);
    expect(devis).not.toHaveBeenCalled();
  });

  it("refuse une preuve falsifiée", async () => {
    const preuve = signerSelectionAdresseZupDrive(depart)!;
    const preuveFalsifiee = `${preuve.slice(0, -1)}${preuve.endsWith("a") ? "b" : "a"}`;
    const reponse = await request(app)
      .post("/api/zupdrive/courses/devis")
      .set("x-user", "passager-1")
      .send({ depart: { preuveAdresse: preuveFalsifiee }, arrivee: { preuveAdresse: signerSelectionAdresseZupDrive(arrivee) } });

    expect(reponse.status).toBe(400);
    expect(reponse.body.code).toBe("INVALID_ADDRESS_PROOF");
    expect(devis).not.toHaveBeenCalled();
  });
});
