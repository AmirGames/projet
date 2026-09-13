import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { StaffService } from "../services/staff.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createStaffSchema = z.object({
  storeId: z.string().cuid(),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email format"),
  phone: z.string().optional(),
  role: z.enum(["MANAGER", "CASHIER", "KITCHEN", "DELIVERY", "SUPPORT"]).default("CASHIER"),
  permissions: z.array(z.string()).optional(),
});

const updateStaffSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(["MANAGER", "CASHIER", "KITCHEN", "DELIVERY", "SUPPORT"]).optional(),
  permissions: z.array(z.string()).optional(),
});

// POST /staff - Create staff member (protected)
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createStaffSchema.parse(req.body);

    logger.info("Creating staff member", { email: body.email, storeId: body.storeId });

    const staff = await StaffService.create(body);

    res.status(201).json({
      message: "Staff member created",
      staff,
    });
  } catch (err) {
    next(err);
  }
});

// GET /staff/:id - Get staff by ID (protected)
router.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const staff = await StaffService.getById(id);

    res.json(staff);
  } catch (err) {
    next(err);
  }
});

// GET /staff?storeId=:storeId - Get staff by store (protected)
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string;
    const orgId = req.query.orgId as string;

    if (orgId) {
      const staff = await StaffService.getByOrgId(orgId);
      return res.json({
        staff,
        total: staff.length,
      });
    }

    if (!storeId) {
      throw new ApiError(400, "Parameter 'storeId' or 'orgId' required", "MISSING_PARAM");
    }

    const staff = await StaffService.getByStoreId(storeId);
    const total = await StaffService.countByStoreId(storeId);
    const active = await StaffService.countActiveByStoreId(storeId);

    res.json({
      staff,
      total,
      active,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /staff/:id - Update staff member (protected)
router.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updateStaffSchema.parse(req.body);

    logger.info("Updating staff member", { id });

    const staff = await StaffService.update(id, body);

    res.json({
      message: "Staff member updated",
      staff,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /staff/:id/status - Update staff status (protected)
router.patch("/:id/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status } = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]) }).parse(req.body);

    logger.info("Updating staff status", { id, status });

    const staff = await StaffService.updateStatus(id, status);

    res.json({
      message: "Staff status updated",
      staff,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /staff/:id - Delete staff member (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const staff = await StaffService.getById(id);

    if (!staff) {
      throw new ApiError(404, "Staff member not found", "STAFF_NOT_FOUND");
    }

    logger.info("Deleting staff member", { id });

    await StaffService.delete(id);

    res.json({
      message: "Staff member deleted",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
