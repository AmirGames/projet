import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { StoreHoursService, DayHours, PickupSlot } from "../services/store-hours.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

const router = Router();

const dayHoursSchema = z.object({
  open: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, "Invalid time format (HH:mm)"),
  close: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, "Invalid time format (HH:mm)"),
  closed: z.boolean(),
});

const pickupSlotSchema = z.object({
  start: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, "Invalid time format (HH:mm)"),
  end: z.string().regex(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, "Invalid time format (HH:mm)"),
  maxOrders: z.number().int().positive("Max orders must be at least 1"),
});

// GET /store-hours/:storeId - Get all hours and slots (protected)
router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    const hours = await StoreHoursService.getHours(storeId);

    res.json(hours);
  } catch (err) {
    next(err);
  }
});

// PUT /store-hours/:storeId/day/:day - Update specific day hours (protected)
router.put("/:storeId/day/:day", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const day = req.params.day as string;
    const body = dayHoursSchema.parse(req.body);

    logger.info("Updating store day hours", { storeId, day });

    const result = await StoreHoursService.updateDay(storeId, day.toUpperCase(), body);

    res.json({
      message: "Day hours updated",
      operatingHours: result.operatingHours,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /store-hours/:storeId/day/:day/toggle - Toggle day closed status (protected)
router.patch("/:storeId/day/:day/toggle", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const day = req.params.day as string;

    logger.info("Toggling day status", { storeId, day });

    const result = await StoreHoursService.toggleDay(storeId, day.toUpperCase());

    res.json({
      message: "Day status toggled",
      operatingHours: result.operatingHours,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /store-hours/:storeId/status - Toggle store open/closed (protected)
router.patch("/:storeId/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const { isOpen } = z.object({ isOpen: z.boolean() }).parse(req.body);

    logger.info("Updating store status", { storeId, isOpen });

    const result = await StoreHoursService.setStoreStatus(storeId, isOpen);

    res.json({
      message: isOpen ? "Store opened" : "Store closed",
      isOpen: result.isOpen,
    });
  } catch (err) {
    next(err);
  }
});

// POST /store-hours/:storeId/pickup-slots - Add pickup slot (protected)
router.post("/:storeId/pickup-slots", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = pickupSlotSchema.parse(req.body);

    logger.info("Adding pickup slot", { storeId });

    const result = await StoreHoursService.addPickupSlot(storeId, body);

    res.status(201).json({
      message: "Pickup slot added",
      pickupSlots: result.pickupSlots,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /store-hours/:storeId/pickup-slots/:slotId - Update pickup slot (protected)
router.put("/:storeId/pickup-slots/:slotId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const slotId = req.params.slotId as string;
    const body = pickupSlotSchema.parse(req.body);

    logger.info("Updating pickup slot", { storeId, slotId });

    const result = await StoreHoursService.updatePickupSlot(storeId, slotId, body);

    res.json({
      message: "Pickup slot updated",
      pickupSlots: result.pickupSlots,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /store-hours/:storeId/pickup-slots/:slotId - Delete pickup slot (protected)
router.delete("/:storeId/pickup-slots/:slotId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const slotId = req.params.slotId as string;

    logger.info("Deleting pickup slot", { storeId, slotId });

    const result = await StoreHoursService.deletePickupSlot(storeId, slotId);

    res.json({
      message: "Pickup slot deleted",
      pickupSlots: result.pickupSlots,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
