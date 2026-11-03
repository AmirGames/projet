import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { RefundOperation } from '@prisma/client';
const db: any = {
  payment: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), update: jest.fn() }, order: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  refundOperation: { updateMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), createMany: jest.fn(), update: jest.fn() }, refundOperationEvent: { create: jest.fn() }, systemAuditLog: { create: jest.fn() }, $transaction: jest.fn(),
};
const stripe: any = { paymentIntents: { retrieve: jest.fn() }, refunds: { list: jest.fn(), create: jest.fn() } };
jest.mock('../../../services/db', () => ({ db }));
jest.mock('../stripe', () => ({ stripe }));
jest.mock('../../../config/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
import { RefundService } from '../refund.service';
const now = new Date('2026-11-03T12:00:00Z');
const operation = (extra = {}) => ({ id: 'r1', paymentId: 'p1', paymentIntentId: 'pi1', supportIssueId: 'd1', kind: 'ISSUE_ITEMS',
  amountCents: 900, refundedBeforeCents: 0, currency: 'eur', reason: 'Article manquant.', idempotencyKey: 'stable1',
  status: 'PROCESSING', version: 2, attempts: 1, firstCallAt: null, stripeRefundId: null, ...extra } as RefundOperation);
const remboursement = (extra = {}) => ({ id: 're1', amount: 900, currency: 'eur', payment_intent: 'pi1', status: 'succeeded', metadata: { refundOperationId: 'r1' }, ...extra });
beforeEach(() => {
  jest.restoreAllMocks(); jest.resetAllMocks();
  db.payment.findUniqueOrThrow.mockResolvedValue({ id: 'p1', orderId: 'o1', amount: 33, currency: 'EUR', stripePaymentIntentId: 'pi1', refundedAmount: null });
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi1', status: 'succeeded', currency: 'eur', amount_received: 3300 });
  stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
  stripe.refunds.create.mockResolvedValue(remboursement());
  db.refundOperation.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('remboursement partiel Stripe — réconciliation et idempotence', () => {
  it('conserve le moteur de remboursement total et sa clé historique', async () => {
    stripe.refunds.create.mockResolvedValue(remboursement({ amount: 3300 }));
    const terminer = jest.spyOn(RefundService, 'terminer').mockResolvedValue(undefined);
    await RefundService.executer(operation({ kind: 'FULL_ORDER', amountCents: 3300, idempotencyKey: 'a03-remboursement-p1' }), now);
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 3300 }), { idempotencyKey: 'a03-remboursement-p1' });
    expect(terminer).toHaveBeenCalledWith(expect.anything(), 'SUCCEEDED', expect.objectContaining({ refundedCents: 3300 }), now);
  });
  it('ne mélange pas un nouveau remboursement total avec les décisions d’incident', async () => {
    db.order.findUnique.mockResolvedValue({ paymentStatus: 'SUCCEEDED', totalAmount: 33, payments: [{ id: 'p1', stripePaymentIntentId: 'pi1', amount: 33, currency: 'EUR' }] });
    db.refundOperation.findFirst.mockResolvedValue(operation());
    await expect(RefundService.enregistrerPourCommande(db, 'o1', 'Demande totale')).rejects.toMatchObject({ code: 'REFUND_USE_ISSUE' });
    expect(db.refundOperation.createMany).not.toHaveBeenCalled();
  });
  it('crée uniquement le montant figé, avec une clé stable et sans texte privé dans Stripe', async () => {
    const terminer = jest.spyOn(RefundService, 'terminer').mockResolvedValue(undefined);
    await RefundService.executer(operation(), now);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi1', amount: 900, reason: 'requested_by_customer', metadata: { refundOperationId: 'r1' } }, { idempotencyKey: 'stable1' });
    expect(db.refundOperation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(stripe.refunds.create.mock.invocationCallOrder[0]);
    expect(terminer).toHaveBeenCalledWith(expect.anything(), 'SUCCEEDED', expect.objectContaining({ refundedCents: 900 }), now);
  });
  it('retrouve un succès dont la réponse a été perdue sans second remboursement', async () => {
    stripe.refunds.list.mockResolvedValue({ data: [remboursement()], has_more: false });
    const terminer = jest.spyOn(RefundService, 'terminer').mockResolvedValue(undefined);
    await RefundService.executer(operation(), now);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(terminer).toHaveBeenCalledWith(expect.anything(), 'SUCCEEDED', expect.objectContaining({ refundedCents: 900, stripeRefundId: 're1' }), now);
  });
  it('rembourse le solde après un remboursement réussi dans un autre dossier', async () => {
    stripe.refunds.list.mockResolvedValue({ data: [remboursement({ metadata: { refundOperationId: 'autre' } })], has_more: false });
    stripe.refunds.create.mockResolvedValue(remboursement({ id: 're2', amount: 2400 }));
    const terminer = jest.spyOn(RefundService, 'terminer').mockResolvedValue(undefined);
    await RefundService.executer(operation({ kind: 'ISSUE_BALANCE', amountCents: 2400, refundedBeforeCents: 900 }), now);
    expect(stripe.refunds.create.mock.calls[0][0].amount).toBe(2400);
    expect(terminer).toHaveBeenCalledWith(expect.anything(), 'SUCCEEDED', expect.objectContaining({ refundedCents: 3300 }), now);
  });
  it.each(['pending', 'requires_action', 'failed', 'canceled'])('un remboursement connu %s ne produit aucun nouvel appel de création', async (status) => {
    stripe.refunds.list.mockResolvedValue({ data: [remboursement({ status })], has_more: false });
    const terminer = jest.spyOn(RefundService, 'terminer').mockResolvedValue(undefined);
    await RefundService.executer(operation(), now);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(terminer.mock.calls[0][1]).toBe(['failed', 'canceled'].includes(status) ? 'ABANDONED' : 'WAITING_STRIPE');
    expect(terminer.mock.calls[0][2]).toMatchObject({ refundedCents: 0 });
  });
  it.each(['succeeded', 'pending'])('une restitution externe %s bloque la nouvelle création', async (status) => {
    stripe.refunds.list.mockResolvedValue({ data: [remboursement({ status, metadata: {} })], has_more: false });
    const terminer = jest.spyOn(RefundService, 'terminer').mockResolvedValue(undefined);
    await RefundService.executer(operation(), now);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(terminer).toHaveBeenCalledWith(expect.anything(), 'ABANDONED', expect.objectContaining({ lastError: 'REFUND_EXTERNAL_CHANGE' }), now);
  });
  it('ne réutilise plus une clé incertaine après 23 heures', async () => {
    await expect(RefundService.executer(operation({ firstCallAt: new Date(now.getTime() - 23 * 3600_000) }), now)).rejects.toMatchObject({ code: 'REFUND_IDEMPOTENCY_WINDOW_EXPIRED' });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('un worker ayant perdu son bail ne crée pas de remboursement', async () => {
    db.refundOperation.updateMany.mockResolvedValue({ count: 0 });
    await RefundService.executer(operation(), now);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it.each([
    remboursement({ amount: 901 }), remboursement({ currency: 'usd' }), remboursement({ payment_intent: 'etranger' }),
  ])('refuse une référence Stripe incohérente %#', async (refund) => {
    stripe.refunds.list.mockResolvedValue({ data: [refund], has_more: false });
    await expect(RefundService.executer(operation(), now)).rejects.toMatchObject({ code: 'REFUND_AMOUNT_MISMATCH' });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('retrouve le remboursement au-delà de la première page Stripe', async () => {
    stripe.refunds.list.mockResolvedValueOnce({ data: [remboursement({ id: 'ancien', status: 'failed', metadata: {} })], has_more: true })
      .mockResolvedValueOnce({ data: [remboursement()], has_more: false });
    jest.spyOn(RefundService, 'terminer').mockResolvedValue(undefined);
    await RefundService.executer(operation(), now);
    expect(stripe.refunds.list).toHaveBeenLastCalledWith({ payment_intent: 'pi1', limit: 100, starting_after: 'ancien' });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('un succès partiel conserve le statut payé et écrit seulement le cumul réellement rendu', async () => {
    await RefundService.terminer(operation(), 'SUCCEEDED', { refundedCents: 900, stripeRefundId: 're1' }, now);
    expect(db.payment.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: expect.objectContaining({ refundedAmount: 9 }) });
    expect(db.payment.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(db.order.update).not.toHaveBeenCalled();
  });
  it('le dernier remboursement du solde marque la commande entièrement remboursée', async () => {
    await RefundService.terminer(operation({ amountCents: 2400, refundedBeforeCents: 900 }), 'SUCCEEDED', { refundedCents: 3300 }, now);
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { paymentStatus: 'REFUNDED' } });
    expect(db.payment.update.mock.calls[0][0].data).toMatchObject({ refundedAmount: 33, status: 'REFUNDED' });
  });
  it('ne diminue jamais un cumul plus récent écrit par un autre worker', async () => {
    db.payment.findUniqueOrThrow.mockResolvedValue({ id: 'p1', orderId: 'o1', amount: 33, refundedAmount: 18 });
    await RefundService.terminer(operation(), 'SUCCEEDED', { refundedCents: 900 }, now);
    expect(db.payment.update).not.toHaveBeenCalled();
  });
  it('une fin de bail périmée n’écrit ni audit financier ni paiement', async () => {
    db.refundOperation.updateMany.mockResolvedValue({ count: 0 });
    await RefundService.terminer(operation(), 'SUCCEEDED', { refundedCents: 900 }, now);
    expect(db.refundOperationEvent.create).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
  });
  it('la reprise financière par identifiant refuse une opération d’une autre commande', async () => {
    db.payment.findUnique.mockResolvedValue({ id: 'p1' });
    db.refundOperation.findUnique.mockResolvedValue(operation({ paymentId: 'etranger' }));
    await expect(RefundService.reprendre('o1', 'Vérifier le résultat.', 'admin', 'r1')).rejects.toMatchObject({ code: 'REFUND_NOT_RETRYABLE' });
    expect(db.refundOperation.update).not.toHaveBeenCalled();
  });
  it('la reprise financière reste possible après effacement du dossier personnel', async () => {
    db.payment.findUnique.mockResolvedValue({ id: 'p1' });
    db.refundOperation.findUnique.mockResolvedValue(operation({ supportIssueId: null, status: 'ABANDONED' }));
    db.refundOperation.update.mockResolvedValue(operation({ status: 'RETRY' }));
    await RefundService.reprendre('o1', 'Vérifier le résultat.', 'admin', 'r1');
    expect(db.refundOperation.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(db.refundOperation.update.mock.calls[0][0].data).not.toHaveProperty('firstCallAt');
  });
});
