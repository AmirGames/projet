import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const findFirst: any = jest.fn();
jest.mock("../../../services/db", () => ({
  db: { pageLegaleVersion: { findFirst } },
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
  beforeEach(() => findFirst.mockReset());

  it("distingue les liens Markdown des champs et refuse un brouillon", () => {
    expect(contientChampLegalACompleter("Voir les [CGV](/cgv).")).toBe(false);
    expect(contientChampLegalACompleter("Exploitant : [Nom de l'exploitant]")).toBe(true);
    expect(estPageLegalePrete(page("**Projet de conditions à valider.**"))).toBe(false);
    expect(estPageLegalePrete(page("Durée à définir."))).toBe(false);
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
});
