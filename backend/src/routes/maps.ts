import { Router, Request, Response, NextFunction } from "express";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";

const router = Router();

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return parseFloat(distance.toFixed(2));
}

// Estimate delivery time based on distance
function estimateDeliveryTime(distanceKm: number, preparationMinutes: number = 15): number {
  // Assume delivery at ~3 km/minute average (accounting for traffic, stops)
  const deliveryMinutes = Math.ceil(distanceKm / 0.05);
  return preparationMinutes + deliveryMinutes;
}

// GET /api/maps/nearby-stores
// Get all stores near a location with distance and ETA
router.get("/nearby-stores", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { latitude, longitude, radius = 5 } = req.query;

    if (!latitude || !longitude) {
      throw new ApiError(400, "Latitude and longitude are required", "INVALID_REQUEST");
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const maxRadius = parseFloat(radius as string);

    // Validate coordinates
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new ApiError(400, "Invalid latitude or longitude", "INVALID_COORDINATES");
    }

    // Get all active stores with location
    const stores = await db.store.findMany({
      where: {
        status: "OPEN",
        latitude: { not: null },
        longitude: { not: null }
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE" },
          select: { id: true, name: true, price: true },
          take: 3
        }
      }
    });

    // Calculate distance and ETA for each store
    const storesWithMetrics = stores
      .map(store => ({
        ...store,
        distance: calculateDistance(lat, lng, store.latitude!, store.longitude!),
        estimatedDeliveryTime: estimateDeliveryTime(
          calculateDistance(lat, lng, store.latitude!, store.longitude!),
          15
        ),
        coordinates: {
          latitude: store.latitude,
          longitude: store.longitude
        }
      }))
      .filter(store => store.distance <= maxRadius)
      .sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      clientLocation: { latitude: lat, longitude: lng },
      searchRadius: maxRadius,
      count: storesWithMetrics.length,
      data: storesWithMetrics
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/maps/route
// Calculate route between pickup and delivery points
router.get("/route", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startLat, startLng, endLat, endLng } = req.query;

    if (!startLat || !startLng || !endLat || !endLng) {
      throw new ApiError(400, "Start and end coordinates are required", "INVALID_REQUEST");
    }

    const distance = calculateDistance(
      parseFloat(startLat as string),
      parseFloat(startLng as string),
      parseFloat(endLat as string),
      parseFloat(endLng as string)
    );

    const estimatedTime = estimateDeliveryTime(distance, 0);

    res.json({
      success: true,
      route: {
        distance: distance,
        distanceFormatted: `${distance} km`,
        estimatedTime: estimatedTime,
        estimatedTimeFormatted: `${estimatedTime} minutes`,
        startCoordinates: {
          latitude: parseFloat(startLat as string),
          longitude: parseFloat(startLng as string)
        },
        endCoordinates: {
          latitude: parseFloat(endLat as string),
          longitude: parseFloat(endLng as string)
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/maps/delivery-zone
// Check if delivery address is in service area
router.get("/delivery-zone", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, deliveryLat, deliveryLng } = req.query;

    if (!storeId || !deliveryLat || !deliveryLng) {
      throw new ApiError(400, "Store ID and delivery coordinates required", "INVALID_REQUEST");
    }

    const store = await db.store.findUnique({
      where: { id: storeId as string },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        acceptsDelivery: true,
        deliveryCost: true,
        minDeliveryAmount: true
      }
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "NOT_FOUND");
    }

    if (!store.latitude || !store.longitude) {
      throw new ApiError(400, "Store location not available", "INVALID_STATE");
    }

    const distance = calculateDistance(
      store.latitude,
      store.longitude,
      parseFloat(deliveryLat as string),
      parseFloat(deliveryLng as string)
    );

    // Assume max delivery radius of 10 km
    const isInZone = distance <= 10 && store.acceptsDelivery;
    const estimatedTime = estimateDeliveryTime(distance);

    res.json({
      success: true,
      store: {
        id: store.id,
        name: store.name
      },
      delivery: {
        isInZone,
        distance,
        distanceFormatted: `${distance} km`,
        estimatedTime,
        estimatedTimeFormatted: `${estimatedTime} minutes`,
        deliveryCost: store.deliveryCost,
        deliveryCostFormatted: `€${(store.deliveryCost / 100).toFixed(2)}`,
        minDeliveryAmount: store.minDeliveryAmount,
        minDeliveryAmountFormatted: `€${(store.minDeliveryAmount / 100).toFixed(2)}`
      },
      message: isInZone
        ? `Delivery available in ${estimatedTime} minutes`
        : `Outside delivery zone (${distance} km away)`
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/maps/distance
// Simple distance calculation between two points
router.get("/distance", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat1, lng1, lat2, lng2 } = req.query;

    if (!lat1 || !lng1 || !lat2 || !lng2) {
      throw new ApiError(400, "All coordinates required", "INVALID_REQUEST");
    }

    const distance = calculateDistance(
      parseFloat(lat1 as string),
      parseFloat(lng1 as string),
      parseFloat(lat2 as string),
      parseFloat(lng2 as string)
    );

    res.json({
      success: true,
      distance,
      distanceFormatted: `${distance} km`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
