import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * À quelle fiche client une nouvelle commande se rattache.
 *
 * Taper l'adresse d'un compte au passage de commande ne doit pas ajouter la
 * commande à l'historique de ce compte : seul le compte connecté y écrit.
 */

type Fiche = { id: string; email: string; userId: string | null; deletedAt: Date | null };

const users = [
  { id: "victime", email: "victime@mail.com" },
  { id: "moi", email: "moi@mail.com" },
];
let customers: Fiche[] = [];

const correspond = (ligne: Record<string, any>, where: Record<string, any>) =>
  Object.entries(where).every(([cle, valeur]) => ligne[cle] === valeur);

const db: any = {
  user: { findUnique: jest.fn(async ({ where }: any) => users.find((u) => correspond(u, where)) ?? null) },
  customer: {
    findUnique: jest.fn(async ({ where }: any) => customers.find((c) => correspond(c, where)) ?? null),
    create: jest.fn(async ({ data }: any) => {
      const fiche = { id: `fiche-${customers.length + 1}`, deletedAt: null, userId: null, ...data };
      customers.push(fiche);
      return fiche;
    }),
  },
};

jest.mock("../db", () => ({ db }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../config/socket", () => ({
  emitOrderUpdate: jest.fn(),
  emitNotification: jest.fn(),
  emitMerchantEvent: jest.fn(),
}));

import { OrderService } from "../order.service";

const resoudre = (data: Record<string, unknown>): Promise<string | undefined> =>
  (OrderService as any).resoudreClient({ customerName: "Quelqu'un", ...data });

beforeEach(() => {
  jest.clearAllMocks();
  customers = [
    { id: "fiche-victime", email: "victime@mail.com", userId: "victime", deletedAt: null },
    { id: "fiche-invite", email: "invite@mail.com", userId: null, deletedAt: null },
  ];
});

describe("Rattachement d'une commande à une fiche client", () => {
  it("n'ajoute pas une commande sans compte à la fiche d'un compte de même adresse", async () => {
    expect(await resoudre({ customerEmail: "victime@mail.com" })).toBeUndefined();
    expect(db.customer.create).not.toHaveBeenCalled();
  });

  it("n'y ajoute pas non plus celle d'un autre compte connecté", async () => {
    customers.push({ id: "fiche-moi", email: "moi@mail.com", userId: "moi", deletedAt: null });
    expect(await resoudre({ customerEmail: "victime@mail.com", userId: "moi" })).toBe("fiche-moi");

    customers = customers.filter((c) => c.id !== "fiche-moi");
    expect(await resoudre({ customerEmail: "victime@mail.com", userId: "moi" })).toBeUndefined();
  });

  it("range la commande du compte connecté dans sa fiche", async () => {
    expect(await resoudre({ customerEmail: "victime@mail.com", userId: "victime" })).toBe("fiche-victime");
  });

  it("regroupe les commandes sans compte sur la fiche invité de même adresse", async () => {
    expect(await resoudre({ customerEmail: "invite@mail.com" })).toBe("fiche-invite");
  });

  it("crée une fiche invité pour une adresse nouvelle, rattachée si c'est celle du compte connecté", async () => {
    await resoudre({ customerEmail: "nouveau@mail.com" });
    expect(customers.at(-1)).toMatchObject({ email: "nouveau@mail.com", userId: null });

    await resoudre({ customerEmail: "moi@mail.com", userId: "moi" });
    expect(customers.at(-1)).toMatchObject({ email: "moi@mail.com", userId: "moi" });
  });
});
