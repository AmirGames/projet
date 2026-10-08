import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const declarer: any = jest.fn();
const envoyerEmailDuJournal: any = jest.fn();
const marquerEmailEchoue: any = jest.fn();
const envoyerEmailAlerte: any = jest.fn();

jest.mock("../../jobs/outbox.service", () => ({ Outbox: { declarer } }));
jest.mock("../email.service", () => ({ EmailService: {} }));
jest.mock("../../zupdrive/zupdrive-notifications.service", () => ({
  ZupDriveNotificationsService: { envoyerEmailDuJournal, marquerEmailEchoue },
}));
jest.mock("../../zupdrive/zupdrive-monitoring.service", () => ({ ZupDriveMonitoringService: { envoyerEmailAlerte } }));

import {
  TYPE_EMAIL_ALERTE_ZUPDRIVE,
  TYPE_EMAIL_NOTIFICATION_ZUPDRIVE,
  declarerGestionnairesOutbox,
} from "../outbox-handlers";

beforeEach(() => {
  jest.clearAllMocks();
  declarerGestionnairesOutbox();
});

const enregistre = (type: string) => declarer.mock.calls.find(([t]: any[]) => t === type);

describe("gestionnaires d'outbox ZupDrive", () => {
  it("l'e-mail d'une notification est envoyé via le journal, et l'abandon le marque FAILED", async () => {
    const [, gestionnaire, surAbandon] = enregistre(TYPE_EMAIL_NOTIFICATION_ZUPDRIVE);

    await gestionnaire({ logId: "log-1" });
    expect(envoyerEmailDuJournal).toHaveBeenCalledWith("log-1");

    await surAbandon({ logId: "log-1" }, "SMTP indisponible");
    expect(marquerEmailEchoue).toHaveBeenCalledWith("log-1", "SMTP indisponible");
  });

  it("l'e-mail d'une alerte de monitoring est envoyé par son identifiant", async () => {
    const [, gestionnaire, surAbandon] = enregistre(TYPE_EMAIL_ALERTE_ZUPDRIVE);
    await gestionnaire({ notificationId: "notif-1" });
    expect(envoyerEmailAlerte).toHaveBeenCalledWith("notif-1");
    // La notification reste en base et dans l'app : rien à marquer à l'abandon.
    expect(surAbandon).toBeUndefined();
  });
});
