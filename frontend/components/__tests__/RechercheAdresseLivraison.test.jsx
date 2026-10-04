import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RechercheAdresseLivraison } from "../RechercheAdresseLivraison";

jest.mock("next-intl", () => ({ useTranslations: () => (cle) => cle }));
jest.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, onSelect, id }) => (
    <>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        onClick={() =>
          onSelect({
            label: "Rue Nouvelle 8, Namur",
            street: "Rue Nouvelle 8",
            city: "Namur",
            postalCode: "5000",
            latitude: 50.47,
            longitude: 4.87,
          })
        }
      >
        suggestion
      </button>
    </>
  ),
}));

const adresse = {
  label: "Rue Neuve 2, Namur",
  street: "Rue Neuve 2",
  city: "Namur",
  postalCode: "5000",
  latitude: 50.46,
  longitude: 4.86,
};
const ancienne = {
  ...adresse,
  label: "Rue Ancienne 4, Liège",
  street: "Rue Ancienne 4",
  city: "Liège",
  postalCode: "4000",
  source: "order",
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("accessToken", "session");
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ ...adresse, source: "saved" }, ancienne] }),
    });
});

test("ouvre toutes les anciennes adresses, filtre sans tenir compte des accents et sélectionne une destination", async () => {
  const onChange = jest.fn();
  render(<RechercheAdresseLivraison adresse={adresse} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /deliverTo/ }));
  await screen.findByText("Rue Ancienne 4");
  expect(screen.getAllByText("Rue Neuve 2")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/client/me/addresses"),
    expect.objectContaining({ headers: { Authorization: "Bearer session" } }),
  );
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "searchAddress" }),
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "liege" } });
  expect(screen.queryByText("Rue Neuve 2")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Rue Ancienne 4/ }));
  expect(onChange).toHaveBeenCalledWith(ancienne);
  expect(
    JSON.parse(localStorage.getItem("zupeat.adresseLivraison")).street,
  ).toBe(ancienne.street);
  await waitFor(() =>
    expect(document.querySelector("dialog").open).toBe(false),
  );
  expect(document.body.style.overflow).toBe("");
});

test("un invité retrouve son adresse mémorisée et peut choisir une nouvelle suggestion", () => {
  localStorage.removeItem("accessToken");
  const onChange = jest.fn();
  render(<RechercheAdresseLivraison adresse={adresse} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /deliverTo/ }));
  expect(screen.getByText("Rue Neuve 2")).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "suggestion" }));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      street: "Rue Nouvelle 8",
      city: "Namur",
      latitude: 50.47,
    }),
  );
});

test("une panne de l’historique laisse la recherche disponible et propose de réessayer", async () => {
  fetch.mockResolvedValue({ ok: false });
  render(<RechercheAdresseLivraison adresse={null} onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "searchAddress" }));
  await screen.findByText("loadAddressesError");
  expect(screen.getByRole("textbox", { name: "searchAddress" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(document.querySelector("dialog").open).toBe(false);
});
