import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RechercheAdresseLivraison } from "../RechercheAdresseLivraison";
import { enregistrerAdresseLivraison } from "@/lib/adresseLivraison";

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
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: jest.fn((success) =>
        success({
          coords: { latitude: 50.460123, longitude: 4.860321, accuracy: 80 },
        }),
      ),
    },
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ ...adresse, source: "saved" }, ancienne] }),
  });
});

test("les favoris du compte gardent leur nom et leur icône malgré un historique local plus récent", async () => {
  enregistrerAdresseLivraison({
    ...adresse,
    lastUsedAt: new Date().toISOString(),
  });
  const favoris = [
    { ...adresse, id: "home", kind: "HOME", name: "Domicile", source: "saved" },
    { ...ancienne, id: "work", kind: "WORK", name: "Travail", source: "saved" },
    ...Array.from({ length: 6 }, (_, i) => ({
      ...adresse,
      id: `favori-${i}`,
      kind: "OTHER",
      name: i === 0 ? "Maman" : `Favori ${i}`,
      street: `Rue Favorite ${i}`,
      source: "saved",
    })),
  ];
  fetch.mockResolvedValue({ ok: true, json: async () => ({ data: favoris }) });
  const onChange = jest.fn();
  render(<RechercheAdresseLivraison adresse={adresse} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /deliverTo/ }));
  await screen.findByText("home");
  expect(screen.getByText("work")).toBeTruthy();
  expect(screen.getByText("Maman")).toBeTruthy();
  expect(screen.getByText("Favori 5")).toBeTruthy();
  expect(document.querySelector("svg.lucide-house")).toBeTruthy();
  expect(document.querySelector("svg.lucide-briefcase-business")).toBeTruthy();
  expect(document.querySelector("svg.lucide-star")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "maman" } });
  expect(screen.queryByText("Favori 5")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Maman/ }));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ id: "favori-0", kind: "OTHER", name: "Maman" }),
  );
});

test("affiche cinq adresses mémorisées après plusieurs sélections, même sans compte", () => {
  localStorage.removeItem("accessToken");
  for (let i = 1; i <= 6; i++)
    enregistrerAdresseLivraison({
      ...adresse,
      street: `Rue Test ${i}`,
      label: `Rue Test ${i}, Namur`,
    });
  render(<RechercheAdresseLivraison adresse={null} onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "searchAddress" }));
  expect(screen.getByText("recentAddresses")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /Rue Test/ })).toHaveLength(5);
  expect(screen.queryByText("Rue Test 1")).toBeNull();
  expect(
    screen
      .getAllByRole("button", { name: /Rue Test/ })
      .map((b) => b.textContent),
  ).toEqual([6, 5, 4, 3, 2].map((i) => `Rue Test ${i}5000 Namur`));
});

test("la localisation affiche l’adresse complète et la précision, puis attend le choix du client", async () => {
  localStorage.removeItem("accessToken");
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ adresse, hasHouseNumber: true }),
  });
  const onChange = jest.fn();
  render(<RechercheAdresseLivraison adresse={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "searchAddress" }));
  fireEvent.click(screen.getByRole("button", { name: "myLocation" }));
  await screen.findByText("detectedAddress");
  expect(screen.getByText("Rue Neuve 2")).toBeTruthy();
  expect(screen.getByText("locationAccuracy")).toBeTruthy();
  expect(screen.getByText("locationImprecise")).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("lat=50.460123&lon=4.860321"),
    expect.any(Object),
  );
  fireEvent.click(screen.getByRole("button", { name: "useDetectedAddress" }));
  expect(onChange).toHaveBeenCalledWith(adresse);
  expect(lireAdresse()).toEqual(adresse);
});

const lireAdresse = () =>
  JSON.parse(localStorage.getItem("zupeat.adresseLivraison"));

test("sans numéro, propose de corriger au lieu de retenir une adresse incomplète", async () => {
  localStorage.removeItem("accessToken");
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      adresse: { ...adresse, street: "Rue Neuve" },
      hasHouseNumber: false,
    }),
  });
  const onChange = jest.fn();
  render(<RechercheAdresseLivraison adresse={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "searchAddress" }));
  fireEvent.click(screen.getByRole("button", { name: "myLocation" }));
  await screen.findByText("locationMissingNumber");
  expect(
    screen.getByRole("button", { name: "useDetectedAddress" }).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "correctLocationAddress" }),
  );
  expect(screen.getByRole("textbox").value).toBe("Rue Neuve, Namur");
  expect(onChange).not.toHaveBeenCalled();
});

test("une panne de localisation garde l’adresse actuelle et laisse la recherche disponible", async () => {
  localStorage.removeItem("accessToken");
  fetch.mockResolvedValue({ ok: false });
  const onChange = jest.fn();
  render(<RechercheAdresseLivraison adresse={adresse} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /deliverTo/ }));
  fireEvent.click(screen.getByRole("button", { name: "myLocation" }));
  await screen.findByText("locationAddressUnavailable");
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toBeTruthy();
});

test("les anciennes commandes complètent les cinq adresses récentes sans repousser les sélections plus récentes", async () => {
  for (let i = 1; i <= 5; i++)
    enregistrerAdresseLivraison({
      ...adresse,
      street: `Rue Test ${i}`,
      label: `Rue Test ${i}, Namur`,
    });
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [{ ...ancienne, lastUsedAt: "2020-01-01T00:00:00Z" }],
    }),
  });
  render(<RechercheAdresseLivraison adresse={null} onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "searchAddress" }));
  await waitFor(() =>
    expect(screen.queryByText("loadingAddresses")).toBeNull(),
  );
  expect(screen.getAllByRole("button", { name: /Rue Test/ })).toHaveLength(5);
  expect(screen.queryByText("Rue Ancienne 4")).toBeNull();
});

test("une ancienne demande GPS ne change pas l’adresse après fermeture et réouverture", async () => {
  localStorage.removeItem("accessToken");
  let terminer;
  navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
    terminer = success;
  });
  const onChange = jest.fn();
  render(<RechercheAdresseLivraison adresse={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "searchAddress" }));
  fireEvent.click(screen.getByRole("button", { name: "myLocation" }));
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  fireEvent.click(screen.getByRole("button", { name: "searchAddress" }));
  terminer({ coords: { latitude: 50.46, longitude: 4.86, accuracy: 20 } });
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByText("detectedAddress")).toBeNull();
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
