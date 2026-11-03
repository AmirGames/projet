import { beforeEach, describe, expect, it, jest } from '@jest/globals';
const db: any = {
  order: { findFirst: jest.fn() },
  orderIssue: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
  systemAuditLog: { create: jest.fn() }, $transaction: jest.fn(),
};
jest.mock('../../../services/db', () => ({ db }));
import { OrderIssueService, incidentCommandeSchema } from '../order-issue.service';

const now = Date.parse('2026-11-03T12:00:00Z');
const commande = (extra = {}) => ({ id: 'o1', status: 'COMPLETED', paymentStatus: 'SUCCEEDED', submittedAt: new Date(now - 60_000), createdAt: new Date(now - 3600_000),
  delivery: { status: 'DELIVERED' }, issues: [], items: [{ id: 'l1', quantity: 2, product: { name: 'Pizza' }, variant: { label: 'Grande' } }], ...extra });
const demande = (extra = {}) => incidentCommandeSchema.parse({ category: 'MISSING_ITEM', message: 'Il manque une pizza.', requestRefund: true, items: [{ lineId: 'l1', quantity: 1 }], ...extra });
beforeEach(() => {
  jest.clearAllMocks();
  db.order.findFirst.mockResolvedValue(commande());
  db.orderIssue.create.mockImplementation(async ({ data }: any) => ({ id: 'd1', status: 'OPEN', ...data }));
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.orderIssue.updateMany.mockResolvedValue({ count: 1 });
  db.orderIssue.findUnique.mockResolvedValue({ id: 'd1', orderId: 'o1', status: 'OPEN' });
  db.orderIssue.findUniqueOrThrow.mockResolvedValue({ id: 'd1', status: 'RESOLVED' });
});

describe('incidents de commandes', () => {
  it('présente les catégories et articles de la commande sans informations de paiement secrètes', async () => {
    const etat = await OrderIssueService.etat('o1', now);
    expect(etat.categories).toEqual(['MISSING_ITEM', 'WRONG_ORDER', 'OTHER']);
    expect(etat.items).toEqual([{ id: 'l1', quantity: 2, name: 'Pizza · Grande' }]);
    expect(etat).not.toHaveProperty('paymentStatus');
  });
  it('enregistre les articles depuis le serveur sans accepter de nom ou montant client', async () => {
    const dossier = await OrderIssueService.signaler('o1', demande(), now);
    expect(dossier).toMatchObject({ status: 'OPEN', items: [{ lineId: 'l1', quantity: 1, name: 'Pizza · Grande' }], requestRefund: true });
    expect(() => incidentCommandeSchema.parse({ ...demande(), amount: 999 })).toThrow();
  });
  it.each([
    { items: [{ lineId: 'etrangere', quantity: 1 }] }, { items: [{ lineId: 'l1', quantity: 3 }] },
    { items: [{ lineId: 'l1', quantity: 1 }, { lineId: 'l1', quantity: 1 }] }, { items: [] },
  ])('refuse un article ou une quantité invalide : %j', async ({ items }) => {
    await expect(OrderIssueService.signaler('o1', demande({ items }), now)).rejects.toMatchObject({ statusCode: 400 });
    expect(db.orderIssue.create).not.toHaveBeenCalled();
  });
  it('refuse les articles manquants avant remise et un signalement trop ancien', async () => {
    db.order.findFirst.mockResolvedValue(commande({ status: 'PREPARING', delivery: null }));
    await expect(OrderIssueService.signaler('o1', demande(), now)).rejects.toMatchObject({ code: 'ISSUE_NOT_AVAILABLE' });
    db.order.findFirst.mockResolvedValue(commande({ createdAt: new Date(now - 8 * 86400_000) }));
    expect((await OrderIssueService.etat('o1', now)).categories).toEqual([]);
  });
  it('propose le retard après quinze minutes uniquement pour une commande en cours', async () => {
    db.order.findFirst.mockResolvedValue(commande({ status: 'PREPARING', delivery: null, createdAt: new Date(now - 10 * 60_000) }));
    expect((await OrderIssueService.etat('o1', now)).categories).not.toContain('LATE_ORDER');
    expect((await OrderIssueService.etat('o1', now + 6 * 60_000)).categories).toContain('LATE_ORDER');
  });
  it('ne crée pas de dossier de remboursement pour un paiement non encaissé', async () => {
    db.order.findFirst.mockResolvedValue(commande({ paymentStatus: 'PENDING' }));
    await expect(OrderIssueService.signaler('o1', demande(), now)).rejects.toMatchObject({ code: 'REFUND_NOT_AVAILABLE' });
  });
  it('rend le dossier initial lors des doublons, même si la période de création est passée', async () => {
    const dossier = { id: 'd1', category: 'MISSING_ITEM', status: 'OPEN' };
    db.order.findFirst.mockResolvedValue(commande({ issues: [dossier] }));
    expect(await OrderIssueService.signaler('o1', demande(), now + 8 * 86400_000)).toEqual(dossier);
    expect(db.orderIssue.create).not.toHaveBeenCalled();
  });
  it('récupère le dossier si deux demandes concurrentes heurtent la contrainte unique', async () => {
    db.orderIssue.create.mockRejectedValue({ code: 'P2002' });
    await OrderIssueService.signaler('o1', demande(), now);
    expect(db.orderIssue.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { orderId_category: { orderId: 'o1', category: 'MISSING_ITEM' } } }));
  });
  it('journalise la réponse dans la même transaction et refuse une réponse concurrente', async () => {
    await OrderIssueService.repondre('d1', 'admin', 'RESOLVED', 'Nous avons examiné la demande.');
    expect(db.systemAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adminId: 'admin', action: 'ORDER_ISSUE_RESPONSE' }) }));
    db.orderIssue.updateMany.mockResolvedValue({ count: 0 });
    db.systemAuditLog.create.mockClear();
    await expect(OrderIssueService.repondre('d1', 'admin', 'REJECTED', 'Votre demande est refusée.')).rejects.toMatchObject({ code: 'ISSUE_ALREADY_HANDLED' });
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
  it('ne permet pas de remplacer une réponse déjà publiée', async () => {
    db.orderIssue.findUnique.mockResolvedValue({ id: 'd1', status: 'RESOLVED', response: 'Première réponse.' });
    await expect(OrderIssueService.repondre('d1', 'admin', 'REJECTED', 'Autre réponse.')).rejects.toMatchObject({ code: 'ISSUE_ALREADY_HANDLED' });
  });
});
