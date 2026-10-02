import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  store: { findUnique: jest.fn(), update: jest.fn(async ({ data }: any) => ({ id: "s1", ...data })) },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../customers/address.service", () => ({ AddressService: {} }));
jest.mock("../../merchants/merchant-profile.service", () => ({ verifierLaTva: jest.fn() }));

import { StoreSettingsService } from "../store-settings.service";

describe("photo de couverture d'un commerce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("s'enregistre à côté du logo sans toucher aux autres réglages", async () => {
    db.store.findUnique.mockResolvedValue({ id: "s1", settings: { logo: "https://x/logo.png", currency: "EUR" } });

    const store = await StoreSettingsService.uploadBanner("s1", "https://x/couverture.jpg");

    expect(db.store.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { settings: { logo: "https://x/logo.png", currency: "EUR", banner: "https://x/couverture.jpg" } },
    });
    expect((store.settings as any).banner).toBe("https://x/couverture.jpg");
  });

  it("se retire en gardant le logo et les autres réglages", async () => {
    db.store.findUnique.mockResolvedValue({
      id: "s1",
      settings: { logo: "https://x/logo.png", banner: "https://x/couverture.jpg", currency: "EUR" },
    });

    await StoreSettingsService.removeBanner("s1");

    expect(db.store.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { settings: { logo: "https://x/logo.png", currency: "EUR" } },
    });
  });

  it("refuse un commerce inconnu", async () => {
    db.store.findUnique.mockResolvedValue(null);

    await expect(StoreSettingsService.removeBanner("inconnu")).rejects.toMatchObject({ statusCode: 404 });
    expect(db.store.update).not.toHaveBeenCalled();
  });
});
