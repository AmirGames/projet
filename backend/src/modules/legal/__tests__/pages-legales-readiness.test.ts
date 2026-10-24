import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const findFirst: any = jest.fn();
const findUnique: any = jest.fn();
const create: any = jest.fn();
const findConfig: any = jest.fn();
jest.mock("../../../services/db", () => ({
  db: {
    pageLegaleVersion: { findFirst, findUnique, create },
    systemConfig: { findFirst: findConfig },
  },
}));

import { contientChampLegalACompleter, estPageLegalePrete, PagesLegalesService } from "../pages-legales.service";

const page = (contenu: string, parDefaut = false) => ({
  slug: "cgv" as const,
  titre: "CGV",
  contenu,
  version: "2",
  publieLe: new Date(),
  parDefaut,
});

describe("préparation des pages légales", () => {
  beforeEach(() => {
    findFirst.mockReset();
    findUnique.mockReset();
    create.mockReset();
    findConfig.mockReset();
  });

  it("distingue les liens Markdown des champs et refuse un brouillon", () => {
    expect(contientChampLegalACompleter("Voir les [CGV](/cgv).")).toBe(false);
    expect(contientChampLegalACompleter("Exploitant : [Nom de l'exploitant]")).toBe(true);
    expect(estPageLegalePrete(page("**Projet de conditions à valider.**"))).toBe(false);
    expect(estPageLegalePrete(page("Durée à définir."))).toBe(false);
    expect(estPageLegalePrete(page("Coordonnées à compléter."))).toBe(false);
    expect(estPageLegalePrete(page("Conditions complètes.", true))).toBe(false);
    expect(estPageLegalePrete(page("Conditions complètes."))).toBe(true);
  });

  it("bloque les commandes si les pages essentielles sont encore au texte de départ", async () => {
    findFirst.mockResolvedValue(null);
    await expect(PagesLegalesService.verifierPrealablesCommande()).rejects.toMatchObject({
      statusCode: 503,
      code: "LEGAL_PAGES_NOT_READY",
    });
  });

  it("autorise la commande quand toutes les pages essentielles ont une version publiée et complète", async () => {
    findFirst.mockResolvedValue({ titre: "Document", contenu: "Texte validé.", version: "2", publieLe: new Date() });
    await expect(PagesLegalesService.verifierPrealablesCommande()).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledTimes(5);
  });

  it("résout le profil légal avant de publier un instantané", async () => {
    findConfig.mockResolvedValue({ settings: { legalCompanyProfile: { raison_sociale: "Exemple SRL" } } });
    findFirst.mockResolvedValue(null);
    findUnique.mockResolvedValue(null);
    create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const publiee = await PagesLegalesService.publier("cgv", {
      titre: "CGV de $raison_sociale",
      contenu: "Vendeur : $raison_sociale",
      version: "3",
    });
    expect(publiee).toMatchObject({ titre: "CGV de Exemple SRL", contenu: "Vendeur : Exemple SRL" });
  });

  it("refuse une variable du profil encore vide", async () => {
    findConfig.mockResolvedValue({ settings: { legalCompanyProfile: {} } });
    await expect(PagesLegalesService.publier("cgv", {
      titre: "CGV de $raison_sociale",
      contenu: "Texte final.",
      version: "3",
    })).rejects.toMatchObject({ code: "LEGAL_VARIABLES_MISSING" });
    expect(create).not.toHaveBeenCalled();
  });
});
