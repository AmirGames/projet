import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  customer: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  storeCustomer: { upsert: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../delivery/delivery-mode.service", () => ({ totalCommercant: () => 0 }));

import { CustomerService } from "../customer.service";

const fiche = { id: "cli-1", name: "Alice", email: "a@x.be", notes: "ancienne note globale", status: "BLOCKED", storeEntries: [] };

describe("carnet de clients par boutique", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.customer.findFirst.mockResolvedValue(fiche);
    db.storeCustomer.upsert.mockImplementation(async ({ update }: any) => ({ notes: null, status: "ACTIVE", ...update }));
  });

  it("le blocage s'écrit dans le carnet de la boutique, jamais sur la fiche globale", async () => {
    const res: any = await CustomerService.blockCustomer("store-A", "cli-1");

    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.storeCustomer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId_customerId: { storeId: "store-A", customerId: "cli-1" } } })
    );
    expect(res.status).toBe("BLOCKED");
  });

  it("la suppression retire du carnet de la boutique sans toucher à deletedAt global", async () => {
    await CustomerService.deleteCustomer("store-A", "cli-1");

    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.storeCustomer.upsert.mock.calls[0][0].update.hiddenAt).toBeInstanceOf(Date);
  });

  it("la modification ne porte que sur notes et statut", async () => {
    await CustomerService.updateCustomer("store-A", "cli-1", { notes: "VIP" });

    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.storeCustomer.upsert.mock.calls[0][0].update).toEqual({ notes: "VIP" });
  });

  it("une autre boutique ne reçoit ni les notes ni le blocage de la fiche globale", async () => {
    db.customer.findMany.mockResolvedValue([{ ...fiche, orders: [], storeEntries: [] }]);
    db.customer.count.mockResolvedValue(1);

    const { data } = await CustomerService.getCustomers("store-B");

    expect(data[0].status).toBe("ACTIVE");
    expect(data[0].notes).toBeNull();
  });

  it("une fiche retirée du carnet d'une boutique est exclue de sa liste et de ses accès", async () => {
    db.customer.findMany.mockResolvedValue([]);
    db.customer.count.mockResolvedValue(0);
    await CustomerService.getCustomers("store-A");

    const where = db.customer.findMany.mock.calls[0][0].where;
    expect(where.storeEntries).toEqual({ none: { storeId: "store-A", hiddenAt: { not: null } } });
    expect(where.deletedAt).toBeNull();
  });
});
