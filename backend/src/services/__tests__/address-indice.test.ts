jest.mock("../../config/logger", () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { AddressService, indiceValide, paysDuTexte } from "../address.service";

/**
 * Un client belge qui tape son adresse : la BAN rend toujours une approximation
 * française, Photon la vraie adresse belge. Avec l'indice du navigateur, la
 * belge doit passer devant.
 */
const BAN = {
  features: [
    {
      properties: { label: "12 Rue de la Station 59000 Lille", name: "12 Rue de la Station", city: "Lille", postcode: "59000" },
      geometry: { coordinates: [3.06, 50.63] },
    },
  ],
};

const PHOTON = {
  features: [
    {
      properties: { housenumber: "12", street: "Rue de la Station", city: "Liège", postcode: "4000", country: "Belgique", countrycode: "BE" },
      geometry: { coordinates: [5.57, 50.63] },
    },
  ],
};

describe("Recherche d'adresses orientée par le navigateur", () => {
  const fetchOriginal = global.fetch;
  let urls: string[];

  beforeEach(() => {
    process.env.ADDRESS_PROVIDER = "ban+photon";
    process.env.ADDRESS_COUNTRIES = "fr,be";
    AddressService.viderCache();
    urls = [];
    global.fetch = jest.fn(async (url: any) => {
      urls.push(String(url));
      const corps = String(url).includes("photon") ? PHOTON : BAN;
      return { ok: true, json: async () => corps } as any;
    }) as any;
  });

  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  it("garde la BAN en tête sans indice", async () => {
    const { suggestions } = await AddressService.rechercher("12 rue de la station", 1);
    expect(suggestions[0].countryCode).toBe("fr");
  });

  it("met les adresses belges en tête pour un navigateur belge", async () => {
    const { suggestions } = await AddressService.rechercher("12 rue de la station", 1, { pays: "be" });
    expect(suggestions[0].city).toBe("Liège");
    // Photon est orienté vers la Belgique.
    expect(urls.find((u) => u.includes("photon"))).toMatch(/&lat=50\.64&lon=4\.67/);
  });

  it("ignore un pays hors périmètre et une position fantaisiste", () => {
    expect(indiceValide({ pays: "de", latitude: "200", longitude: "4" })).toEqual({});
    expect(indiceValide({ pays: "BE", latitude: "50.6412", longitude: "4.6711" })).toEqual({
      pays: "be",
      latitude: 50.64,
      longitude: 4.67,
    });
  });

  it("déduit le pays du texte de l'adresse", () => {
    expect(paysDuTexte("Rue de la Station 12, 4000 Liège")).toBe("be");
    expect(paysDuTexte("12 rue de la paix 75002 Paris")).toBe("fr");
    expect(paysDuTexte("Chaussée de Louvain, Belgique")).toBe("be");
    // Une année n'est pas un code postal.
    expect(paysDuTexte("rue du 8 mai 1945")).toBeUndefined();
  });

  it("situe une adresse belge écrite à la main en Belgique, pas à Lille", async () => {
    const { point } = await AddressService.situer("12 rue de la station 4000 Liège");
    expect(point).toEqual({ latitude: 50.63, longitude: 5.57 });
  });

  it("retient l'adresse la plus proche de la boutique", async () => {
    const { point } = await AddressService.situer("12 rue de la station", {
      latitude: 50.6,
      longitude: 5.5,
    });
    expect(point).toEqual({ latitude: 50.63, longitude: 5.57 });
  });

  describe("repositionner une boutique dont l'adresse change", () => {
    const avant = { address: "12 rue de la station", city: "Lille", postalCode: "59000" };

    it("ne touche à rien si l'adresse n'a pas changé", async () => {
      expect(await AddressService.repositionner(avant, { ...avant, city: " lille " })).toBeNull();
    });

    it("prend la position de la suggestion retenue", async () => {
      const apres = { ...avant, city: "Liège", postalCode: "4000" };
      expect(await AddressService.repositionner(avant, apres, { latitude: 1, longitude: 2 })).toEqual({
        latitude: 1,
        longitude: 2,
        trouvee: true,
      });
    });

    it("situe la nouvelle adresse, belge comprise", async () => {
      const apres = { ...avant, city: "Liège", postalCode: "4000" };
      expect(await AddressService.repositionner(avant, apres)).toEqual({
        latitude: 50.63,
        longitude: 5.57,
        trouvee: true,
      });
    });

    it("efface la position plutôt que de garder l'ancienne si l'adresse est introuvable", async () => {
      global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })) as any;
      const apres = { ...avant, address: "nulle part" };
      expect(await AddressService.repositionner(avant, apres)).toEqual({
        latitude: null,
        longitude: null,
        trouvee: false,
      });
    });
  });
});
