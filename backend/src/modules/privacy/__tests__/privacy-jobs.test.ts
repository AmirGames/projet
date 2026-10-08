import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx: any = { $queryRaw: jest.fn() };
const db: any = {
  $transaction: jest.fn(),
  privacyErasureRequest: { count: jest.fn() },
};
const runRetention = jest.fn<(...args: any[]) => Promise<any>>();
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger }));
jest.mock("../retention.service", () => ({ runRetention: (...a: any[]) => runRetention(...a) }));
jest.mock("../../monitoring/surveillance.service", () => ({ Surveillance: {
  declarerTache: jest.fn(),
  executerTache: async (_id: string, tache: () => Promise<void>) => tache(),
} }));

import { PrivacyJobs } from "../privacy.jobs";

beforeEach(() => {
  PrivacyJobs.stop();
  db.$transaction.mockImplementation(async (callback: any) => callback(tx));
  tx.$queryRaw.mockResolvedValue([{ locked: true }]);
  db.privacyErasureRequest.count.mockResolvedValue(0);
  runRetention.mockResolvedValue({ accounting: 0 });
});

describe("tâche RGPD", () => {
  it("n'exécute rien si une autre instance détient le verrou", async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: false }]);
    await PrivacyJobs.run();
    expect(runRetention).not.toHaveBeenCalled();
  });

  it("purge sous le verrou et journalise le résultat", async () => {
    await PrivacyJobs.run();
    expect(runRetention).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Purge RGPD terminée", { accounting: 0 });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 120000 });
  });

  it("ne lance jamais deux purges en parallèle dans la même instance", async () => {
    let liberer!: () => void;
    runRetention.mockImplementation(() => new Promise(resolve => { liberer = () => resolve({}); }));
    const premiere = PrivacyJobs.run();
    await new Promise(resolve => setImmediate(resolve));
    await PrivacyJobs.run();
    expect(runRetention).toHaveBeenCalledTimes(1);
    liberer();
    await premiere;
  });

  it("libère le drapeau après un échec : la purge suivante repart", async () => {
    runRetention.mockRejectedValueOnce(new Error("panne"));
    await PrivacyJobs.run();
    expect(logger.error).toHaveBeenCalledWith("Purge RGPD en échec : consulter la surveillance et intervenir");
    await PrivacyJobs.run();
    expect(runRetention).toHaveBeenCalledTimes(2);
  });

  it("fait échouer la tâche (alerte DPO) quand une demande d'effacement dépasse 30 jours", async () => {
    db.privacyErasureRequest.count.mockResolvedValue(2);
    await PrivacyJobs.run();
    const { where } = db.privacyErasureRequest.count.mock.calls[0][0];
    expect(where.status).toBe("PENDING");
    expect(Date.now() - where.requestedAt.lt.getTime()).toBeGreaterThanOrEqual(30 * 86400000 - 5000);
    expect(logger.error).toHaveBeenCalled();
  });

  it("le démarrage est idempotent : un seul minuteur", () => {
    const setIntervalSpy = jest.spyOn(global, "setInterval");
    PrivacyJobs.start();
    PrivacyJobs.start();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    PrivacyJobs.stop();
    setIntervalSpy.mockRestore();
  });
});
