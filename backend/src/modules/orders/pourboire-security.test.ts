import { db } from '../../services/db';
import { stripe } from '../payments/stripe';
import { PourboireService } from './pourboire.service';

jest.mock('../../services/db', () => ({ db: { $transaction: jest.fn(), order: { findUnique: jest.fn() }, courierTip: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() } } }));
jest.mock('../payments/stripe', () => ({ stripe: { paymentIntents: { create: jest.fn(), retrieve: jest.fn(), update: jest.fn() } }, STRIPE_CONFIG: { currency: 'eur' } }));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../config/env', () => ({ getEnv: () => ({ ENABLE_STRIPE: true }) }));
jest.mock('../realtime/socket', () => ({ emitNotification: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks(); process.env.STRIPE_SECRET_KEY = 'sk_test_factice';
  (db.order.findUnique as jest.Mock).mockResolvedValue({
    id: 'commande', tipAmount: 0, deliveryMode: 'PLATFORM', deletedAt: null,
    delivery: { driverId: 'livreur', status: 'DELIVERED', deliveryTime: new Date() },
    pourboireApres: { stripePaymentIntentId: 'pi_tip', status: 'PENDING' },
  });
});
test('marquage payé et crédit du livreur passent ensemble par la transaction', async () => {
  (db.courierTip.findUnique as jest.Mock).mockResolvedValue({ id: 'tip', driverId: 'livreur', driver: { email: 'livreur@example.invalid' } });
  const tx = { courierTip: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, courier: { update: jest.fn().mockRejectedValue(new Error('crédit impossible')) } };
  (db.$transaction as jest.Mock).mockImplementation(async (traitement) => traitement(tx));
  await expect(PourboireService.marquerPaye({ id: 'pi_tip', amount_received: 200 } as any)).rejects.toThrow('crédit impossible');
  expect(db.courierTip.updateMany).not.toHaveBeenCalled();
  expect(tx.courierTip.updateMany).toHaveBeenCalledTimes(1);
  expect(tx.courier.update).toHaveBeenCalledWith({ where: { id: 'livreur' }, data: { totalEarnings: { increment: 2 } } });
});
afterEach(() => { delete process.env.STRIPE_SECRET_KEY; });

test.each(['processing', 'succeeded', 'requires_payment_method'])('réutilise le pourboire %s sans nouveau débit', async (status) => {
  (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({ id: 'pi_tip', amount: 200, status, client_secret: 'secret' });
  expect(await PourboireService.creerIntention('commande', 2)).toMatchObject({ paymentIntentId: 'pi_tip' });
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
test('changement de montant : actualise la même intention ouverte', async () => {
  (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({ id: 'pi_tip', amount: 100, status: 'requires_payment_method' });
  (stripe.paymentIntents.update as jest.Mock).mockResolvedValue({ id: 'pi_tip', amount: 200, client_secret: 'secret' });
  await PourboireService.creerIntention('commande', 2);
  expect(stripe.paymentIntents.update).toHaveBeenCalledWith('pi_tip', { amount: 200 });
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
test.each(['processing', 'succeeded'])('changement de montant pendant %s refusé', async (status) => {
  (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({ id: 'pi_tip', amount: 100, status });
  await expect(PourboireService.creerIntention('commande', 2)).rejects.toMatchObject({ code: 'TIP_PAYMENT_IN_PROGRESS' });
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
test('une intention annulée autorise un remplacement avec clé stable', async () => {
  (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({ id: 'pi_tip', status: 'canceled' });
  (stripe.paymentIntents.create as jest.Mock).mockResolvedValue({ id: 'pi_new', client_secret: 'secret' });
  await PourboireService.creerIntention('commande', 2);
  expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 200 }), { idempotencyKey: 'pourboire-commande-pi_tip' });
});
