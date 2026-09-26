import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  driver: { findUnique: jest.fn(), update: jest.fn() },
  pushDevice: { findMany: jest.fn(), deleteMany: jest.fn() },
};

jest.mock("../db", () => ({ db }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../config/socket", () => ({ emitMerchantEvent: jest.fn() }));
jest.mock("../email.service", () => ({ EmailService: { sendEmail: jest.fn() } }));

import { Notifier } from "../notifier.service";

const fetchMock = jest.fn(async (_url: string, _init?: any) => ({
  ok: true,
  json: async () => ({ data: [{ status: "ok" }] }),
}));

describe("Notifier.pushLivreur vers l'application livreur", () => {
  beforeEach(() => {
    (global as any).fetch = fetchMock;
    db.driver.findUnique.mockResolvedValue({ pushSubscription: null, userId: "user-1" });
    db.pushDevice.findMany.mockResolvedValue([{ token: "ExponentPushToken[abc]" }]);
  });

  it("pousse sur les téléphones de l'application livreur du compte", async () => {
    const envoye = await Notifier.pushLivreur("livreur-1", {
      title: "Commande prête",
      body: "Vous pouvez la prendre en charge.",
      url: "/driver/deliveries/course-42",
      tag: "commande-prete-course-42",
    });

    expect(envoye).toBe(true);
    expect(db.pushDevice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", app: "delivery" } })
    );
    const [message] = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(message).toMatchObject({
      to: "ExponentPushToken[abc]",
      title: "Commande prête",
      data: { deliveryId: "course-42", tag: "commande-prete-course-42" },
    });
    expect(message.channelId).toBeUndefined();
  });

  it("fait sonner une course proposée sur son canal, sans la retenter au-delà d'une minute", async () => {
    await Notifier.pushLivreur("livreur-1", {
      title: "Nouvelle course : 6,50 €",
      body: "Répondez vite !",
      url: "/driver",
      tag: "course-proposee",
      offerId: "offre-7",
    });

    const [message] = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(message).toMatchObject({
      channelId: "new-courses-v2",
      sound: "new_course_long.wav",
      ttl: 60,
      // Le bouton « Accepter », qui agit téléphone verrouillé.
      categoryId: "course_proposee",
      data: { offerId: "offre-7" },
    });
  });

  it("ne dérange personne quand aucun téléphone ni navigateur n'est abonné", async () => {
    db.pushDevice.findMany.mockResolvedValue([]);

    const envoye = await Notifier.pushLivreur("livreur-1", { title: "Fin de la pause", body: "…" });

    expect(envoye).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
