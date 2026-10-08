import { Router, Request, Response, NextFunction } from "express";
import { ApiError } from "../../middleware/errorHandler";
import { StoreHoursService } from "../delivery/store-hours.service";
import { DeliveryZoneService } from "../delivery/delivery-zone.service";
import { VitrineClientService } from "./vitrine-client.service";

// Vitrine publique : aucune authentification. L'espace du client connecté est
// dans client.compte.routes.ts ; les deux sont montés sur /api/client (voir
// app.ts). L'ordre compte ici : /stores/nearby et /stores/search passent avant
// /stores/:id.
const router = Router();

/** « be », « fr »… : le pays de la région du site, en deux lettres. */
const paysDemande = (brut: unknown) =>
  typeof brut === "string" && /^[a-z]{2}$/i.test(brut) ? brut.toLowerCase() : undefined;

// GET /api/client/stores - Get all stores (public)
router.get("/stores", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // `?pays=be` : les commerces de ce pays seulement (voir VitrineClientService.boutiques).
    const pays = paysDemande(req.query.pays);

    const data = await VitrineClientService.boutiques(pays);

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/nearby - Get nearby stores by geolocation
router.get("/stores/nearby", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { latitude, longitude, maxDistance = 5 } = req.query;

    if (!latitude || !longitude) {
      throw new ApiError(400, "Latitude et longitude requis", "INVALID_REQUEST");
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const maxDist = parseFloat(maxDistance as string) || 5;

    const data = await VitrineClientService.proches(lat, lng, maxDist);

    res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/search - Search stores by name, city, cuisine
router.get("/stores/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, city, limit = 20 } = req.query;

    if (!q) {
      throw new ApiError(400, "Paramètre 'q' requis", "INVALID_REQUEST");
    }

    const searchQuery = (q as string).toLowerCase();

    const data = await VitrineClientService.rechercher(
      searchQuery,
      city ? (city as string) : undefined,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id - Get store details with menu (public)
router.get("/stores/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    res.json({
      success: true,
      data: await VitrineClientService.fiche(id as string)
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id/pickup-slots - Créneaux de retrait proposables
router.get("/stores/:id/pickup-slots", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jours = Math.min(parseInt((req.query.jours as string) || "7") || 7, 14);
    const creneaux = await StoreHoursService.creneauxDeRetrait(req.params.id as string, { jours });

    res.json({ success: true, data: creneaux });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/client/stores/:id/zone-livraison?lat=&lng=
 *
 * Dit au client, avant qu'il remplisse quoi que ce soit, s'il est livré, à
 * quels frais et à partir de quel montant. Sans cela il découvrait le refus
 * au dernier moment, après avoir saisi son adresse et son téléphone.
 */
router.get("/stores/:id/zone-livraison", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latitude = req.query.lat === undefined ? null : Number(req.query.lat);
    const longitude = req.query.lng === undefined ? null : Number(req.query.lng);

    const verdict = await DeliveryZoneService.verdict(req.params.id as string, {
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      // L'adresse telle que le client l'a écrite, quand il n'a retenu aucune
      // suggestion : le serveur la situe pour trouver l'anneau.
      texte: typeof req.query.adresse === "string" ? req.query.adresse : null,
    });

    res.json({ success: true, data: verdict });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id/zones - La grille des zones, pour information
router.get("/stores/:id/zones", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const zones = await DeliveryZoneService.getByStoreId(req.params.id as string);

    res.json({ success: true, data: zones.filter((zone) => zone.isActive) });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/service-fee - Les frais de service de la plateforme, annoncés au tunnel avant de valider
router.get("/service-fee", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: { frais: await VitrineClientService.fraisDeService() } });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id/payment-methods - Moyens de paiement du commerçant (sans sa configuration)
router.get("/stores/:id/payment-methods", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await VitrineClientService.moyensDePaiement(req.params.id as string) });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id/menu - Get menu only
router.get("/stores/:id/menu", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    res.json({
      success: true,
      data: await VitrineClientService.menu(id as string)
    });
  } catch (err) {
    next(err);
  }
});

export default router;
