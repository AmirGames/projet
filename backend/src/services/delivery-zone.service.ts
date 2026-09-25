import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { distanceKm, estUnPoint, pointDansPolygone, airePolygone, Point } from "../utils/geo";
import { AddressService } from "./address.service";
import { modeDeLivraison, ModeDeLivraison } from "./delivery-mode.service";
import { DispatchService } from "./dispatch.service";

/**
 * Les zones de livraison d'une boutique.
 *
 * Deux formes possibles : des anneaux concentriques autour du commerce
 * (type RADIUS, chacun avec ses frais et son montant minimum, comme chez Uber
 * Eats), ou des polygones dessinés à la main (type POLYGON) pour coller à une
 * vraie limite — une rivière, une voie ferrée, un quartier — qu'un cercle ne
 * peut pas suivre. La zone la plus « spécifique » qui contient l'adresse
 * s'applique : le rayon le plus petit, ou à défaut le polygone de plus petite
 * aire, parmi celles qui la couvrent.
 *
 * Le modèle existait depuis le début avec un nom, des frais et un minimum,
 * mais sans géométrie utilisable — un point sans rayon — et surtout : rien ne
 * l'appliquait. La commande facturait les frais forfaitaires de la boutique et
 * acceptait n'importe quel montant, de n'importe où.
 */

export type ZoneType = "RADIUS" | "POLYGON";

export interface DeliveryZoneData {
  storeId: string;
  name: string;
  type?: ZoneType;
  radiusKm?: number | null;
  polygon?: Point[] | null;
  color?: string;
  opacity?: number;
  baseFee: number;
  minOrder: number;
  deliveryMinutes?: number | null;
  isActive?: boolean;
}

export interface ZoneLisible {
  id: string;
  name: string;
  type: ZoneType;
  radiusKm: number | null;
  polygon: Point[] | null;
  color: string;
  opacity: number;
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
  /** Distance entre la boutique et l'adresse, en kilomètres. Sans objet pour une zone polygone. */
  distanceKm: number | null;
  /** Les frais à facturer. */
  frais: number;
  /** Le montant minimum de commande. */
  minimum: number;
  /** Pourquoi ce n'est pas livrable, en clair. */
  raison: string;
  /** Vrai quand aucune zone n'est définie : on retombe sur le forfait boutique. */
  forfaitBoutique: boolean;
  /** Qui livre : le commerçant (OWN) ou un livreur de la plateforme (PLATFORM). */
  mode: ModeDeLivraison;
}

/** Une couleur par défaut différente pour chaque nouvelle zone, sans que le
 * commerçant ait à y penser — il peut toujours la changer ensuite. */
const PALETTE = ["#f59e0b", "#3b82f6", "#22c55e", "#ec4899", "#a855f7", "#06b6d4", "#ef4444", "#84cc16"];

const HEX_VALIDE = /^#[0-9a-fA-F]{6}$/;

const lisible = (zone: any): ZoneLisible => ({
  id: zone.id,
  name: zone.name,
  type: zone.type,
  radiusKm: zone.radiusKm == null ? null : Number(zone.radiusKm),
  polygon: (zone.polygon as Point[] | null) ?? null,
  color: zone.color,
  opacity: Number(zone.opacity),
  baseFee: Number(zone.baseFee),
  minOrder: Number(zone.minOrder),
  deliveryMinutes: zone.deliveryMinutes ?? null,
  isActive: zone.isActive,
});

/** La « spécificité » d'une zone : la plus petite gagne quand plusieurs zones
 * contiennent la même adresse. Un rayon se compare à un rayon ; un polygone,
 * à son aire — les deux échelles ne se valent pas exactement, mais départager
 * les cas de recouvrement importe plus que leur exactitude. */
function specificite(zone: ZoneLisible): number {
  if (zone.type === "RADIUS") return zone.radiusKm ?? Infinity;
  if (zone.polygon && zone.polygon.length >= 3) return airePolygone(zone.polygon);
  return Infinity;
}

export class DeliveryZoneService {
  static async create(data: DeliveryZoneData) {
    const nom = (data.name || "").trim();
    const type: ZoneType = data.type === "POLYGON" ? "POLYGON" : "RADIUS";

    if (!nom) {
      throw new ApiError(400, "Une zone a besoin d'un nom", "MISSING_NAME");
    }

    if (data.baseFee < 0 || data.minOrder < 0) {
      throw new ApiError(400, "Ni les frais ni le minimum ne peuvent être négatifs", "INVALID_AMOUNT");
    }

    if (type === "RADIUS") {
      if (!(data.radiusKm && data.radiusKm > 0)) {
        throw new ApiError(400, "Le rayon doit être supérieur à zéro", "INVALID_RADIUS");
      }

      // Deux anneaux de même rayon se disputeraient la même adresse.
      const memeRayon = await db.deliveryZone.findFirst({
        where: { storeId: data.storeId, type: "RADIUS", radiusKm: data.radiusKm },
        select: { name: true },
      });

      if (memeRayon) {
        throw new ApiError(
          409,
          `« ${memeRayon.name} » couvre déjà ${data.radiusKm} km. Choisissez un autre rayon.`,
          "DUPLICATE_RADIUS"
        );
      }
    } else {
      if (!data.polygon || data.polygon.length < 3) {
        throw new ApiError(400, "Un polygone a besoin d'au moins 3 sommets", "INVALID_POLYGON");
      }
    }

    if (data.color && !HEX_VALIDE.test(data.color)) {
      throw new ApiError(400, "La couleur doit être un code hexadécimal (#rrggbb)", "INVALID_COLOR");
    }

    if (data.opacity !== undefined && (data.opacity < 0.1 || data.opacity > 0.9)) {
      throw new ApiError(400, "L'opacité doit être comprise entre 0.1 et 0.9", "INVALID_OPACITY");
    }

    const compte = await db.deliveryZone.count({ where: { storeId: data.storeId } });

    return db.deliveryZone.create({
      data: {
        storeId: data.storeId,
        name: nom,
        type,
        radiusKm: type === "RADIUS" ? data.radiusKm : null,
        polygon: type === "POLYGON" ? (data.polygon as any) : undefined,
        color: data.color || PALETTE[compte % PALETTE.length],
        opacity: data.opacity ?? 0.35,
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

  /** Les zones d'une boutique, du plus petit anneau au plus grand, puis les polygones. */
  static async getByStoreId(storeId: string) {
    const zones = await db.deliveryZone.findMany({
      where: { storeId },
      orderBy: [{ type: "asc" }, { radiusKm: "asc" }, { createdAt: "asc" }],
    });

    return zones.map(lisible);
  }

  static async update(id: string, data: Partial<DeliveryZoneData>) {
    const existante = await this.getById(id);

    if (data.type && data.type !== existante.type) {
      throw new ApiError(
        400,
        "Impossible de changer la forme d'une zone existante (rayon ↔ polygone) : supprimez-la et recréez-la.",
        "TYPE_IMMUTABLE"
      );
    }

    if ((data.baseFee !== undefined && data.baseFee < 0) || (data.minOrder !== undefined && data.minOrder < 0)) {
      throw new ApiError(400, "Ni les frais ni le minimum ne peuvent être négatifs", "INVALID_AMOUNT");
    }

    if (data.color && !HEX_VALIDE.test(data.color)) {
      throw new ApiError(400, "La couleur doit être un code hexadécimal (#rrggbb)", "INVALID_COLOR");
    }

    if (data.opacity !== undefined && (data.opacity < 0.1 || data.opacity > 0.9)) {
      throw new ApiError(400, "L'opacité doit être comprise entre 0.1 et 0.9", "INVALID_OPACITY");
    }

    if (existante.type === "RADIUS" && data.radiusKm !== undefined) {
      if (data.radiusKm === null || !(data.radiusKm > 0)) {
        throw new ApiError(400, "Le rayon doit être supérieur à zéro", "INVALID_RADIUS");
      }

      if (data.radiusKm !== existante.radiusKm) {
        const memeRayon = await db.deliveryZone.findFirst({
          where: { storeId: existante.storeId, type: "RADIUS", radiusKm: data.radiusKm, id: { not: id } },
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
    }

    if (existante.type === "POLYGON" && data.polygon !== undefined && data.polygon !== null && data.polygon.length < 3) {
      throw new ApiError(400, "Un polygone a besoin d'au moins 3 sommets", "INVALID_POLYGON");
    }

    try {
      return await db.deliveryZone.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(existante.type === "RADIUS" && data.radiusKm !== undefined ? { radiusKm: data.radiusKm } : {}),
          ...(existante.type === "POLYGON" && data.polygon !== undefined ? { polygon: data.polygon as any } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.opacity !== undefined ? { opacity: data.opacity } : {}),
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
      orderBy: [{ storeId: "asc" }, { type: "asc" }, { radiusKm: "asc" }],
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
        address: true,
        city: true,
        postalCode: true,
        acceptsDelivery: true,
        deliveryCost: true,
        minDeliveryAmount: true,
        settings: true,
      },
    });

    if (!boutique) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
    }

    const verdict = await this.verdictSansMode(boutique, storeId, adresse);
    return { ...verdict, mode: modeDeLivraison(boutique.settings) };
  }

  private static async verdictSansMode(
    boutique: {
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      city: string | null;
      postalCode: string | null;
      acceptsDelivery: boolean;
      deliveryCost: unknown;
      minDeliveryAmount: unknown;
      settings: unknown;
    },
    storeId: string,
    adresse: { latitude?: number | null; longitude?: number | null; texte?: string | null }
  ): Promise<Omit<Verdict, "mode">> {

    /**
     * La boutique se situe elle-même, une fois.
     *
     * Le formulaire de création jetait les coordonnées de l'adresse choisie :
     * toutes les boutiques créées avant ce correctif sont sans position, et le
     * client s'entendait répondre « cette boutique n'a pas encore situé son
     * adresse » au moment de payer. On la retrouve ici, et on l'enregistre :
     * le commerçant n'a rien à ressaisir.
     */
    if (!estUnPoint({ latitude: boutique.latitude, longitude: boutique.longitude })) {
      const ecrite = [boutique.address, boutique.postalCode, boutique.city]
        .filter(Boolean)
        .join(" ");

      if (ecrite.trim().length >= 3) {
        const situee = await AddressService.situer(ecrite);

        if (situee.point) {
          boutique.latitude = situee.point.latitude;
          boutique.longitude = situee.point.longitude;

          await db.store
            .update({ where: { id: storeId }, data: situee.point })
            .catch(() => undefined);
        }
      }
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

    /**
     * Les livreurs de la plateforme : ni zones ni forfait du commerçant.
     *
     * Le rayon est celui de la plateforme (Configuration système), et les
     * frais se calculent sur la distance entre la boutique et le client, avec
     * le barème des livreurs : c'est exactement ce que le livreur touchera.
     */
    if (modeDeLivraison(boutique.settings) === "PLATFORM") {
      return this.verdictLivreursPlateforme(boutique, adresse, forfait.minimum);
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
      // Le client habite près de la boutique : c'est le meilleur repère pour
      // départager deux rues homonymes, de part et d'autre d'une frontière.
      const situee = await AddressService.situer(adresse.texte as string, depart);

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

    // Parmi toutes les zones qui contiennent l'adresse — anneaux et polygones
    // mélangés — la plus spécifique gagne : le plus petit rayon, ou à défaut
    // le polygone de plus petite aire.
    const candidates = zones.filter((candidate) =>
      candidate.type === "RADIUS"
        ? candidate.radiusKm != null && distance <= candidate.radiusKm
        : pointDansPolygone(
            { latitude: point.latitude as number, longitude: point.longitude as number },
            candidate.polygon || []
          )
    );

    const zone = candidates.sort((a, b) => specificite(a) - specificite(b))[0] ?? null;

    if (!zone) {
      const rayons = zones.filter((z) => z.type === "RADIUS" && z.radiusKm != null);
      const aUnPolygone = zones.some((z) => z.type === "POLYGON");

      const raisonPortee =
        rayons.length > 0
          ? `au-delà de la zone livrée (${Math.max(...rayons.map((z) => z.radiusKm as number))} km)${
              aUnPolygone ? " et hors des zones dessinées" : ""
            }`
          : "hors des zones dessinées";

      return {
        livrable: false,
        zone: null,
        distanceKm: Number(distance.toFixed(2)),
        frais: 0,
        minimum: 0,
        raison: `Cette adresse est à ${distance.toFixed(1)} km, ${raisonPortee}.`,
        forfaitBoutique: false,
      };
    }

    return {
      livrable: true,
      zone,
      // Sans objet pour une zone polygone : la distance ne dit rien de la
      // couverture, seul le tracé compte.
      distanceKm: zone.type === "RADIUS" ? Number(distance.toFixed(2)) : null,
      frais: zone.baseFee,
      minimum: zone.minOrder,
      raison: "",
      forfaitBoutique: false,
    };
  }

  /**
   * Le verdict quand un livreur de la plateforme fait la course.
   *
   * La distance est à vol d'oiseau, comme pour la rémunération du livreur : le
   * client paie ce que le livreur touchera, au centime près.
   */
  private static async verdictLivreursPlateforme(
    boutique: { latitude: number | null; longitude: number | null },
    adresse: { latitude?: number | null; longitude?: number | null; texte?: string | null },
    minimum: number
  ): Promise<Omit<Verdict, "mode">> {
    const refus = (raison: string, distance: number | null = null) => ({
      livrable: false,
      zone: null,
      distanceKm: distance,
      frais: 0,
      minimum,
      raison,
      forfaitBoutique: false,
    });

    const depart = { latitude: boutique.latitude, longitude: boutique.longitude };

    if (!estUnPoint(depart)) {
      return refus(
        "Cette boutique n'a pas encore situé son adresse : la livraison ne peut pas être calculée."
      );
    }

    let point = adresse;

    if (!estUnPoint(point) && (adresse.texte || "").trim().length >= 3) {
      // Le client habite près de la boutique : c'est le meilleur repère pour
      // départager deux rues homonymes, de part et d'autre d'une frontière.
      const situee = await AddressService.situer(adresse.texte as string, depart);

      if (situee.point) {
        point = situee.point;
      } else if (!situee.disponible) {
        // Sans position, pas de distance, donc pas de prix : on ne peut pas
        // inventer ce que le livreur touchera.
        return refus(
          "Le calcul des frais de livraison est momentanément indisponible. Choisissez votre adresse dans les suggestions."
        );
      } else {
        return refus(
          "Nous n'avons pas trouvé cette adresse. Vérifiez-la, ou choisissez-la dans les suggestions."
        );
      }
    }

    if (!estUnPoint(point)) {
      return refus("Saisissez votre adresse pour connaître les frais de livraison.");
    }

    const distance = distanceKm(
      { latitude: depart.latitude as number, longitude: depart.longitude as number },
      { latitude: point.latitude as number, longitude: point.longitude as number }
    );
    const arrondie = Number(distance.toFixed(2));

    const reglages = await DispatchService.reglages();

    if (distance > reglages.maxRadiusKm) {
      return refus(
        `Cette adresse est à ${distance.toFixed(1)} km, au-delà de la zone livrée (${reglages.maxRadiusKm} km).`,
        arrondie
      );
    }

    return {
      livrable: true,
      zone: null,
      distanceKm: arrondie,
      frais: DispatchService.remuneration(arrondie, reglages).payout,
      minimum,
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
