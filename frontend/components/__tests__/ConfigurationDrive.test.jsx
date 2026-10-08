import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfigurationDrivePage from "../../app/superowner/zupdrive/configuration/page";
import { appelerZupDrive } from "@/lib/zupdrive";

// Comme le vrai hook, la fonction de traduction garde la même identité d'un rendu à l'autre.
jest.mock("next-intl", () => {
  const traduire = (cle, valeurs) => (valeurs ? `${cle} ${JSON.stringify(valeurs)}` : cle);
  return { useTranslations: () => traduire };
});
jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href }) => <a href={href}>{children}</a> }));
jest.mock("@/lib/zupdrive", () => ({ ...jest.requireActual("@/lib/zupdrive"), appelerZupDrive: jest.fn() }));

const CHEMIN = "/api/zupdrive/finance/admin/settings/commission";

async function afficher() {
  appelerZupDrive.mockImplementation(async (chemin, init) => (init?.method === "POST" ? { success: true } : { commissionPercentage: 20 }));
  await act(async () => {
    render(<ConfigurationDrivePage />);
  });
  await waitFor(() => expect(screen.getByRole("textbox").value).toBe("20"));
}

beforeEach(() => jest.clearAllMocks());

test("affiche la commission en vigueur lue sur le serveur", async () => {
  await afficher();
  expect(appelerZupDrive).toHaveBeenCalledWith(CHEMIN);
});

test("enregistre un entier de 0 à 100, tel que le serveur l'exige", async () => {
  await afficher();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "25" } });
  fireEvent.click(screen.getByText("enregistrer"));
  await waitFor(() => expect(screen.getByText(/enregistree/)).toBeTruthy());
  expect(appelerZupDrive).toHaveBeenCalledWith(CHEMIN, { method: "POST", corps: { commissionPercentage: 25 } });
});

test.each(["", "abc", "12,5", "101", "-1", "1e2"])("saisie invalide « %s » : refusée sans appeler le serveur", async (saisie) => {
  await afficher();
  appelerZupDrive.mockClear();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: saisie } });
  fireEvent.click(screen.getByText("enregistrer"));
  expect(screen.getByRole("alert").textContent).toBe("pourcentageInvalide");
  expect(appelerZupDrive).not.toHaveBeenCalled();
});

test("une erreur du serveur est montrée, la valeur affichée ne change pas", async () => {
  await afficher();
  appelerZupDrive.mockRejectedValueOnce(new Error("Accès refusé"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "30" } });
  fireEvent.click(screen.getByText("enregistrer"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Accès refusé"));
  expect(document.querySelector("[data-commission]").getAttribute("data-commission")).toBe("20");
});
