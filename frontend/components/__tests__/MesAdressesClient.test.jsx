import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MesAdressesClient } from "../MesAdressesClient";
import { poserJeton } from "@/lib/jeton-session";

jest.mock("next-intl", () => {
  const translate = (key) => key;
  return { useTranslations: () => translate };
});
jest.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange }) => (
    <input
      aria-label="street"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

let mockAdresses = [];
beforeEach(() => {
  mockAdresses = [];
  localStorage.clear();
  poserJeton("session");
  global.fetch = jest.fn().mockImplementation(async (url, options) => {
    if (options?.method === "PUT")
      mockAdresses = JSON.parse(options.body).addresses.map((a) => ({
        ...a,
        label: `${a.street}, ${a.city}`,
      }));
    return { ok: true, json: async () => ({ data: mockAdresses }) };
  });
});

test("ajoute un favori nommé et le conserve après relecture du compte", async () => {
  const { unmount } = render(<MesAdressesClient />);
  await waitFor(() => expect(screen.queryByText("loading")).toBeNull());
  expect(screen.getByText("home")).toBeTruthy();
  expect(screen.getByText("work")).toBeTruthy();
  fireEvent.click(screen.getByText("addFavorite"));
  fireEvent.change(screen.getByRole("textbox", { name: "name" }), {
    target: { value: "Maman" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "street" }), {
    target: { value: "Rue de Givet 4" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "postalCode" }), {
    target: { value: "5500" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "city" }), {
    target: { value: "Dinant" },
  });
  fireEvent.click(screen.getByText("save"));
  await screen.findByText("Maman");
  expect(fetch).toHaveBeenLastCalledWith(
    expect.stringContaining("/me/addresses"),
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ Authorization: "Bearer session" }),
      body: expect.stringContaining('"kind":"OTHER"'),
    }),
  );
  unmount();
  render(<MesAdressesClient />);
  await screen.findByText("Maman");
  fireEvent.click(screen.getByRole("button", { name: "remove Maman" }));
  await waitFor(() => expect(screen.queryByText("Maman")).toBeNull());
});

test("empêche l’écrasement du carnet lorsque son chargement échoue", async () => {
  fetch.mockResolvedValue({ ok: false });
  render(<MesAdressesClient />);
  await screen.findByText("loadError");
  expect(screen.getByRole("button", { name: "add home" }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "addFavorite" }).disabled).toBe(
    true,
  );
});
