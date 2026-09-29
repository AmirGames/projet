import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";
import { isSuperOwner } from "./shared";

const router = Router();

// GET /superowner/members/clients - Liste des clients
router.get("/members/clients", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = {
      deletedAt: null,
      ...(status && status !== 'all' ? { status } : {})
    };

    const [clients, total] = await Promise.all([
      db.customer.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          totalOrders: true,
          totalSpent: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.customer.count({ where })
    ]);

    res.json({
      clients: clients.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: c.status,
        joinDate: c.createdAt,
        totalOrders: c.totalOrders,
        totalSpent: Number(c.totalSpent),
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/members/merchants - Liste des commerçants
router.get("/members/merchants", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [merchants, total] = await Promise.all([
      db.organization.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          tier: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.organization.count({ where })
    ]);

    res.json({
      merchants: merchants.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        storeName: m.name,
        status: m.status,
        joinDate: m.createdAt,
        tier: m.tier,
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/members/deliveries - Liste des livreurs
router.get("/members/deliveries", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [deliveries, total] = await Promise.all([
      db.driver.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          totalDeliveries: true,
          rating: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.driver.count({ where })
    ]);

    res.json({
      deliveries: deliveries.map(d => ({
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        companyName: undefined,
        status: d.status,
        joinDate: d.createdAt,
        deliveries: d.totalDeliveries,
        rating: d.rating ? Number(d.rating) : undefined,
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/members/drivers - Liste des drivers (VTC/Taxi/Coursiers)
router.get("/members/drivers", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [drivers, total] = await Promise.all([
      db.driver.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          vehicleType: true,
          status: true,
          createdAt: true,
          totalDeliveries: true,
          rating: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.driver.count({ where })
    ]);

    res.json({
      drivers: drivers.map(d => ({
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        vehicleType: d.vehicleType,
        status: d.status,
        joinDate: d.createdAt,
        deliveries: d.totalDeliveries,
        rating: d.rating ? Number(d.rating) : undefined,
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
