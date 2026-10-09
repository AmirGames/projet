import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  order: { count: jest.fn() },
  stripeEvent: { count: jest.fn() },
  payment: { count: jest.fn() },
  backup: { findFirst: jest.fn() },
};
const env: any = { NODE_ENV: "test", PAYOUTS_START_DATE: undefined };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => env }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const etatOutbox = jest.fn(async (_maintenant?: Date) => ({ enAttente: 0, echecs: 0, retardMs: 0 }));
jest.mock("../../jobs/outbox.service", () => ({ Outbox: { etat: (m?: Date) => etatOutbox(m) } }));

jest.mock("../../legal/pages-legales.service", () => ({ PagesLegalesService: { toutes: jest.fn(async () => []) } }));
import { DELAIS_METIER, aDesChampsAremplir, constatsDepuisMesures, mesurer, type MesuresMetier } from "../supervision-metier.service";

const calme: MesuresMetier = {
  commandesNonAnnoncees: 0,
  outbox: { enAttente: 0, echecs: 0, retardMs: 0 },
  webhooksBloques: 0,
  remboursementsEnAttente: 0,
  commandesNonReversees: null,
  ageSauvegardeMs: null,
  pagesLegalesACompleter: null,
};

describe("constatsDepuisMesures", () => {
  it("rien d'anormal : aucun incident", () => {
    expect(constatsDepuisMesures(calme)).toEqual([]);
    expect(constatsDepuisMesures({ ...calme, commandesNonReversees: 0, ageSauvegardeMs: 3_600_000 })).toEqual([]);
  });

  it("une commande payée non annoncée est critique", () => {
    const [c] = constatsDepuisMesures({ ...calme, commandesNonAnnoncees: 2 });
    expect(c).toMatchObject({ cle: "metier:commande-non-annoncee", niveau: "CRITIQUE" });
    expect(c.detail).toContain("2 commandes sont payées");
  });

  it("des messages abandonnés sont critiques ; un simple retard ne l'est pas", () => {
    expect(constatsDepuisMesures({ ...calme, outbox: { enAttente: 3, echecs: 1, retardMs: 0 } })[0]).toMatchObject({
      cle: "metier:outbox-echecs",
      niveau: "CRITIQUE",
    });
    expect(
      constatsDepuisMesures({ ...calme, outbox: { enAttente: 3, echecs: 0, retardMs: DELAIS_METIER.outboxEnRetard } })[0],
    ).toMatchObject({ cle: "metier:outbox-retard", niveau: "ATTENTION" });
    expect(constatsDepuisMesures({ ...calme, outbox: { enAttente: 3, echecs: 0, retardMs: 60_000 } })).toEqual([]);
  });

  it("un webhook bloqué, un remboursement en attente, des relevés manquants sont signalés", () => {
    const cles = constatsDepuisMesures({
      ...calme,
      webhooksBloques: 1,
      remboursementsEnAttente: 4,
      commandesNonReversees: 7,
    }).map((c) => c.cle);
    expect(cles).toEqual(["metier:webhook-bloque", "metier:remboursement-en-attente", "metier:releves-manquants"]);
  });

  it("sauvegarde : jamais faite ou trop ancienne", () => {
    expect(constatsDepuisMesures({ ...calme, ageSauvegardeMs: "aucune" })[0].cle).toBe("metier:sauvegarde");
    const vieille = constatsDepuisMesures({ ...calme, ageSauvegardeMs: 3 * 24 * 3_600_000 })[0];
    expect(vieille.cle).toBe("metier:sauvegarde");
    expect(vieille.detail).toContain("3 jours");
  });
});

describe("pages légales (C-32)", () => {
  it("distingue un champ à remplir d'un lien Markdown", () => {
    expect(aDesChampsAremplir("Éditeur : [Raison sociale], capital de [montant] €")).toBe(true);
    expect(aDesChampsAremplir("Écrire à [contact@zupeat.com](mailto:contact@zupeat.com)")).toBe(false);
    expect(aDesChampsAremplir("Texte complet, sans crochets.")).toBe(false);
  });

  it("signale les pages à compléter, et seulement elles", () => {
    expect(constatsDepuisMesures({ ...calme, pagesLegalesACompleter: [] })).toEqual([]);
    const [c] = constatsDepuisMesures({ ...calme, pagesLegalesACompleter: ["mentions-legales", "cgv"] });
    expect(c).toMatchObject({ cle: "metier:pages-legales", niveau: "ATTENTION" });
    expect(c.detail).toContain("mentions-legales, cgv");
  });

  it("les textes de départ ne mentionnent plus la plateforme européenne de règlement en ligne des litiges", () => {
    const { PAGES_LEGALES_DEFAUT } = jest.requireActual("../../../contenus/pages-legales.defaut") as typeof import("../../../contenus/pages-legales.defaut");
    const tout = Object.values(PAGES_LEGALES_DEFAUT).map((p: any) => p.contenu).join("\n");
    expect(tout).not.toMatch(/règlement en ligne des litiges/i);
    expect(tout).not.toMatch(/ec\.europa\.eu\/consumers\/odr/i);
  });
});

describe("mesurer", () => {
  const maintenant = new Date("2026-10-07T12:00:00Z"); // mercredi

  beforeEach(() => {
    jest.clearAllMocks();
    db.order.count.mockResolvedValue(0);
    db.stripeEvent.count.mockResolvedValue(0);
    db.payment.count.mockResolvedValue(0);
    db.backup.findFirst.mockResolvedValue(null);
    env.NODE_ENV = "test";
    env.PAYOUTS_START_DATE = undefined;
  });

  it("applique les délais de grâce aux requêtes", async () => {
    await mesurer(maintenant);

    const commandes = db.order.count.mock.calls[0][0].where;
    expect(commandes).toMatchObject({ paymentStatus: "SUCCEEDED", submittedAt: null, status: "PENDING", deletedAt: null });
    expect(commandes.payments.some.paidAt.lt.getTime()).toBe(maintenant.getTime() - DELAIS_METIER.commandeNonAnnoncee);

    const webhooks = db.stripeEvent.count.mock.calls[0][0].where;
    expect(webhooks.processedAt).toBeNull();
    expect(webhooks.receivedAt.lt.getTime()).toBe(maintenant.getTime() - DELAIS_METIER.webhookBloque);

    const remboursements = db.payment.count.mock.calls[0][0].where;
    expect(remboursements).toMatchObject({ status: "SUCCEEDED", stripeRefundId: { not: null }, refundedAt: null });
  });

  it("ne contrôle ni les relevés (reversements inactifs) ni la sauvegarde hors production", async () => {
    const m = await mesurer(maintenant);
    expect(m.commandesNonReversees).toBeNull();
    expect(m.ageSauvegardeMs).toBeNull();
    expect(db.backup.findFirst).not.toHaveBeenCalled();
  });

  it("en production, une base sans sauvegarde est « aucune »", async () => {
    env.NODE_ENV = "production";
    expect((await mesurer(maintenant)).ageSauvegardeMs).toBe("aucune");
    db.backup.findFirst.mockResolvedValue({ createdAt: new Date(maintenant.getTime() - 5 * 3_600_000) });
    expect((await mesurer(maintenant)).ageSauvegardeMs).toBe(5 * 3_600_000);
  });

  it("relevés : pas de contrôle le lundi avant midi, contrôle ensuite", async () => {
    env.PAYOUTS_START_DATE = "2026-09-01";
    const lundiTot = new Date("2026-10-05T04:00:00Z"); // lundi 06 h Bruxelles
    expect((await mesurer(lundiTot)).commandesNonReversees).toBeNull();

    db.order.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const lundiMidi = new Date("2026-10-05T15:00:00Z");
    expect((await mesurer(lundiMidi)).commandesNonReversees).toBe(3);
  });
});

it("alerte critique exploitable même sans identifiant de remboursement Stripe", () => {
  expect(constatsDepuisMesures({ ...calme, remboursementsAReprendre: 1 })).toEqual([
    expect.objectContaining({ cle: "metier:remboursements-a-reprendre", niveau: "CRITIQUE", detail: expect.stringContaining("/orders/refunds/review") }),
  ]);
});
