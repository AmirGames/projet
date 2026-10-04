jest.mock("../../../config/logger", () => ({ logger: { warn: jest.fn() } }));
import { AddressService } from "../address.service";

const latitude = 50.464321;
const longitude = 4.867654;
const maison = {
  properties: {
    housenumber: "12",
    street: "Rue Neuve",
    city: "Namur",
    postcode: "5000",
    country: "Belgique",
    countrycode: "BE",
  },
  geometry: { coordinates: [longitude, latitude] },
};
const fetchOriginal = global.fetch;
const envOriginal = { ...process.env };
beforeEach(() => {
  process.env.ADDRESS_COUNTRIES = "fr,be";
  delete process.env.PHOTON_API_URL;
  delete process.env.PHOTON_REVERSE_API_URL;
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ features: [maison] }),
    });
});
afterAll(() => {
  global.fetch = fetchOriginal;
  process.env = envOriginal;
});

test("transforme les coordonnées complètes en rue, numéro et ville, sans arrondi au kilomètre", async () => {
  const resultat = await AddressService.inverser(latitude, longitude);
  expect(resultat).toMatchObject({
    available: true,
    hasHouseNumber: true,
    adresse: {
      street: "12 Rue Neuve",
      city: "Namur",
      postalCode: "5000",
      latitude,
      longitude,
    },
  });
  const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
  expect(url.pathname).toBe("/reverse");
  expect(url.searchParams.get("lat")).toBe(String(latitude));
  expect(url.searchParams.get("lon")).toBe(String(longitude));
});

test("refuse une adresse distante et ne fabrique pas de numéro absent", async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      features: [{ ...maison, geometry: { coordinates: [5, 51] } }],
    }),
  });
  expect(
    (await AddressService.inverser(latitude, longitude)).adresse,
  ).toBeNull();
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      features: [
        {
          ...maison,
          properties: { ...maison.properties, housenumber: undefined },
        },
      ],
    }),
  });
  expect(await AddressService.inverser(latitude, longitude)).toMatchObject({
    hasHouseNumber: false,
    adresse: { street: "Rue Neuve" },
  });
});

test("une panne ou un point invalide ne renvoie aucune fausse adresse", async () => {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("indisponible"));
  expect(await AddressService.inverser(latitude, longitude)).toMatchObject({
    available: false,
    adresse: null,
  });
  (global.fetch as jest.Mock).mockClear();
  expect((await AddressService.inverser(100, longitude)).adresse).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
});
