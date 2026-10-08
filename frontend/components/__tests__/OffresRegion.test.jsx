import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OffresRegion } from "../OffresRegion";
import { PersonnalisationClient } from "../PersonnalisationClient";

jest.mock("next-intl", () => ({
  useTranslations: () => (key, valeurs) => (valeurs ? `${key}:${JSON.stringify(valeurs)}` : key),
}));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }) => <a href={href}>{children}</a> }));
jest.mock("@/lib/region-context", () => ({ useRegion: () => undefined }));

const reponse = (data) => ({ ok: true, json: async () => ({ data }) });

beforeEach(() => {
  localStorage.clear();
});

describe("OffresRegion", () => {
  test("sans rien à montrer, la zone disparaît", async () => {
    global.fetch = jest.fn().mockResolvedValue(reponse([]));
    const { container } = render(<OffresRegion />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(container.firstChild).toBeNull();
  });

  test("visiteur sans compte : promotions et tendances, jamais de suggestions", async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes("promotions-region"))
        return reponse([
          {
            code: "TACOS10",
            type: "PERCENTAGE",
            discountValue: "10.00",
            store: { id: "s1", name: "Tacos Bar", slug: "tacos-bar" },
          },
        ]);
      if (url.includes("tendances")) return reponse([{ cuisineType: "tacos", libelle: "Tacos", commandes: 42 }]);
      throw new Error("appel inattendu : " + url);
    });

    render(<OffresRegion />);

    expect(await screen.findByText("Tacos Bar")).toBeTruthy();
    expect(screen.getByText("-10 %")).toBeTruthy();
    expect(screen.getByText("TACOS10")).toBeTruthy();
    expect(screen.getByText("Tacos")).toBeTruthy();
    expect(screen.queryByText("pourVousTitre")).toBeNull();
    expect(global.fetch.mock.calls.some(([url]) => url.includes("recommandations"))).toBe(false);
  });

  test("compte connecté : les suggestions viennent avec le jeton du compte", async () => {
    localStorage.setItem("accessToken", "session");
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes("recommandations"))
        return reponse({
          boutiques: [{ id: "s2", name: "Nouveau Tacos", slug: "nouveau", rating: 4.5, cuisineLibelle: "Tacos", dejaCommande: false }],
        });
      return reponse([]);
    });

    render(<OffresRegion />);

    expect(await screen.findByText("Nouveau Tacos")).toBeTruthy();
    const appel = global.fetch.mock.calls.find(([url]) => url.includes("recommandations"));
    expect(appel[1].headers.Authorization).toBe("Bearer session");
  });
});

describe("PersonnalisationClient", () => {
  test("l'interrupteur envoie l'opposition au serveur et affiche sa réponse", async () => {
    localStorage.setItem("accessToken", "session");
    global.fetch = jest.fn().mockImplementation(async (url, options) => {
      if (options?.method === "PUT") return reponse({ personnalisationActive: !JSON.parse(options.body).desactivee });
      return reponse({ personnalisationActive: true });
    });

    render(<PersonnalisationClient />);
    const interrupteur = await screen.findByRole("switch");
    expect(interrupteur.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(interrupteur);

    await waitFor(() => expect(interrupteur.getAttribute("aria-checked")).toBe("false"));
    const put = global.fetch.mock.calls.find(([, o]) => o?.method === "PUT");
    expect(JSON.parse(put[1].body)).toEqual({ desactivee: true });
  });
});
