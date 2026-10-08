import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { DispatchService } from "./dispatch.service";

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/** Qui demande, et pour quelle boutique : la requête vue par le service. */
export type RechercheLivreurs = {
  userId: string;
  /** Super-propriétaire ou administrateur système : voit toutes les boutiques. */
  administrateur: boolean;
  storeId: unknown;
  /** Rayon demandé (brut, issu de la query). */
  rayon: unknown;
};

/** Les livreurs disponibles autour d'une boutique, pour le commerçant. */
export const DriverRechercheService = {
  async disponibles({ userId, administrateur, storeId, rayon }: RechercheLivreurs) {
    // Même rayon que l'attribution par défaut : un livreur listé ici doit
    // pouvoir recevoir la course.
    const reglages = await DispatchService.reglages();
    const radius = Math.min(parseInt(rayon as string) || reglages.maxRadiusKm, 50);

    if (typeof storeId !== "string" || !storeId.trim()) {
      throw new ApiError(400, "storeId est requis", "STORE_ID_REQUIRED");
    }

    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, orgId: true, latitude: true, longitude: true },
    });

    if (!store) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
    }

    if (!administrateur) {
      const membership = await db.membership.findFirst({
        where: { userId, orgId: store.orgId },
        select: { id: true },
      });
      if (!membership) {
        throw new ApiError(403, "Cette boutique n'est pas la vôtre", "FORBIDDEN");
      }
    }

    if (store.latitude == null || store.longitude == null) {
      throw new ApiError(
        400,
        "La boutique n'a pas de coordonnées GPS : renseignez son adresse pour trouver des livreurs",
        "STORE_WITHOUT_LOCATION"
      );
    }

    // Tous les livreurs, puis filtrage étape par étape : quand la liste est
    // vide, le commerçant voit à quelle condition ils ont tous échoué au lieu
    // d'un simple « aucun livreur ».
    const tous = await db.courier.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        isOnline: true,
        isAvailable: true,
        currentOrderId: true,
        latitude: true,
        longitude: true,
        gpsLostAt: true,
      },
    });

    const actifs = tous.filter((d) => d.status === "ACTIVE");
    const enLigne = actifs.filter((d) => d.isOnline);
    const libres = enLigne.filter((d) => d.isAvailable && d.currentOrderId === null);
    // Une position figée (signal GPS perdu) ne dit plus où est le livreur :
    // l'attribution l'écarte, la liste aussi.
    const localises = libres.filter(
      (d) => d.latitude != null && d.longitude != null && d.gpsLostAt == null
    );

    const avecDistance = localises
      .map((driver) => ({
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        distance: calculateDistance(
          store.latitude as number,
          store.longitude as number,
          driver.latitude as number,
          driver.longitude as number
        ),
      }))
      .sort((a, b) => a.distance - b.distance);

    const availableDrivers = avecDistance.filter((driver) => driver.distance <= radius);

    return {
      deliveryMen: availableDrivers,
      total: availableDrivers.length,
      radiusKm: radius,
      diagnostic: {
        total: tous.length,
        actifs: actifs.length,
        enLigne: enLigne.length,
        libres: libres.length,
        localises: localises.length,
        dansLeRayon: availableDrivers.length,
        plusProcheKm: avecDistance[0]?.distance ?? null,
      },
    };
  },
};
