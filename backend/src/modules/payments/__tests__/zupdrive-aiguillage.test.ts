import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Stripe from "stripe";

type Fn = jest.Mock<(...args: any[]) => any>;
const fn = () => jest.fn() as Fn;

const SECRET = "whsec_test_secret";
const vraiStripe = new Stripe("sk_test_factice");

const db: any = {
  refundOperation: { findFirst: jest.fn(async () => null) },
  $transaction: fn(),
  order: { findUnique: fn(), findMany: fn(), update: fn(), updateMany: fn() },
  payment: { findFirst: fn(), upsert: fn(), update: fn(), updateMany: fn() },
  stripeEvent: { create: fn(), findUnique: fn(), update: fn() },
  paymentIntentDrive: { findUnique: fn(), updateMany: fn() },
  driverPayoutDrive: { upsert: fn() },
  platformSettingsDrive: { findUnique: fn() },
};
const stripe: any = {
  webhooks: vraiStripe.webhooks,
  paymentIntents: { create: fn(), retrieve: fn(), cancel: fn() },
  refunds: { create: fn(), retrieve: fn(), list: fn() },
  charges: { retrieve: fn() },
};
jest.mock("../refund.service", () => ({ RefundService: { reveiller: async () => false } }));
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../stripe", () => ({ stripe, STRIPE_CONFIG: { currency: "eur", webhookSecret: SECRET } }));
jest.mock("../../marketing/promotion.service", () => ({ PromotionService: { libererUtilisation: fn() } }));
jest.mock("../../jobs/outbox.service", () => ({ Outbox: { enregistrer: fn(), traiterLesDus: fn() } }));
jest.mock("../../orders/order.service", () => ({ OrderService: { annoncerAuCommercant: fn() } }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
import { paymentService } from "../payment.service";

let numero = 0;
/** Un événement Stripe signé comme Stripe le ferait, avec son corps brut. */
function evenement(type: string, objet: Record<string, unknown>) {
  const corps = JSON.stringify({ id: `evt_${++numero}`, object: "event", type, data: { object: { object: type.split(".")[0], ...objet } } });
  const signature = vraiStripe.webhooks.generateTestHeaderString({ payload: corps, secret: SECRET });
  return { corps, signature };
}
const intention = (extra: Record<string, unknown> = {}) => ({
  id: "pi_drive", status: "succeeded", currency: "eur", amount: 1500, amount_received: 1500, metadata: { courseId: "course-1" }, ...extra,
});
const paiementDrive = (extra: Record<string, unknown> = {}) => ({
  id: "pay-1", courseId: "course-1", stripeId: "pi_drive", status: "REQUIRES_PAYMENT_METHOD", amountCentimes: 1500, driverEarningsCentimes: 1200,
  course: { chauffeurId: "c1", statut: "TERMINEE" }, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.stripeEvent.create.mockResolvedValue({});
  db.stripeEvent.update.mockResolvedValue({});
  db.paymentIntentDrive.findUnique.mockResolvedValue(paiementDrive());
  db.paymentIntentDrive.updateMany.mockResolvedValue({ count: 1 });
  db.driverPayoutDrive.upsert.mockResolvedValue({ id: "po-1" });
});

describe("webhook Stripe : les paiements de courses ZupDrive", () => {
  it("un payment_intent.succeeded signé d'une course confirme le paiement ZupDrive, pas une commande ZupEat", async () => {
    const { corps, signature } = evenement("payment_intent.succeeded", intention());
    await paymentService.handleWebhook(corps, signature);

    expect(db.paymentIntentDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }));
    expect(db.order.updateMany).not.toHaveBeenCalled();
    expect(db.payment.upsert).not.toHaveBeenCalled();
    // L'événement est marqué traité : Stripe cesse de le renvoyer.
    expect(db.stripeEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ processedAt: expect.any(Date) }) }));
  });

  it("une signature invalide ne confirme rien (le frontend n'est jamais la source de vérité)", async () => {
    const { corps } = evenement("payment_intent.succeeded", intention());
    await expect(paymentService.handleWebhook(corps, "t=1,v1=faux")).rejects.toMatchObject({ code: "STRIPE_SIGNATURE_INVALID" });
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });

  it("le même événement livré deux fois n'est traité qu'une fois (journal StripeEvent)", async () => {
    const { corps, signature } = evenement("payment_intent.succeeded", intention());
    await paymentService.handleWebhook(corps, signature);
    db.stripeEvent.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    db.stripeEvent.findUnique.mockResolvedValue({ processedAt: new Date() });
    await paymentService.handleWebhook(corps, signature);
    expect(db.paymentIntentDrive.updateMany).toHaveBeenCalledTimes(1);
  });

  it("un montant incorrect fait échouer l'événement (journalisé, rejoué par Stripe) sans rien confirmer", async () => {
    const { corps, signature } = evenement("payment_intent.succeeded", intention({ amount_received: 10, amount: 10 }));
    await expect(paymentService.handleWebhook(corps, signature)).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_MISMATCH" });
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
    expect(db.stripeEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastError: expect.stringContaining("Montant") } }));
  });

  it("échec et annulation d'une course passent par ZupDrive aussi", async () => {
    await paymentService.handleWebhook(...(Object.values(evenement("payment_intent.payment_failed", intention({ status: "requires_payment_method" }))) as [string, string]));
    await paymentService.handleWebhook(...(Object.values(evenement("payment_intent.canceled", intention({ status: "canceled", cancellation_reason: "abandoned" }))) as [string, string]));
    const donnees = db.paymentIntentDrive.updateMany.mock.calls.map(([a]: any[]) => a.data.status);
    expect(donnees).toEqual(["REQUIRES_PAYMENT_METHOD", "CANCELED"]);
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it("une intention de commande ZupEat (orderId) n'est pas prise pour une course", async () => {
    db.order.findUnique.mockResolvedValue(null);
    db.payment.findFirst.mockResolvedValue(null);
    const { corps, signature } = evenement("payment_intent.succeeded", intention({ metadata: { orderId: "o1", storeId: "s1" } }));
    await paymentService.handleWebhook(corps, signature);
    expect(db.paymentIntentDrive.findUnique).not.toHaveBeenCalled();
    expect(db.payment.findFirst).toHaveBeenCalled(); // chemin ZupEat
  });

  it("une course dont le paiement est inconnu est ignorée sans erreur", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(null);
    const { corps, signature } = evenement("payment_intent.succeeded", intention());
    await expect(paymentService.handleWebhook(corps, signature)).resolves.toBeDefined();
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });
});

describe("webhook Stripe : les remboursements d'une course ZupDrive", () => {
  it("charge.refunded d'une intention de course : le paiement ZupDrive suit Stripe, la commande ZupEat n'est pas touchée", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiementDrive({ status: "REFUND_REQUESTED" }));
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_1", status: "succeeded", amount: 1500 }] });
    const { corps, signature } = evenement("charge.refunded", { id: "ch_1", payment_intent: "pi_drive" });
    await paymentService.handleWebhook(corps, signature);
    expect(db.paymentIntentDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REFUNDED" } }));
    expect(db.order.update).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it("refund.updated « failed » : REFUND_FAILED, repris ensuite par le balayage", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(paiementDrive({ status: "REFUND_REQUESTED", stripeId: "pi_drive" }));
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_1", status: "failed", amount: 1500 }] });
    const { corps, signature } = evenement("refund.updated", { id: "re_1", status: "failed", payment_intent: "pi_drive" });
    await paymentService.handleWebhook(corps, signature);
    expect(db.paymentIntentDrive.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REFUND_FAILED" } }));
  });

  it("un remboursement d'une commande ZupEat suit son chemin habituel", async () => {
    db.paymentIntentDrive.findUnique.mockResolvedValue(null);
    stripe.charges.retrieve.mockResolvedValue({ id: "ch_2", payment_intent: "pi_commande", amount: 1000 });
    db.payment.findFirst.mockResolvedValue(null);
    const { corps, signature } = evenement("charge.refunded", { id: "ch_2", payment_intent: "pi_commande" });
    await paymentService.handleWebhook(corps, signature);
    expect(stripe.charges.retrieve).toHaveBeenCalledWith("ch_2");
    expect(db.paymentIntentDrive.updateMany).not.toHaveBeenCalled();
  });
});
