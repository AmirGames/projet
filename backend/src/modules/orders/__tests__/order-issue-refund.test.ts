import { beforeEach, describe, expect, it, jest } from '@jest/globals';
const db: any = {
  orderIssue: { findUnique: jest.fn() }, order: { updateMany: jest.fn() },
  refundOperation: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  refundOperationEvent: { create: jest.fn() }, systemAuditLog: { create: jest.fn() }, $transaction: jest.fn(),
};
jest.mock('../../../services/db', () => ({ db }));
import { OrderIssueRefundService, repartirArticles, montantQuantite, remboursementIncidentSchema } from '../order-issue-refund.service';

const demande = (extra = {}) => remboursementIncidentSchema.parse({ mode: 'ITEMS', items: [{ lineId: 'l1', quantity: 1 }], reason: 'Article manquant confirmé.', expectedAmountCents: 900, ...extra });
const op = (extra = {}) => ({ id: 'r1', supportIssueId: 'autre', kind: 'ISSUE_ITEMS', amountCents: 900, currency: 'eur', status: 'SUCCEEDED',
  items: [{ lineId: 'l1', quantity: 1, amountCents: 900 }], createdAt: new Date(), completedAt: new Date(), ...extra });
const dossier = (extra: any = {}, commande: any = {}, paiement: any = {}) => ({ id: 'd1', orderId: 'o1', requestRefund: true, status: 'OPEN',
  order: { id: 'o1', deletedAt: null, status: 'COMPLETED', paymentStatus: 'SUCCEEDED', totalAmount: 31, tipAmount: 2, discountAmount: 3,
    payments: [{ id: 'p1', amount: 33, currency: 'EUR', status: 'SUCCEEDED', stripePaymentIntentId: 'pi1', refundedAmount: null, refundOperations: [], ...paiement }],
    items: [{ id: 'l1', quantity: 2, total: 20, product: { name: 'Pizza' }, variant: null }, { id: 'l2', quantity: 1, total: 10, product: { name: 'Dessert' }, variant: null }], ...commande }, ...extra });
beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.orderIssue.findUnique.mockResolvedValue(dossier());
  db.refundOperation.create.mockImplementation(async ({ data }: any) => ({ status: 'REQUESTED', createdAt: new Date(), completedAt: null, ...data }));
});

describe('remboursements des incidents — calcul et décisions durables', () => {
  it('répartit exactement la remise, même avec des centimes indivisibles', () => {
    const lignes = repartirArticles([{ id: 'a', quantity: 3, total: 10 }, { id: 'b', quantity: 1, total: 10 }], .01);
    expect(lignes.map((l) => l.netCents)).toEqual([1000, 999]);
    expect([1, 2, 3].map((n) => montantQuantite(1000, 3, n))).toEqual([334, 667, 1000]);
    expect(lignes.reduce((s, i) => s + i.netCents, 0)).toBe(1999);
  });
  it.each([-1, 31, NaN])('refuse une remise incohérente %s', (remise) => {
    expect(() => repartirArticles([{ id: 'a', quantity: 1, total: 30 }], remise)).toThrow();
  });
  it('autorise le remboursement des frais même si les articles sont gratuits', async () => {
    db.orderIssue.findUnique.mockResolvedValue(dossier({}, { totalAmount: 3, tipAmount: 0, discountAmount: 0,
      items: [{ id: 'l1', quantity: 1, total: 0, product: { name: 'Article offert' }, variant: null }] }, { amount: 3 }));
    const etat = await OrderIssueRefundService.apercu('d1');
    expect(etat).toMatchObject({ available: true, remainingCents: 300, items: [{ netCents: 0 }] });
    await expect(OrderIssueRefundService.demander('d1', 'admin', demande({ mode: 'BALANCE', items: [], expectedAmountCents: 300 }))).resolves.toMatchObject({ amountCents: 300 });
  });
  it('propose les montants après remise sans fuite de secrets Stripe', async () => {
    const etat = await OrderIssueRefundService.apercu('d1');
    expect(etat).toMatchObject({ available: true, remainingCents: 3300, items: [{ netCents: 1800 }, { netCents: 900 }] });
    expect(JSON.stringify(etat)).not.toContain('pi1');
  });
  it('enregistre la décision, le journal financier et l’audit dans la transaction', async () => {
    const resultat = await OrderIssueRefundService.demander('d1', 'admin', demande());
    expect(resultat).toMatchObject({ amountCents: 900, status: 'REQUESTED', kind: 'ISSUE_ITEMS' });
    expect(db.refundOperation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ supportIssueId: 'd1', amountCents: 900,
      refundedBeforeCents: 0, idempotencyKey: 'incident-remboursement-d1', items: [{ lineId: 'l1', quantity: 1, amountCents: 900 }] }) });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: 'admin', action: 'ORDER_ISSUE_REFUND_REQUESTED' }) });
    expect(db.refundOperationEvent.create).toHaveBeenCalledTimes(1);
  });
  it('rembourse le solde incluant frais et pourboire après une restitution partielle', async () => {
    db.orderIssue.findUnique.mockResolvedValue(dossier({}, {}, { refundedAmount: 9, refundOperations: [op()] }));
    const resultat = await OrderIssueRefundService.demander('d1', 'admin', demande({ mode: 'BALANCE', items: [], expectedAmountCents: 2400 }));
    expect(resultat).toMatchObject({ kind: 'ISSUE_BALANCE', amountCents: 2400 });
    expect(db.refundOperation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ refundedBeforeCents: 900 }) });
  });
  it('décompte les unités déjà remboursées dans un autre dossier', async () => {
    db.orderIssue.findUnique.mockResolvedValue(dossier({}, {}, { refundedAmount: 9, refundOperations: [op()] }));
    await expect(OrderIssueRefundService.demander('d1', 'admin', demande({ items: [{ lineId: 'l1', quantity: 2 }], expectedAmountCents: 1800 }))).rejects.toMatchObject({ code: 'INVALID_REFUND_ITEMS' });
    expect(db.refundOperation.create).not.toHaveBeenCalled();
  });
  it.each([
    { items: [{ lineId: 'inconnue', quantity: 1 }] }, { items: [] },
    { items: [{ lineId: 'l1', quantity: 1 }, { lineId: 'l1', quantity: 1 }] },
    { mode: 'BALANCE', items: [{ lineId: 'l1', quantity: 1 }] },
  ])('refuse une sélection invalide %j', async (surcharge) => {
    await expect(OrderIssueRefundService.demander('d1', 'admin', demande(surcharge))).rejects.toMatchObject({ statusCode: 400 });
    expect(db.refundOperation.create).not.toHaveBeenCalled();
  });
  it('exige de confirmer de nouveau si le montant calculé a changé', async () => {
    await expect(OrderIssueRefundService.demander('d1', 'admin', demande({ expectedAmountCents: 1000 }))).rejects.toMatchObject({ code: 'REFUND_QUOTE_CHANGED' });
    expect(db.refundOperation.create).not.toHaveBeenCalled();
  });
  it.each([
    dossier({ requestRefund: false }), dossier({ status: 'REJECTED' }), dossier({}, { status: 'PREPARING' }),
    dossier({}, { paymentStatus: 'REFUNDED' }), dossier({}, {}, { status: 'PENDING' }),
    dossier({}, {}, { stripePaymentIntentId: null }), dossier({}, {}, { amount: 32 }), dossier({}, {}, { currency: 'USD' }),
    dossier({}, {}, { refundedAmount: 10 }), dossier({}, {}, { refundOperations: [op({ kind: 'FULL_ORDER' })] }),
    dossier({}, {}, { refundOperations: [op({ status: 'PROCESSING' })] }), dossier({}, {}, { refundOperations: [op({ status: 'ABANDONED' })] }),
  ])('refuse un paiement ou un dossier non remboursable %#', async (valeur) => {
    db.orderIssue.findUnique.mockResolvedValue(valeur);
    await expect(OrderIssueRefundService.demander('d1', 'admin', demande())).rejects.toMatchObject({ statusCode: 409 });
    expect((await OrderIssueRefundService.apercu('d1')).available).toBe(false);
    expect(db.refundOperation.create).not.toHaveBeenCalled();
  });
  it('reprend exactement le même remboursement après un double clic ou une réponse perdue', async () => {
    const existante = op({ supportIssueId: 'd1', reason: 'Article manquant confirmé.', status: 'REQUESTED' });
    db.orderIssue.findUnique.mockResolvedValue(dossier({}, {}, { refundOperations: [existante] }));
    expect(await OrderIssueRefundService.demander('d1', 'admin', demande())).toMatchObject({ id: 'r1', amountCents: 900 });
    expect(db.refundOperation.create).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    await expect(OrderIssueRefundService.demander('d1', 'admin', demande({ mode: 'BALANCE', items: [] }))).rejects.toMatchObject({ code: 'REFUND_ALREADY_REQUESTED' });
  });
  it('une reprise humaine conserve le payload, la clé Stripe et sa date initiale', async () => {
    db.refundOperation.findUnique.mockResolvedValue(op({ status: 'ABANDONED' }));
    db.refundOperation.update.mockResolvedValue(op({ status: 'RETRY' }));
    await OrderIssueRefundService.reprendre('d1', 'admin', 'Vérification après panne.');
    const data = db.refundOperation.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'RETRY', version: { increment: 1 } });
    expect(data).not.toHaveProperty('firstCallAt');
    expect(data).not.toHaveProperty('idempotencyKey');
    expect(data).not.toHaveProperty('amountCents');
  });
  it('ne vole pas le bail d’un worker encore actif', async () => {
    db.refundOperation.findUnique.mockResolvedValue(op({ status: 'PROCESSING', lockedUntil: new Date(Date.now() + 60_000) }));
    await expect(OrderIssueRefundService.reprendre('d1', 'admin', 'Vérifier le résultat.')).rejects.toMatchObject({ code: 'REFUND_BUSY' });
    expect(db.refundOperation.update).not.toHaveBeenCalled();
  });
  it('refuse les montants libres et quantités invalides dans le contrat HTTP', () => {
    expect(() => remboursementIncidentSchema.parse({ ...demande(), amount: 1 })).toThrow();
    expect(() => demande({ items: [{ lineId: 'l1', quantity: .5 }] })).toThrow();
    expect(() => demande({ expectedAmountCents: 0 })).toThrow();
  });
});
