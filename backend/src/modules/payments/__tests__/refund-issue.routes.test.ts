import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const service = { apercu: jest.fn<(...args: any[]) => Promise<any>>(), demander: jest.fn<(...args: any[]) => Promise<any>>(), reprendre: jest.fn<(...args: any[]) => Promise<any>>() };
jest.mock('../../orders/order-issue-refund.service', () => {
  const reel = jest.requireActual<any>('../../orders/order-issue-refund.service');
  return { ...reel, OrderIssueRefundService: service };
});
jest.mock('../../../services/db', () => ({ db: {
  user: { findUnique: async () => ({ email: 'admin@example.test' }) },
  platformRole: { findMany: async () => [
    { code: 'read', permissions: { billing: 'read' } }, { code: 'write', permissions: { billing: 'write' } },
    { code: 'support', permissions: { 'support-tickets': 'write' } },
    { code: 'other', permissions: {} }, { code: 'SUPER_ADMIN', permissions: {} }, { code: 'ADMIN', permissions: {} }, { code: 'SUPPORT', permissions: {} },
  ] },
} }));
jest.mock('../../auth/mfa.service', () => ({ exigerMfa: jest.fn(async () => undefined) }));
jest.mock('../../auth/auth.middleware', () => ({ authMiddleware: (req: any, res: any, next: any) => {
  const role = req.headers['x-test-role'];
  if (!role) return res.sendStatus(401);
  req.userId = 'admin1'; req.user = { userId: 'admin1' };
  req.compte = { id: 'admin1', isSuperOwner: role === 'owner', isSystemAdmin: role !== 'merchant', acces: { EAT: role } };
  next();
} }));
jest.mock('../../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../payment.service', () => ({ paymentService: {} }));
jest.mock('../refund.service', () => ({ RefundService: {} }));
import router from '../payments.admin.routes';

/** Exécute la chaîne Express réelle en mémoire, sans serveur ni port TCP. */
function appeler(method: 'get' | 'post', path: string, role: string | undefined, body?: unknown): Promise<any> {
  const route = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method])?.route;
  if (!route) throw new Error('Route absente');
  return new Promise((resolve, reject) => {
    let status = 200;
    const req: any = { path: path.replace(':id', 'd1'), params: { id: 'd1' }, method: method.toUpperCase(), headers: { 'x-test-role': role }, body };
    const res: any = { set: jest.fn(), status: (n: number) => { status = n; return res; },
      sendStatus: (n: number) => resolve({ status: n }), json: (data: any) => resolve({ status, data }) };
    let index = 0;
    const next = (err?: any) => {
      if (err) return resolve({ status: err.statusCode ?? (err.name === 'ZodError' ? 400 : 500), error: err });
      const couche = route.stack[index++];
      if (!couche) return reject(new Error('Réponse absente'));
      try { Promise.resolve(couche.handle(req, res, next)).catch(next); } catch (e) { next(e); }
    };
    next();
  });
}
const chemin = '/orders/issues/:id/refund';
const body = { mode: 'ITEMS', items: [{ lineId: 'l1', quantity: 1 }], reason: 'Article manquant confirmé.', expectedAmountCents: 900 };
beforeEach(() => {
  jest.clearAllMocks();
  service.apercu.mockResolvedValue({ available: true });
  service.demander.mockResolvedValue({ id: 'r1', status: 'REQUESTED', amountCents: 900 });
  service.reprendre.mockResolvedValue({ id: 'r1', status: 'RETRY' });
});
describe('routes de remboursement des incidents avec le vrai garde Facturation', () => {
  it.each([undefined, 'support', 'merchant', 'other', 'read'])('refuse la décision au profil %s', async (role) => {
    expect((await appeler('post', chemin, role, body)).status).toBe(role ? 403 : 401);
    expect(service.demander).not.toHaveBeenCalled();
  });
  it.each(['owner', 'write'])('enregistre la décision et l’acteur %s avant de répondre 202', async (role) => {
    expect(await appeler('post', chemin, role, body)).toMatchObject({ status: 202, data: { data: { status: 'REQUESTED' } } });
    expect(service.demander).toHaveBeenCalledWith('d1', 'admin1', body);
  });
  it('autorise la lecture Facturation sans ouvrir le droit d’écriture', async () => {
    expect((await appeler('get', chemin, 'read')).status).toBe(200);
    expect((await appeler('get', chemin, 'support')).status).toBe(403);
    expect(service.apercu).toHaveBeenCalledTimes(1);
  });
  it('rejette un montant libre et les paramètres supplémentaires avant le service', async () => {
    expect((await appeler('post', chemin, 'write', { ...body, amount: 9999 })).status).toBe(400);
    expect(service.demander).not.toHaveBeenCalled();
  });
  it('protège et journalise la reprise avec le même droit financier', async () => {
    expect((await appeler('post', chemin + '/retry', 'support', { reason: 'Vérification après panne.' })).status).toBe(403);
    expect((await appeler('post', chemin + '/retry', 'write', { reason: 'Vérification après panne.' })).status).toBe(202);
    expect(service.reprendre).toHaveBeenCalledWith('d1', 'admin1', 'Vérification après panne.');
  });
});
