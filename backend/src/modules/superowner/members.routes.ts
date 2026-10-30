import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";
import { isSuperOwner, journaliser } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

// GET /superowner/members/clients - Liste des clients
router.get("/members/clients", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);
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

// GET /superowner/members/clients/:clientId - Fiche client et dernières commandes.
router.get("/members/clients/:clientId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await db.customer.findFirst({
      where: { id: req.params.clientId as string, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        postalCode: true,
        status: true,
        createdAt: true,
        totalOrders: true,
        totalSpent: true,
        orders: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            store: { select: { name: true } },
          },
        },
      },
    });
    if (!client) {
      res.status(404).json({ error: "Client introuvable" });
      return;
    }

    res.json({
      client: {
        ...client,
        joinDate: client.createdAt,
        totalSpent: Number(client.totalSpent),
        orders: client.orders.map((order) => ({ ...order, totalAmount: Number(order.totalAmount) })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/members/clients/:clientId - Corriger le nom et le téléphone.
router.patch("/members/clients/:clientId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().max(32).refine((phone) => !phone || (phone.length >= 7 && /^[+\d\s().-]+$/.test(phone)), "Numéro de téléphone invalide").nullable().optional(),
      reason: z.string().trim().min(3).max(500),
    }).strict().refine((value) => value.name !== undefined || value.phone !== undefined, "Aucune modification fournie").parse(req.body);
    const clientId = req.params.clientId as string;
    const existing = await db.customer.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Client introuvable" });
      return;
    }

    const client = await db.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id: clientId },
        data: { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.phone !== undefined ? { phone: body.phone } : {}) },
        select: { id: true, name: true, email: true, phone: true, status: true },
      });
      if (existing.userId && body.name !== undefined) {
        await tx.user.update({ where: { id: existing.userId }, data: { name: body.name } });
      }
      return updated;
    });

    await journaliser(req, "UPDATE_CUSTOMER_PROFILE", client.id, {
      fields: ["name", "phone"],
      reason: body.reason,
    });
    res.json({ success: true, client });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/members/clients/:clientId/status - Suspension réversible, sans effacer les commandes.
router.patch("/members/clients/:clientId/status", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ status: z.enum(["ACTIVE", "BLOCKED"]), reason: z.string().trim().min(3).max(500) }).strict().parse(req.body);
    const clientId = req.params.clientId as string;
    const existing = await db.customer.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Client introuvable" });
      return;
    }
    const client = await db.customer.update({ where: { id: clientId }, data: { status: body.status }, select: { id: true, status: true } });
    await journaliser(req, body.status === "BLOCKED" ? "BLOCK_CUSTOMER" : "UNBLOCK_CUSTOMER", client.id, {
      previousStatus: existing.status,
      status: client.status,
      reason: body.reason,
    });
    res.json({ success: true, client });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/members/merchants - Liste des commerçants
router.get("/members/merchants", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);
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
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [deliveries, total] = await Promise.all([
      db.courier.findMany({
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
      db.courier.count({ where })
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
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [drivers, total] = await Promise.all([
      db.courier.findMany({
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
      db.courier.count({ where })
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
