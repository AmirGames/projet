import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PourboireService } from "../services/pourboire.service";
import { champEmail } from "../utils/validation";
import { OrderService } from "../services/order.service";
import { ApiError } from "../middleware/errorHandler";
import { authFacultative, authMiddleware } from "../middleware/auth";
import { limiterCadence } from "../middleware/throttle";
import type { Appelant } from "../services/suivi-commande.service";
import { logger } from "../config/logger";
import { emitOrderUpdate } from "../config/socket";
import { db } from "../services/db";
import { champAcceptation, enregistrerAcceptation } from "../services/acceptation-conditions.service";

import { DispatchService } from "../services/dispatch.service";

const router = Router();

// GET /orders - Get orders by orgId or storeId (protected)
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.query.orgId as string;
    const storeId = req.query.storeId as string;
    const status = req.query.status as string | undefined;
    const limit = parseInt((req.query.limit as string) || "100") || 100;
    const offset = parseInt((req.query.offset as string) || "0") || 0;

    if (!orgId && !storeId) {
      throw new ApiError(400, "Paramètre 'orgId' ou 'storeId' requis", "MISSING_PARAM");
    }

    let orders;
    let total;
    // Les compteurs de la page d'accueil du commerçant : ils restaient à zéro
    // faute d'être calculés quelque part.
    let resume: { totalOrders: number; totalRevenue: number } | undefined;

    if (storeId) {
      orders = await OrderService.getByStoreId(storeId, limit, offset);
      total = await OrderService.countByStoreId(storeId);
    } else {
      orders = await OrderService.getByOrgId(orgId, status, limit, offset);
      const bilan = await OrderService.chiffreAffairesOrg(orgId, status);
      total = bilan.commandes;
      resume = {
        totalOrders: bilan.commandes,
        totalRevenue: Number(bilan.chiffreAffaires.toFixed(2)),
      };
    }

    res.json({
      orders,
      ...(resume ? { summary: resume } : {}),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (err) {
    next(err);
  }
});

const createOrderSchema = z.object({
  storeId: z.string().cuid(),
  customerName: z.string().min(2, "Nom minimum 2 caractères"),
  customerEmail: champEmail(),
  customerPhone: z.string().min(9, "Téléphone invalide"),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
  pickupTime: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryCity: z.string().optional(),
  deliveryPostal: z.string().optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  // Aucun montant n'est lu du client : total, taxe, frais et prix des lignes
  // sont recalculés par le serveur. Les anciens appelants peuvent encore
  // envoyer `totalAmount`, `taxAmount`, `feesAmount` ou `items[].price` :
  // zod écarte ces clés inconnues, elles n'atteignent jamais le service.
  // Le pourboire du livreur ; bornes et conditions vérifiées par le service.
  tipAmount: z.number().nonnegative().max(1000).optional(),
  // Le code est repris tel quel ; c'est le serveur qui calcule la remise.
  promoCode: z.string().optional(),
  paymentMethodId: z.string().optional(),
  notes: z.string().optional(),
  // Le détail du panier, obligatoire : sans lui, le total retombait sur le
  // montant annoncé par le navigateur (une commande à un centime passait).
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().optional(),
        quantity: z.number().int().positive().max(999),
        // Accepté pour les anciens appelants, jamais enregistré : la ligne
        // garde la copie des suppléments relue par le serveur.
        selectedOptions: z.record(z.string(), z.string()).optional(),
        // Les suppléments choisis, par identifiant ; tarifés par le serveur.
        supplements: z.array(z.string().min(1).max(64)).max(50).optional(),
      })
    )
    .min(1, "Le panier est vide")
    .max(100, "Trop d'articles dans le panier"),
  ...champAcceptation,
});

const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "PREPARING", "REJECTED", "READY", "COMPLETED"]),
});

// POST /orders - Create order (public, for guest checkout). Le jeton, s'il y
// en a un, rattache la commande à la fiche du compte connecté.
router.post("/", authFacultative, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conditionsAcceptees: _accepte, ...body } = createOrderSchema.parse(req.body);

    logger.info("Creating order", { customerName: body.customerName, storeId: body.storeId });

    const order = await OrderService.create({ ...body, userId: req.userId });

    await enregistrerAcceptation(req, {
      email: body.customerEmail,
      orderId: order.id,
      documents: ["cgv", "confidentialite"],
    });

    res.status(201).json({
      message: "Commande créée",
      order,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:id/pourboire — le pourboire après livraison est-il proposé.
 *
 * Public comme le suivi : l'identifiant de la commande est le lien que reçoit
 * un client sans compte.
 */
router.get("/:id/pourboire", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await PourboireService.situation(req.params.id as string) });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/pourboire — l'intention de paiement du pourboire.
router.post("/:id/pourboire", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { montant } = z.object({ montant: z.number().positive().max(1000) }).parse(req.body);
    const intention = await PourboireService.creerIntention(req.params.id as string, montant);
    res.status(201).json({ success: true, clientSecret: intention.clientSecret, montant: intention.montant });
  } catch (err) {
    next(err);
  }
});

/**
 * L'appelant, s'il présente une session valable ; anonyme sinon.
 *
 * Le suivi reste ouvert sans compte (avec le jeton de suivi) : une session
 * expirée ne doit pas en priver le client, elle compte simplement pour rien.
 */
async function appelantFacultatif(req: Request, res: Response): Promise<Appelant> {
  if (!req.headers.authorization?.startsWith("Bearer ")) return {};

  try {
    await new Promise<void>((ok, ko) => {
      authMiddleware(req, res, (err?: unknown) => (err ? ko(err) : ok()));
    });
    return { userId: req.userId, compte: req.compte };
  } catch {
    return {};
  }
}

/** Le jeton de suivi, lu dans `?t=`. */
const jetonDeSuivi = (req: Request) => (typeof req.query.t === "string" ? req.query.t : undefined);

/**
 * Le suivi se relit toutes les vingt secondes : soixante lectures par minute
 * laissent de la marge à plusieurs onglets, pas à une énumération.
 */
const limiterSuivi = limiterCadence({
  max: 60,
  fenetreMs: 60 * 1000,
  message: "Trop de lectures du suivi. Réessayez dans un instant.",
  cle: (req) => `suivi|${req.ip || "inconnue"}`,
});

/**
 * GET /api/orders/:id — la commande, selon qui la demande.
 *
 * Client propriétaire, équipe du commerce, équipe de la plateforme : la
 * commande complète, sans secret de paiement ; le code de remise pour le seul
 * client. Visiteur avec `?t=<jeton de suivi>` : la vue réduite du suivi.
 * Tout autre appelant — le livreur compris — reçoit un 404, qui ne confirme
 * pas que la commande existe (voir suivi-commande.service.ts).
 */
router.get("/:id", limiterSuivi, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const appelant = await appelantFacultatif(req, res);

    const order = await OrderService.getOrderWithItems(id, appelant, jetonDeSuivi(req));

    if (!order) {
      throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");
    }

    res.set("Cache-Control", "no-store");
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// GET /orders/store/:storeId - Get orders by store (protected)
router.get("/store/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const limit = parseInt((req.query.limit as string) || "100") || 100;
    const offset = parseInt((req.query.offset as string) || "0") || 0;

    const orders = await OrderService.getByStoreId(storeId, limit, offset);
    const total = await OrderService.countByStoreId(storeId);

    res.json({
      orders,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /orders/status/:storeId - Get orders by status (protected)
router.get("/status/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const status = (req.query.status as string) || "";

    if (!status) {
      throw new ApiError(400, "Paramètre 'status' requis", "INVALID_INPUT");
    }

    const orders = await OrderService.getByStatus(storeId, status);

    res.json({
      status,
      orders,
      count: orders.length,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /orders/:id/status - Update order status (protected)
router.patch("/:id/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updateOrderStatusSchema.parse(req.body);

    logger.info("Updating order status", { id, status: body.status });

    const order = await OrderService.updateStatus(id, body.status);

    if (!order) {
      throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");
    }

    emitOrderUpdate(id, body.status, { updatedAt: new Date().toISOString() });

    res.json({
      message: "Statut de la commande mis à jour",
      order,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /orders/:id - Delete order (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const order = await OrderService.getById(id);

    if (!order) {
      throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");
    }

    logger.info("Deleting order", { id });

    await OrderService.delete(id);

    res.json({
      message: "Commande supprimée",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /orders/:id/dispatch - Chercher un livreur pour cette commande
 *
 * La recherche part d'elle-même quand la commande passe « En préparation ».
 * Cette route reste pour le commerçant qui veut la relancer ou choisir un
 * livreur précis. Crée la course si elle n'existe pas encore, puis la propose
 * au livreur disponible le plus proche.
 *
 * Relançable : si personne n'était en ligne au premier essai, le commerçant
 * rappelle cette route plus tard sans rien dupliquer.
 */
router.post("/:id/dispatch", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id as string;

    const course = await DispatchService.creerCourse(orderId);

    if (course.driverId) {
      res.json({
        success: true,
        message: "Cette course a déjà un livreur",
        data: { deliveryId: course.id, driverId: course.driverId, propose: false },
      });
      return;
    }

    const driverId = typeof req.body?.driverId === "string" ? req.body.driverId : undefined;
    const proposition = await DispatchService.proposerAuSuivant(course.id, driverId);

    if (proposition) {
      res.json({
        success: true,
        message: "Course proposée à un livreur",
        data: { deliveryId: course.id, propose: true, expiresAt: proposition.expiresAt },
      });
      return;
    }

    // Personne pour l'instant : dire pourquoi, et que la recherche continue
    // d'elle-même.
    const etat = await DispatchService.etatRecherche(course.id);
    const heure = etat.prochaineTentative?.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });

    const livreurs =
      etat.aPortee === 1 ? "Le seul livreur à proximité a" : `Les ${etat.aPortee} livreurs à proximité ont`;

    res.json({
      success: true,
      message:
        etat.aPortee === 0
          ? "Aucun livreur en ligne à proximité. La recherche continue automatiquement dès qu'un livreur se connecte."
          : etat.prochaineTentative
            ? `${livreurs} déjà été sollicité${etat.aPortee > 1 ? "s" : ""}. Nouvelle tentative automatique vers ${heure} — vous pouvez aussi choisir un livreur dans la liste.`
            : `${livreurs} refusé cette course plusieurs fois. Choisissez un livreur dans la liste pour la lui proposer directement.`,
      data: {
        deliveryId: course.id,
        propose: false,
        aPortee: etat.aPortee,
        prochaineTentative: etat.prochaineTentative,
        expiresAt: null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /orders/:id/delivery - Get delivery tracking info
//
// Mêmes droits que le suivi de la commande : la position du livreur ne se lit
// pas avec le seul identifiant.
router.get("/:id/delivery", limiterSuivi, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id as string;

    const appelant = await appelantFacultatif(req, res);
    if (!(await OrderService.getOrderWithItems(orderId, appelant, jetonDeSuivi(req)))) {
      throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");
    }

    const delivery = await db.orderDelivery.findUnique({
      where: { orderId },
      select: {
        id: true,
        orderId: true,
        status: true,
        pickupLat: true,
        pickupLng: true,
        deliveryLat: true,
        deliveryLng: true,
        // Coordonnées obfusquées pour le client
        deliveryLatObfusquee: true,
        deliveryLngObfusquee: true,
        driverLat: true,
        driverLng: true,
        driver: { select: { name: true } },
      },
    });

    if (!delivery) {
      res.json({ data: null });
      return;
    }

    res.json({
      data: {
        ...delivery,
        // Utiliser coordonnées obfusquées pour le client
        deliveryLat: delivery.deliveryLatObfusquee || delivery.deliveryLat,
        deliveryLng: delivery.deliveryLngObfusquee || delivery.deliveryLng,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;