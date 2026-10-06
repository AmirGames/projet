import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { champEmail } from "../../utils/validation";
import { CustomerService } from "./customer.service";
import { authMiddleware } from "../auth/auth.middleware";
import { logger } from "../../config/logger";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

const createCustomerSchema = z.object({
  name: z.string().min(2).max(100),
  email: champEmail(),
  phone: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

// Seul le carnet de la boutique se modifie ; les coordonnées de la fiche globale
// appartiennent au client. .strict() : un champ de contact est refusé (400), pas
// ignoré en silence.
const updateCustomerSchema = z.object({
  notes: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "BLOCKED", "INACTIVE"]).optional(),
}).strict();

// GET /customers - List all customers for a store (protected)
router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = decalage(req.query.skip);
    const take = limiteBornee(req.query.take, 50, 200);
    const search = req.query.search as string | undefined;

    logger.info("Fetching customers", { storeId, skip, take, search });

    const result = await CustomerService.getCustomers(storeId, { skip, take, search });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /customers/:storeId/:customerId - Get single customer (protected)
router.get("/:storeId/:customerId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const customerId = req.params.customerId as string;

    logger.info("Fetching customer", { storeId, customerId });

    const customer = await CustomerService.getCustomer(storeId, customerId);

    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// POST /customers/:storeId - Create customer (protected)
router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createCustomerSchema.parse(req.body);

    logger.info("Creating customer", { storeId });

    const customer = await CustomerService.createCustomer(storeId, body);

    res.status(201).json({
      message: "Customer created successfully",
      customer,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /customers/:storeId/:customerId - Update customer (protected)
router.put("/:storeId/:customerId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const customerId = req.params.customerId as string;
    const body = updateCustomerSchema.parse(req.body);

    logger.info("Updating customer", { storeId, customerId });

    const customer = await CustomerService.updateCustomer(storeId, customerId, body);

    res.json({
      message: "Customer updated successfully",
      customer,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /customers/:storeId/:customerId - Delete customer (protected)
router.delete("/:storeId/:customerId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const customerId = req.params.customerId as string;

    logger.info("Deleting customer", { storeId, customerId });

    await CustomerService.deleteCustomer(storeId, customerId);

    res.json({
      message: "Customer deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

// POST /customers/:storeId/:customerId/block - Block customer (protected)
router.post("/:storeId/:customerId/block", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const customerId = req.params.customerId as string;

    logger.info("Blocking customer", { storeId, customerId });

    const customer = await CustomerService.blockCustomer(storeId, customerId);

    res.json({
      message: "Customer blocked successfully",
      customer,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
