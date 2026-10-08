import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../auth/auth.middleware";
import { paymentService } from "./payment.service";
import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";
import { limiterCadence } from '../../middleware/throttle';

const router = Router();
const limiterEnregistrementCartes = limiterCadence({
  nom: 'enregistrement-cartes', max: 20, fenetreMs: 60_000,
  cle: (req) => req.userId || req.ip || 'inconnue',
});

/** Le jeton est vérifié par authMiddleware ; on ne laisse jamais passer un identifiant vide. */
function utilisateurRequis(req: Request): string {
  if (!req.userId) throw new ApiError(401, "Non authentifié", "NOT_AUTHENTICATED");
  return req.userId;
}

const paymentMethodInput = z.object({
  paymentMethodId: z.string().min(1),
  storeId: z.string().min(1),
  isDefault: z.boolean().optional(),
});

// GET /payment-methods - Get user payment methods
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = utilisateurRequis(req);
    const methods = await paymentService.getUserPaymentMethods(userId);

    res.json({ success: true, data: methods });
  } catch (err) {
    next(err);
  }
});

// POST /payment-methods/setup-intent - Préparer l'ajout d'une carte
router.post("/setup-intent", authMiddleware, limiterEnregistrementCartes, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = utilisateurRequis(req);
    res.status(201).json({ success: true, data: await paymentService.preparerEnregistrementCarte(userId) });
  } catch (err) {
    next(err);
  }
});

// POST /payment-methods - Save payment method
router.post("/", authMiddleware, limiterEnregistrementCartes, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = utilisateurRequis(req);
    const input = paymentMethodInput.parse(req.body);

    const method = await paymentService.savePaymentMethod(
      userId,
      input.paymentMethodId,
      input.storeId,
      input.isDefault
    );

    res.status(201).json({ success: true, data: method });
  } catch (err) {
    next(err);
  }
});

// DELETE /payment-methods/:id - Delete payment method
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = utilisateurRequis(req);
    await paymentService.deletePaymentMethod(req.params.id as string, userId);
    res.json({ success: true, message: "Méthode de paiement supprimée" });
  } catch (err) {
    next(err);
  }
});

export default router;
