import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { distanceKm, estUnPoint } from "../utils/geo";
import { AddressService } from "./address.service";

/**
 * Les zones de livraison d'une boutique.
 *
 * Des anneaux concentriques autour du commerce, chacun avec ses frais et son
 * montant minimum de commande — comme chez Uber Eats. L'anneau le plus petit
 * qui contient l'adresse s'applique : le client proche paie moins et commande
 * à partir de moins cher que le client éloigné.
 *
 * Le modèle existait depuis le début avec un nom, des frais et un minimum,
 * mais sans géométrie utilisable — un point sans rayon — et surtout : rien ne
 * l'appliquait. La commande facturait les frais forfaitaires de la boutique et
 * acceptait n'importe quel montant, de n'importe où.
 */

export interface DeliveryZoneData {
  storeId: string;
  name: string;
  radiusKm: number;
  baseFee: number;
  minOrder: number;
  deliveryMinutes?: number | null;
  isActive?: boolean;
}

export interface ZoneLisible {
  id: string;
  name: string;
  radiusKm: number;
  baseFee: number;
  minOrder: number;
  deliveryMinutes: number | null;
  isActive: boolean;
}

/** Le verdict d'une adresse : livrable ou non, et à quelles conditions. */
export interface Verdict {
  livrable: boolean;
  /** La zone qui s'applique, si l'adresse est desservie. */
  zone: ZoneLisible | null;
  /** Distance entre la boutique et l'adresse, en kilomètres. */
  distanceKm: number | null;
  /** Les frais à facturer. */
  frais: number;
  /** Le montant minimum de commande. */
  minimum: number;
  /** Pourquoi ce n'est pas livrable, en clair. */
  raison: string;
  /** Vrai quand aucune zone n'est définie : on retombe sur le forfait boutique. */
  forfaitBoutique: boolean;
}

const lisible = (zone: any): ZoneLisible => ({
  id: zone.id,
  name: zone.name,
  radiusKm: Number(zone.radiusKm),
  baseFee: Number(zone.baseFee),
  minOrder: Number(zone.minOrder),
  deliveryMinutes: zone.deliveryMinutes ?? null,
  isActive: zone.isActive,
});

export class DeliveryZoneService {
  static async create(data: DeliveryZoneData) {
    const nom = (data.name || "").trim();

    if (!nom) {
      throw new ApiError(400, "Une zone a besoin d'un nom", "MISSING_NAME");
    }

    if (!(data.radiusKm > 0)) {
      throw new ApiError(400, "Le rayon doit être supérieur à zéro", "INVALID_RADIUS");
    }

    if (data.baseFee < 0 || data.minOrder < 0) {
      throw new ApiError(400, "Ni les frais ni le minimum ne peuvent être négatifs", "INVALID_AMOUNT");
    }

    // Deux anneaux de même rayon se disputeraient la même adresse.
    const memeRayon = await db.deliveryZone.findFirst({
      where: { storeId: data.storeId, radiusKm: data.radiusKm },
      select: { name: true },
    });

    if (memeRayon) {
      throw new ApiError(
        409,
        `« ${memeRayon.name} » couvre déjà ${data.radiusKm} km. Choisissez un autre rayon.`,
        "DUPLICATE_RADIUS"
      );
    }

    return db.deliveryZone.create({
      data: {
        storeId: data.storeId,
        name: nom,
        radiusKm: data.radiusKm,
        baseFee: data.baseFee,
        minOrder: data.minOrder || 0,
        deliveryMinutes: data.deliveryMinutes ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  static async getById(id: string) {
    const zone = await db.deliveryZone.findUnique({ where: { id } });

    if (!zone) {
      throw new ApiError(404, "Zone de livraison introuvable", "ZONE_NOT_FOUND");
    }

    return zone;
  }

  /** Les zones d'une boutique, du plus petit anneau au plus grand. */
  static async getByStoreId(storeId: string) {
    const zones = await db.deliveryZone.findMany({
      where: { storeId },
      orderBy: { radiusKm: "asc" },
    });

    return zones.map(lisible);
  }

  static async update(id: string, data: Partial<DeliveryZoneData>) {
    const existante = await this.getById(id);

    if (data.radiusKm !== undefined && !(data.radiusKm > 0)) {
      throw new ApiError(400, "Le rayon doit être supérieur à zéro", "INVALID_RADIUS");
    }

    if ((data.baseFee !== undefined && data.baseFee < 0) || (data.minOrder !== undefined && data.minOrder < 0)) {
      throw new ApiError(400, "Ni les frais ni le minimum ne peuvent être négatifs", "INVALID_AMOUNT");
    }

    if (data.radiusKm !== undefined && data.radiusKm !== Number(existante.radiusKm)) {
      const memeRayon = await db.deliveryZone.findFirst({
        where: { storeId: existante.storeId, radiusKm: data.radiusKm, id: { not: id } },
        select: { name: true },
      });

      if (memeRayon) {
        throw new ApiError(
          409,
          `« ${memeRayon.name} » couvre déjà ${data.radiusKm} km. Choisissez un autre rayon.`,
          "DUPLICATE_RADIUS"
        );
      }
    }

    try {
      return await db.deliveryZone.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.radiusKm !== undefined ? { radiusKm: data.radiusKm } : {}),
          ...(data.baseFee !== undefined ? { baseFee: data.baseFee } : {}),
          ...(data.minOrder !== undefined ? { minOrder: data.minOrder } : {}),
          ...(data.deliveryMinutes !== undefined ? { deliveryMinutes: data.deliveryMinutes } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Zone de livraison introuvable", "ZONE_NOT_FOUND");
      }
      throw error;
    }
  }

  static async delete(id: string) {
    try {
      return await db.deliveryZone.delete({ where: { id } });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Zone de livraison introuvable", "ZONE_NOT_FOUND");
      }
      throw error;
    }
  }

  static async getByOrgId(orgId: string) {
    const zones = await db.deliveryZone.findMany({
      where: { store: { orgId } },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ storeId: "asc" }, { radiusKm: "asc" }],
    });

    return zones.map((zone) => ({ ...lisible(zone), store: zone.store }));
  }

  /**
   * L'adresse est-elle livrable, et à quelles conditions.
   *
   * Sans zone définie, on retombe sur les frais et le minimum forfaitaires de
   * la boutique : une boutique qui n'a rien réglé doit continuer de livrer.
   *
   * `texte` est l'adresse telle que le client l'a écrite. Elle sert quand il n'a
   * pas retenu de suggestion : sans coordonnées, aucun anneau ne pouvait être
   * départagé et la commande était refusée — un client qui tape son adresse à la
   * main ne pouvait pas commander.
   */
  static async verdict(
    storeId: string,
    adresse: { latitude?: number | null; longitude?: number | null; texte?: string | null }
  ): Promise<Verdict> {
    const boutique = await db.store.findUnique({
      where: { id: storeId },
      select: {
        latitude: true,
        longitude: true,
        acceptsDelivery: true,
        deliveryCost: true,
        minDeliveryAmount: true,
      },
    });

    if (!boutique) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
    }

    const forfait = {
      frais: Number(boutique.deliveryCost),
      minimum: Number(boutique.minDeliveryAmount),
    };

    if (!boutique.acceptsDelivery) {
      return {
        livrable: false,
        zone: null,
        distanceKm: null,
        ...forfait,
        raison: "Cette boutique ne fait pas de livraison.",
        forfaitBoutique: true,
      };
    }

    const zones = (await this.getByStoreId(storeId)).filter((zone) => zone.isActive);

    // Aucune zone réglée : le forfait de la boutique s'applique, partout.
    if (zones.length === 0) {
      return {
        livrable: true,
        zone: null,
        distanceKm: null,
        ...forfait,
        raison: "",
        forfaitBoutique: true,
      };
    }

    const depart = { latitude: boutique.latitude, longitude: boutique.longitude };

    if (!estUnPoint(depart)) {
      return {
        livrable: false,
        zone: null,
        distanceKm: null,
        frais: forfait.frais,
        minimum: forfait.minimum,
        raison:
          "Cette boutique n'a pas encore situé son adresse : la livraison ne peut pas être calculée.",
        forfaitBoutique: false,
      };
    }

    // L'adresse écrite à la main n'a pas de coordonnées : on la situe.
    let point = adresse;

    if (!estUnPoint(point) && (adresse.texte || "").trim().length >= 3) {
      const situee = await AddressService.situer(adresse.texte as string);

      if (situee.point) {
        point = situee.point;
      } else if (!situee.disponible) {
        // Notre service d'adresses est en panne. Ce n'est pas au client de le
        // payer : la boutique livre au forfait, le temps que ça revienne.
        return {
          livrable: true,
          zone: null,
          distanceKm: null,
          ...forfait,
          raison: "",
          forfaitBoutique: true,
        };
      } else {
        return {
          livrable: false,
          zone: null,
          distanceKm: null,
          frais: forfait.frais,
          minimum: forfait.minimum,
          raison:
            "Nous n'avons pas trouvé cette adresse. Vérifiez-la, ou choisissez-la dans les suggestions.",
          forfaitBoutique: false,
        };
      }
    }

    // Ni coordonnées ni adresse : il n'y a rien à situer.
    if (!estUnPoint(point)) {
      return {
        livrable: false,
        zone: null,
        distanceKm: null,
        frais: forfait.frais,
        minimum: forfait.minimum,
        raison: "Saisissez votre adresse pour connaître les frais de livraison.",
        forfaitBoutique: false,
      };
    }

    const distance = distanceKm(
      { latitude: depart.latitude as number, longitude: depart.longitude as number },
      { latitude: point.latitude as number, longitude: point.longitude as number }
    );

    // Les anneaux sont triés du plus petit au plus grand : le premier qui
    // contient l'adresse est le bon.
    const zone = zones.find((candidate) => distance <= candidate.radiusKm);

    if (!zone) {
      const portee = Math.max(...zones.map((candidate) => candidate.radiusKm));

      return {
        livrable: false,
        zone: null,
        distanceKm: Number(distance.toFixed(2)),
        frais: 0,
        minimum: 0,
        raison: `Cette adresse est à ${distance.toFixed(
          1
        )} km, au-delà de la zone livrée (${portee} km).`,
        forfaitBoutique: false,
      };
    }

    return {
      livrable: true,
      zone,
      distanceKm: Number(distance.toFixed(2)),
      frais: zone.baseFee,
      minimum: zone.minOrder,
      raison: "",
      forfaitBoutique: false,
    };
  }

  /**
   * Contrôle une commande à livrer : zone desservie, et panier au minimum.
   *
   * Appelé à la création de la commande. Le client voit déjà le verdict à
   * l'écran, mais rien n'empêchait d'envoyer la requête directement.
   */
  static async controlerLaLivraison(
    storeId: string,
    adresse: { latitude?: number | null; longitude?: number | null; texte?: string | null },
    totalDesArticles: number
  ) {
    const verdict = await this.verdict(storeId, adresse);

    if (!verdict.livrable) {
      throw new ApiError(400, verdict.raison, "DELIVERY_OUT_OF_ZONE");
    }

    if (totalDesArticles < verdict.minimum) {
      const manquant = verdict.minimum - totalDesArticles;

      throw new ApiError(
        400,
        `${
          verdict.zone ? `Zone « ${verdict.zone.name} » : ` : ""
        }commande minimum de ${verdict.minimum.toFixed(2)} €. Il vous manque ${manquant.toFixed(
          2
        )} €.`,
        "DELIVERY_BELOW_MINIMUM"
      );
    }

    return verdict;
  }
}
