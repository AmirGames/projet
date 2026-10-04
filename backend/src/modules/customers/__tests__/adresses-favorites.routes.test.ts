import express from "express";
import request from "supertest";

const db: any = {
  customer: {
    update: jest.fn(async ({ data }: any) => data),
    findUnique: jest.fn(async () => ({ savedAddresses: [] })),
  },
  order: { findMany: jest.fn(async () => []) },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({
  getEnv: () => ({
    NODE_ENV: "test",
    JWT_SECRET: "a".repeat(40),
    API_URL: "https://api.test",
    FRONTEND_URL: "https://test",
    LOG_LEVEL: "error",
    ENABLE_STRIPE: false,
  }),
}));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../realtime/socket", () => ({
  emitDeliveryUpdate: jest.fn(),
  emitNotification: jest.fn(),
  emitOrderUpdate: jest.fn(),
  emitSupportEvent: jest.fn(),
}));
jest.mock("../../notifications/email.service", () => ({ EmailService: {} }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "sans session" });
    req.userId = token;
    next();
  },
}));
jest.mock("../fiche-client.service", () => ({
  ficheClientDuCompte: jest.fn(async (id: string) => ({
    id: `client-${id}`,
    address: null,
    city: null,
    postalCode: null,
    savedAddresses: [],
  })),
}));

import routes from "../client.routes";
const app = express();
app.use(express.json());
app.use("/api/client", routes);
app.use((error: any, _req: any, res: any, _next: any) =>
  res
    .status(error.name === "ZodError" ? 400 : error.statusCode || 500)
    .json({ error: error.message }),
);

const adresse = {
  id: "maison",
  kind: "HOME",
  name: "",
  street: "Rue Neuve 2",
  city: "Namur",
  postalCode: "5000",
  latitude: 50.46,
  longitude: 4.86,
};
beforeEach(() => jest.clearAllMocks());

test("l’écriture exige une session", async () => {
  const res = await request(app)
    .put("/api/client/me/addresses")
    .send({ addresses: [adresse] });
  expect(res.status).toBe(401);
  expect(db.customer.update).not.toHaveBeenCalled();
});

test("la lecture charge uniquement le carnet du compte connecté", async () => {
  db.customer.findUnique.mockResolvedValueOnce({
    savedAddresses: [{ ...adresse, name: "Domicile" }],
  });
  const res = await request(app)
    .get("/api/client/me/addresses?customerId=client-alice")
    .set("Authorization", "Bearer bob");
  expect(res.status).toBe(200);
  expect(db.customer.findUnique).toHaveBeenCalledWith({
    where: { id: "client-bob" },
    select: { savedAddresses: true },
  });
  expect(res.body.data[0]).toEqual(
    expect.objectContaining({
      kind: "HOME",
      name: "Domicile",
      street: adresse.street,
    }),
  );
});

test("Bob ne peut écrire que dans son carnet, même en fournissant l’identifiant d’Alice", async () => {
  const res = await request(app)
    .put("/api/client/me/addresses")
    .set("Authorization", "Bearer bob")
    .send({ customerId: "client-alice", addresses: [adresse] });
  expect(res.status).toBe(200);
  expect(db.customer.update).toHaveBeenCalledWith({
    where: { id: "client-bob" },
    data: {
      savedAddresses: [
        expect.objectContaining({ kind: "HOME", name: "Domicile" }),
      ],
    },
  });
  expect(res.body.data[0].label).toBe("Rue Neuve 2, Namur");
});

test("une liste invalide ne modifie pas le carnet", async () => {
  const res = await request(app)
    .put("/api/client/me/addresses")
    .set("Authorization", "Bearer alice")
    .send({ addresses: [adresse, { ...adresse, id: "autre" }] });
  expect(res.status).toBe(400);
  expect(db.customer.update).not.toHaveBeenCalled();
});
