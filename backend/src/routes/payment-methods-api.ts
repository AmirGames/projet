import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { paymentService } from "../services/payment.service.js";
import { z } from "zod";

const router = Router();

const paymentMethodInput = z.object({
  paymentMethodId: z.string().min(1),
  isDefault: z.boolean().optional(),
});

// GET /payment-methods - Get user payment methods
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.userId;
    const methods = await paymentService.getUserPaymentMethods(userId);

    res.json({ success: true, data: methods });
  } catch (err) {
    next(err);
  }
});

// POST /payment-methods - Save payment method
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.userId;
    const input = paymentMethodInput.parse(req.body);

    const method = await paymentService.savePaymentMethod(
      userId,
      input.paymentMethodId,
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
    await paymentService.deletePaymentMethod(req.params.id);
    res.json({ success: true, message: "Méthode de paiement supprimée" });
  } catch (err) {
    next(err);
  }
});

export default router;
