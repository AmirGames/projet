import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  notificationTemplate: { findUnique: jest.fn(), findMany: jest.fn() },
  notificationLog: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  chauffeurDrive: { findUnique: jest.fn() },
  pushDevice: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
const canaux = { sms: true, push: false, vapidPublicKey: null };
const Notifier: any = { sms: jest.fn(), expoPush: jest.fn() };
Object.defineProperty(Notifier, "canaux", { get: () => canaux });
const sendEmail: any = jest.fn();
const enregistrer: any = jest.fn();

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../notifications/notifier.service", () => ({ Notifier }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail } }));
jest.mock("../../jobs/outbox.service", () => ({ Outbox: { enregistrer, declarer: jest.fn() } }));

import { ZupDriveNotificationsService, interpoler } from "../zupdrive-notifications.service";

const gabarit = (extra: any = {}) => ({
  key: "DOCUMENT_EXPIRED",
  name: "Document expiré",
  type: "EMAIL",
  subject: "{{documentType}} expire le {{expiryDate}}",
  body: "Bonjour {{driverName}}, votre {{documentType}} expire le {{expiryDate}}. {{documentType}} !",
  variables: "[]",
  active: true,
  ...extra,
});
const journalCree = (data: any) => ({ id: "log-1", createdAt: new Date(), errorMessage: null, sentAt: null, failedAt: null, ...data });
const variables = { driverName: "Sam", documentType: "Licence", expiryDate: "2026-11-01" };
const envoi = (extra: any = {}) => ({
  recipientId: "ch-1",
  recipientType: "CHAUFFEUR" as const,
  templateKey: "DOCUMENT_EXPIRED",
  type: "EMAIL" as const,
  recipient: "sam@example.com",
  variables,
  ...extra,
});

beforeEach(() => {
  jest.resetAllMocks();
  canaux.sms = true;
  db.notificationTemplate.findUnique.mockResolvedValue(gabarit());
  db.notificationTemplate.findMany.mockResolvedValue([]);
  db.notificationLog.create.mockImplementation(async ({ data }: any) => journalCree(data));
  db.notificationLog.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  enregistrer.mockResolvedValue({ id: "msg-1" });
});

describe("interpolation des gabarits", () => {
  it("remplace toutes les occurrences d'une variable, pas seulement la première", () => {
    expect(interpoler("{{a}} et {{a}} et {{ a }}", { a: "X" })).toBe("X et X et X");
  });

  it("insère la valeur telle quelle : les motifs spéciaux de String.replace ($&, $1, $$) restent littéraux", () => {
    expect(interpoler("Bonjour {{nom}}", { nom: "$& $1 $$ $`" })).toBe("Bonjour $& $1 $$ $`");
  });

  it("ne réinterprète pas une valeur qui ressemble à une variable (pas d'injection d'une autre variable)", () => {
    expect(interpoler("{{a}} / {{b}}", { a: "{{b}}", b: "secret" })).toBe("{{b}} / secret");
  });

  it("laisse intacte une variable inconnue, ignore les clés héritées (__proto__, constructor)", () => {
    expect(interpoler("{{inconnue}} {{constructor}} {{__proto__}}", {})).toBe("{{inconnue}} {{constructor}} {{__proto__}}");
  });
});

describe("sendNotification : e-mail par l'outbox", () => {
  it("écrit le journal PENDING et l'intention d'envoi dans la même transaction, sans rien marquer SENT", async () => {
    const log = await ZupDriveNotificationsService.sendNotification(envoi());

    expect(log.status).toBe("PENDING");
    expect(log.subject).toBe("Licence expire le 2026-11-01");
    expect(log.body).toBe("Bonjour Sam, votre Licence expire le 2026-11-01. Licence !");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(enregistrer).toHaveBeenCalledWith(
      "zupdrive.notification_email",
      { logId: "log-1" },
      expect.objectContaining({ dedupeKey: "zupdrive.notification_email:log-1", tx: db })
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.notificationLog.updateMany).not.toHaveBeenCalled();
  });

  it("template absent ou inactif : 400, rien n'est écrit", async () => {
    db.notificationTemplate.findUnique.mockResolvedValue(gabarit({ active: false }));
    await expect(ZupDriveNotificationsService.sendNotification(envoi())).rejects.toMatchObject({ statusCode: 400 });
    expect(db.notificationLog.create).not.toHaveBeenCalled();
  });

  it("l'outbox envoie : le journal passe SENT seulement après l'envoi réussi", async () => {
    db.notificationLog.findUnique.mockResolvedValue(journalCree({ status: "PENDING", recipient: "sam@example.com", subject: "S", body: "Ligne 1\n<b>x</b>" }));
    sendEmail.mockResolvedValue({ success: true });

    await ZupDriveNotificationsService.envoyerEmailDuJournal("log-1");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@example.com", subject: "S", text: "Ligne 1\n<b>x</b>", html: expect.stringContaining("Ligne 1<br>&lt;b&gt;x&lt;/b&gt;") })
    );
    expect(db.notificationLog.updateMany).toHaveBeenCalledWith({
      where: { id: "log-1", status: "PENDING" },
      data: expect.objectContaining({ status: "SENT", sentAt: expect.any(Date) }),
    });
  });

  it("envoi en échec : le motif est noté, le journal reste PENDING (rejeu) et l'erreur remonte à l'outbox", async () => {
    db.notificationLog.findUnique.mockResolvedValue(journalCree({ status: "PENDING", recipient: "sam@example.com", subject: "S", body: "B" }));
    sendEmail.mockRejectedValue(new Error("SMTP indisponible"));

    await expect(ZupDriveNotificationsService.envoyerEmailDuJournal("log-1")).rejects.toThrow("SMTP indisponible");

    expect(db.notificationLog.updateMany).toHaveBeenCalledTimes(1);
    expect(db.notificationLog.updateMany).toHaveBeenCalledWith({
      where: { id: "log-1", status: "PENDING" },
      data: { errorMessage: "SMTP indisponible" },
    });
  });

  it("outbox qui abandonne : FAILED avec le motif", async () => {
    await ZupDriveNotificationsService.marquerEmailEchoue("log-1", "SMTP indisponible");
    expect(db.notificationLog.updateMany).toHaveBeenCalledWith({
      where: { id: "log-1", status: "PENDING" },
      data: expect.objectContaining({ status: "FAILED", failedAt: expect.any(Date), errorMessage: expect.stringContaining("SMTP indisponible") }),
    });
  });

  it("rejeu d'un message déjà envoyé (ou clos par un accusé) : aucun second e-mail", async () => {
    for (const status of ["SENT", "FAILED", "BOUNCED"]) {
      db.notificationLog.findUnique.mockResolvedValue(journalCree({ status, recipient: "sam@example.com", subject: "S", body: "B" }));
      await ZupDriveNotificationsService.envoyerEmailDuJournal("log-1");
    }
    db.notificationLog.findUnique.mockResolvedValue(null);
    await ZupDriveNotificationsService.envoyerEmailDuJournal("log-supprime");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendNotification : SMS et push immédiats", () => {
  it("SMS réussi : SENT", async () => {
    Notifier.sms.mockResolvedValue(true);
    const log = await ZupDriveNotificationsService.sendNotification(envoi({ type: "SMS", recipient: "+32470123456" }));

    expect(Notifier.sms).toHaveBeenCalledWith("+32470123456", "Bonjour Sam, votre Licence expire le 2026-11-01. Licence !");
    expect(log.status).toBe("SENT");
    expect(log.sentAt).toBeInstanceOf(Date);
    expect(enregistrer).not.toHaveBeenCalled();
    expect(db.notificationLog.updateMany).toHaveBeenCalledWith({ where: { id: "log-1", status: "PENDING" }, data: expect.objectContaining({ status: "SENT" }) });
  });

  it("SMS refusé par le fournisseur : FAILED avec motif, aucune exception (l'opération métier continue)", async () => {
    Notifier.sms.mockResolvedValue(false);
    const log = await ZupDriveNotificationsService.sendNotification(envoi({ type: "SMS", recipient: "+32470123456" }));

    expect(log.status).toBe("FAILED");
    expect(log.errorMessage).toMatch(/SMS refusé/);
    expect(log.failedAt).toBeInstanceOf(Date);
  });

  it("SMS dont l'envoi lève : FAILED avec le message, aucune exception", async () => {
    Notifier.sms.mockRejectedValue(new Error("réseau coupé"));
    const log = await ZupDriveNotificationsService.sendNotification(envoi({ type: "SMS", recipient: "+32470123456" }));
    expect(log).toMatchObject({ status: "FAILED", errorMessage: "réseau coupé" });
  });

  it("canal SMS non configuré : FAILED « non configuré », le fournisseur n'est pas appelé", async () => {
    canaux.sms = false;
    const log = await ZupDriveNotificationsService.sendNotification(envoi({ type: "SMS", recipient: "+32470123456" }));
    expect(log).toMatchObject({ status: "FAILED", errorMessage: "Canal SMS non configuré" });
    expect(Notifier.sms).not.toHaveBeenCalled();
  });

  it("push réussi : SENT ; jeton refusé : FAILED", async () => {
    Notifier.expoPush.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const ok = await ZupDriveNotificationsService.sendNotification(envoi({ type: "PUSH", recipient: "ExponentPushToken[abc]" }));
    expect(ok.status).toBe("SENT");
    expect(Notifier.expoPush).toHaveBeenCalledWith(["ExponentPushToken[abc]"], expect.objectContaining({ title: "Licence expire le 2026-11-01" }));

    const ko = await ZupDriveNotificationsService.sendNotification(envoi({ type: "PUSH", recipient: "mauvais" }));
    expect(ko).toMatchObject({ status: "FAILED", errorMessage: expect.stringMatching(/Push refusé/) });
  });

  it("un accusé déjà arrivé (BOUNCED) n'est pas écrasé : la mise à jour est gardée par status PENDING", async () => {
    Notifier.sms.mockResolvedValue(true);
    await ZupDriveNotificationsService.sendNotification(envoi({ type: "SMS", recipient: "+32470123456" }));
    expect(db.notificationLog.updateMany.mock.calls[0][0].where).toEqual({ id: "log-1", status: "PENDING" });
  });
});

describe("idempotence : le même événement ne produit pas deux envois", () => {
  const doublon = () => Object.assign(new Error("Unique constraint"), { code: "P2002" });

  it("clé déjà vue (SMS) : le journal existant est rendu, aucun nouvel envoi", async () => {
    db.notificationLog.create.mockRejectedValue(doublon());
    db.notificationLog.findUnique.mockResolvedValue(journalCree({ ...envoi(), type: "SMS", status: "SENT", subject: null, body: "B", variables: "{}", dedupeKey: "k1" }));

    const log = await ZupDriveNotificationsService.sendNotification(envoi({ type: "SMS", recipient: "+32470123456", dedupeKey: "k1" }));

    expect(log).toMatchObject({ deduplicated: true, status: "SENT" });
    expect(db.notificationLog.findUnique).toHaveBeenCalledWith({ where: { dedupeKey: "k1" } });
    expect(Notifier.sms).not.toHaveBeenCalled();
  });

  it("clé déjà vue (e-mail) : rien n'est remis dans l'outbox", async () => {
    db.$transaction.mockRejectedValue(doublon());
    db.notificationLog.findUnique.mockResolvedValue(journalCree({ ...envoi(), status: "PENDING", subject: "S", body: "B", variables: "{}", dedupeKey: "k1" }));

    const log = await ZupDriveNotificationsService.sendNotification(envoi({ dedupeKey: "k1" }));

    expect(log.deduplicated).toBe(true);
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it("une erreur de base autre qu'un doublon de clé n'est pas avalée", async () => {
    db.notificationLog.create.mockRejectedValue(new Error("base indisponible"));
    await expect(ZupDriveNotificationsService.sendNotification(envoi({ type: "SMS", recipient: "+32", dedupeKey: "k1" }))).rejects.toThrow("base indisponible");
  });

  describe("événement métier (DOCUMENT_EXPIRY)", () => {
    const chauffeur = (extra: any = {}) => ({ userId: "u1", telephone: "+32470123456", user: { email: "sam@example.com" }, ...extra });
    const clesEnvoyees = () => db.notificationLog.create.mock.calls.map(([a]: any[]) => a.data.dedupeKey);

    it("deux déclenchements du même document (variables dans un autre ordre) portent la même clé : une seule intention e-mail", async () => {
      db.chauffeurDrive.findUnique.mockResolvedValue(chauffeur());
      const ordre1 = { driverName: "Sam", documentType: "Licence", expiryDate: "2026-11-01" };
      const ordre2 = { expiryDate: "2026-11-01", documentType: "Licence", driverName: "Sam" };

      await ZupDriveNotificationsService.triggerEventNotification({ type: "DOCUMENT_EXPIRY", chauffeurId: "ch-1", variables: ordre1 });
      // Le second déclenchement bute sur la clé unique.
      db.$transaction.mockRejectedValueOnce(doublon());
      db.notificationLog.findUnique.mockResolvedValue(journalCree({ ...envoi(), status: "PENDING", subject: "S", body: "B", variables: "{}" }));
      const second = await ZupDriveNotificationsService.triggerEventNotification({ type: "DOCUMENT_EXPIRY", chauffeurId: "ch-1", variables: ordre2 });

      const [cle1] = clesEnvoyees();
      expect(cle1).toMatch(/^event:DOCUMENT_EXPIRY:ch-1:[0-9a-f]{32}:EMAIL$/);
      expect(db.$transaction).toHaveBeenCalledTimes(2);
      expect(db.notificationLog.create).toHaveBeenCalledTimes(1);
      expect(enregistrer).toHaveBeenCalledTimes(1);
      expect(second.logs[0]).toMatchObject({ deduplicated: true });
    });

    it("un document renouvelé (autre date d'expiration) est un autre événement : autre clé", async () => {
      db.chauffeurDrive.findUnique.mockResolvedValue(chauffeur());
      await ZupDriveNotificationsService.triggerEventNotification({ type: "DOCUMENT_EXPIRY", chauffeurId: "ch-1", variables });
      await ZupDriveNotificationsService.triggerEventNotification({ type: "DOCUMENT_EXPIRY", chauffeurId: "ch-1", variables: { ...variables, expiryDate: "2027-11-01" } });
      const [a, b] = clesEnvoyees();
      expect(a).not.toBe(b);
    });

    it("la clé fournie par l'appelant prime", async () => {
      db.chauffeurDrive.findUnique.mockResolvedValue(chauffeur());
      await ZupDriveNotificationsService.triggerEventNotification({ type: "DOCUMENT_EXPIRY", chauffeurId: "ch-1", variables, dedupeKey: "doc-42-2026-11" });
      expect(clesEnvoyees()).toEqual(["event:doc-42-2026-11:EMAIL"]);
    });
  });
});

describe("triggerEventNotification : canaux disponibles", () => {
  const chauffeur = (extra: any = {}) => ({ userId: "u1", telephone: "+32470123456", user: { email: "sam@example.com" }, ...extra });
  const evenement = { type: "DOCUMENT_EXPIRY" as const, chauffeurId: "ch-1", variables };

  it("chauffeur sans e-mail : aucun e-mail, aucune intention d'outbox, le canal ignoré est rapporté — sans exception", async () => {
    db.chauffeurDrive.findUnique.mockResolvedValue(chauffeur({ user: { email: null }, telephone: null }));

    const resultat = await ZupDriveNotificationsService.triggerEventNotification(evenement);

    expect(resultat.logs).toEqual([]);
    expect(resultat.ignores).toEqual(expect.arrayContaining([{ type: "EMAIL", motif: "Aucune adresse e-mail sur le compte" }]));
    expect(db.notificationLog.create).not.toHaveBeenCalled();
    expect(enregistrer).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("chauffeur sans e-mail mais avec téléphone et gabarit SMS : le SMS part quand même", async () => {
    db.chauffeurDrive.findUnique.mockResolvedValue(chauffeur({ user: { email: "" } }));
    db.notificationTemplate.findMany.mockResolvedValue([{ key: "DOCUMENT_EXPIRED_SMS" }]);
    db.notificationTemplate.findUnique.mockResolvedValue(gabarit({ key: "DOCUMENT_EXPIRED_SMS", type: "SMS", subject: null }));
    Notifier.sms.mockResolvedValue(true);

    const resultat = await ZupDriveNotificationsService.triggerEventNotification(evenement);

    expect(resultat.logs).toHaveLength(1);
    expect(resultat.logs[0]).toMatchObject({ type: "SMS", status: "SENT" });
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it("e-mail + SMS + push quand tout est disponible ; un canal en échec n'empêche pas les autres", async () => {
    db.chauffeurDrive.findUnique.mockResolvedValue(chauffeur());
    db.notificationTemplate.findMany.mockResolvedValue([{ key: "DOCUMENT_EXPIRED_SMS" }, { key: "DOCUMENT_EXPIRED_PUSH" }]);
    db.notificationTemplate.findUnique.mockImplementation(async ({ where }: any) => gabarit({ key: where.key }));
    db.pushDevice.findMany.mockResolvedValue([{ token: "ExponentPushToken[a]" }]);
    Notifier.sms.mockRejectedValue(new Error("Twilio en panne"));
    Notifier.expoPush.mockResolvedValue(1);

    const resultat = await ZupDriveNotificationsService.triggerEventNotification(evenement);

    expect(resultat.logs.map((l) => `${l.type}:${l.status}`)).toEqual(["EMAIL:PENDING", "SMS:FAILED", "PUSH:SENT"]);
    expect(db.pushDevice.findMany).toHaveBeenCalledWith({ where: { userId: "u1" }, select: { token: true } });
  });

  it("SMS ignoré avec son motif quand le canal n'est pas configuré ou sans gabarit", async () => {
    db.chauffeurDrive.findUnique.mockResolvedValue(chauffeur());
    canaux.sms = false;
    db.notificationTemplate.findMany.mockResolvedValue([{ key: "DOCUMENT_EXPIRED_SMS" }]);

    const resultat = await ZupDriveNotificationsService.triggerEventNotification(evenement);

    expect(resultat.ignores).toEqual(
      expect.arrayContaining([
        { type: "SMS", motif: "Canal SMS non configuré" },
        { type: "PUSH", motif: "Aucun gabarit push actif" },
      ])
    );
    expect(Notifier.sms).not.toHaveBeenCalled();
  });

  it("chauffeur inconnu : 404", async () => {
    db.chauffeurDrive.findUnique.mockResolvedValue(null);
    await expect(ZupDriveNotificationsService.triggerEventNotification(evenement)).rejects.toMatchObject({ statusCode: 404 });
  });
});
