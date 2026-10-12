import { afterEach, expect, jest, test } from "@jest/globals";

const queryRaw = jest.fn(async () => [] as unknown[]);
const db = { $queryRaw: queryRaw, user: { findMany: jest.fn() } };
const redis = { configure: true, pret: false };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../notifications/email.config", () => ({ emailTransporter: { verify: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ etatTempsReel: () => ({ redis: { configure: true, pret: false } }) }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail: jest.fn() } }));
jest.mock("../../notifications/notifier.service", () => ({ Notifier: { canaux: {} } }));
jest.mock("../surveillance.service", () => ({
  Surveillance: { processus: () => ({ dureeFonctionnementS: 7 }) },
  resumeErreur: () => "erreur interne à ne pas exposer",
}));
jest.mock("../disponibilite.service", () => ({ Disponibilite: {} }));
jest.mock("../supervision-metier.service", () => ({ controlesMetier: jest.fn() }));
jest.mock("../../../middleware/throttle-stockage", () => ({ etatRedisCadence: () => redis }));

import { Vigie } from "../vigie.service";

const envOriginal = { nodeEnv: process.env.NODE_ENV, clam: process.env.CLAMAV_HOST };
afterEach(() => {
  process.env.NODE_ENV = envOriginal.nodeEnv;
  if (envOriginal.clam === undefined) delete process.env.CLAMAV_HOST;
  else process.env.CLAMAV_HOST = envOriginal.clam;
  jest.clearAllMocks();
});

test("une panne PostgreSQL retire la readiness sans exposer le détail interne", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.CLAMAV_HOST;
  db.$queryRaw.mockRejectedValue(new Error("password=secret host=db.internal"));
  redis.pret = true;

  const etat = await Vigie.pret();

  expect(etat.pret).toBe(false);
  expect(etat.dependances).toEqual({ base: "indisponible", redis: "disponible" });
  expect(JSON.stringify(etat)).not.toMatch(/secret|internal|password/);
});

test("Redis indisponible retire la readiness en production mais pas la liveness", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.CLAMAV_HOST;
  db.$queryRaw.mockResolvedValue([]);
  redis.pret = false;

  const etat = await Vigie.pret();

  expect(etat.pret).toBe(false);
  expect(etat.dependances.redis).toBe("indisponible");
  expect(etat.fonctions.traficGeneral).toBe("indisponible");
});

test("SMTP et antivirus non configurés ne retirent pas la readiness générale", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.CLAMAV_HOST;
  db.$queryRaw.mockResolvedValue([]);
  redis.pret = true;

  await expect(Vigie.pret()).resolves.toMatchObject({ pret: true, fonctions: { depotDocuments: "indisponible" } });
});
