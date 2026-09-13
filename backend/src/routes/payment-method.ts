import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PaymentMethodService } from "../services/payment-method.service";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createPaymentMethodSchema = z.object({
  type: z.enum(["CREDIT_CARD", "DEBIT_CARD", "PAYPAL", "STRIPE", "BANK_TRANSFER", "CASH", "APPLE_PAY", "GOOGLE_PAY"]),
  name: z.string().min(2).max(100),
  config: z.object({}).optional(),
  isDefault: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  fixedFee: z.number().min(0).optional(),
});

const updatePaymentMethodSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  config: z.object({}).optional(),
  isDefault: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  fixedFee: z.number().min(0).optional(),
});

router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;

    logger.info("Fetching payment methods", { storeId, skip, take });

    const result = await PaymentMethodService.getPaymentMethods(storeId, { skip, take });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/:methodId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const methodId = req.params.methodId as string;

    logger.info("Fetching payment method", { storeId, methodId });

    const method = await PaymentMethodService.getPaymentMethod(storeId, methodId);
    res.json(method);
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/default", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Fetching default payment method", { storeId });

    const method = await PaymentMethodService.getDefaultPaymentMethod(storeId);
    res.json(method || { error: "No default payment method found" });
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/active", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Fetching active payment methods", { storeId });

    const methods = await PaymentMethodService.getActivePaymentMethods(storeId);
    res.json({ data: methods });
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createPaymentMethodSchema.parse(req.body);

    logger.info("Creating payment method", { storeId });

    const method = await PaymentMethodService.createPaymentMethod(storeId, body);
    res.status(201).json({
      message: "Payment method created successfully",
      method,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:methodId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const methodId = req.params.methodId as string;
    const body = updatePaymentMethodSchema.parse(req.body);

    logger.info("Updating payment method", { storeId, methodId });

    const method = await PaymentMethodService.updatePaymentMethod(storeId, methodId, body);
    res.json({
      message: "Payment method updated successfully",
      method,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:methodId/toggle", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const methodId = req.params.methodId as string;

    logger.info("Toggling payment method", { storeId, methodId });

    const method = await PaymentMethodService.togglePaymentMethod(storeId, methodId);
    res.json({
      message: "Payment method toggled successfully",
      method,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:methodId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const methodId = req.params.methodId as string;

    logger.info("Deleting payment method", { storeId, methodId });

    await PaymentMethodService.deletePaymentMethod(storeId, methodId);
    res.json({
      message: "Payment method deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
