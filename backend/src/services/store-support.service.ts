import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitNotification } from "../config/socket";
import { AddressService } from "./address.service";

/**
 * La fiche d'une boutique vue par la plateforme, et les rares champs qu'elle
 * peut corriger.
 *
 * La liste des boutiques était un cul-de-sac : on voyait des noms et des
 * compteurs, sans pouvoir ouvrir quoi que ce soit ni rien corriger.
 *
 * **Ce que la plateforme peut changer est délibérément court.** L'adresse et ses
 * coordonnées, parce qu'une adresse mal située fait échouer en silence les zones
 * de livraison *et* l'attribution des courses, sans que le commerçant comprenne
 * pourquoi plus aucun livreur ne vient. Le slug, parce que c'est l'adresse
 * publique du commerce. Le téléphone et l'e-mail, pour pouvoir le joindre.
 *
 * **Le catalogue, les prix, les horaires et les frais n'en font pas partie.**
 * Ils appartiennent au commerçant : les ouvrir ici brouillerait la
 * responsabilité sur ce que paie un client, et dupliquerait son espace.
 *
 * Rien ne se modifie en silence : chaque champ touché part au journal avec son
 * avant et son après, et le commerçant est prévenu.
 */

/** Les seuls champs que la plateforme corrige, et leur nom en français. */
const CHAMPS_CORRIGEABLES = {
  address: "Adresse",
  city: "Ville",
  postalCode: "Code postal",
  latitude: "Latitude",
  longitude: "Longitude",
  slug: "Adresse publique",
  phone: "Téléphone",
  email: "E-mail",
} as const;

export type ChampCorrigeable = keyof typeof CHAMPS_CORRIGEABLES;

export const libelleDuChamp = (champ: string) =>
  CHAMPS_CORRIGEABLES[champ as ChampCorrigeable] || champ;

/** Un slug ne sert que s'il tient dans une URL. */
const SLUG_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class StoreSupportService {
  /** La fiche complète : la boutique, son organisation, son activité. */
  static async fiche(storeId: string) {
    const boutique = await db.store.findFirst({
      where: { id: storeId, deletedAt: null },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            tier: true,
            // Les comptes du commerçant passent par les adhésions : c'est à eux
            // qu'on annonce une correction.
            memberships: {
              select: { role: true, user: { select: { id: true, name: true, email: true } } },
              take: 5,
            },
          },
        },
        _count: { select: { products: true, orders: true, categories: true } },
        deliveryZones: {
          orderBy: [{ type: "asc" }, { radiusKm: "asc" }],
          select: { id: true, name: true, type: true, radiusKm: true, baseFee: true, minOrder: true, isActive: true },
        },
      },
    });

    if (!boutique) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
    }

    const [commandes, derniere] = await Promise.all([
      db.order.aggregate({
        where: { storeId, deletedAt: null },
        _sum: { totalAmount: true },
      }),
      db.order.findFirst({
        where: { storeId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, status: true },
      }),
    ]);

    return {
      ...boutique,
      deliveryCost: Number(boutique.deliveryCost),
      minDeliveryAmount: Number(boutique.minDeliveryAmount),
      rating: Number(boutique.rating),
      deliveryZones: boutique.deliveryZones.map((zone) => ({
        ...zone,
        baseFee: Number(zone.baseFee),
        minOrder: Number(zone.minOrder),
      })),
      chiffreDaffaires: Number(commandes._sum.totalAmount || 0),
      derniereCommande: derniere,
      /**
       * Sans coordonnées, la boutique est invisible de l'attribution et des
       * zones : c'est le premier point à regarder quand un commerçant dit ne
       * plus recevoir de livreur.
       */
      situee: boutique.latitude != null && boutique.longitude != null,
      champsCorrigeables: Object.entries(CHAMPS_CORRIGEABLES).map(([champ, libelle]) => ({
        champ,
        libelle,
      })),
    };
  }

  /**
   * Corrige les champs de support d'une boutique.
   *
   * Rend les changements réellement appliqués, pour que l'appelant les
   * journalise sans avoir à les recalculer.
   */
  static async corriger(
    storeId: string,
    voulu: Partial<Record<ChampCorrigeable, string | number | null>>,
    adminId: string
  ) {
    const boutique = await db.store.findFirst({
      where: { id: storeId, deletedAt: null },
      include: { org: { select: { id: true, name: true } } },
    });

    if (!boutique) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
    }

    // Un champ hors de la liste n'est pas ignoré en silence : le refuser dit à
    // l'appelant que la plateforme n'a pas la main sur cette donnée.
    const hors = Object.keys(voulu).filter((champ) => !(champ in CHAMPS_CORRIGEABLES));

    if (hors.length > 0) {
      throw new ApiError(
        400,
        `La plateforme ne corrige pas ${hors.map(libelleDuChamp).join(", ")} : ce réglage appartient au commerçant`,
        "FIELD_NOT_EDITABLE"
      );
    }

    const donnees: Record<string, unknown> = {};

    if (voulu.slug !== undefined) {
      const slug = String(voulu.slug || "").trim().toLowerCase();

      if (!SLUG_VALIDE.test(slug)) {
        throw new ApiError(
          400,
          "L'adresse publique n'accepte que des minuscules, des chiffres et des tirets",
          "INVALID_SLUG"
        );
      }

      // Deux boutiques au même slug rendraient la vitrine de l'une
      // inaccessible.
      const prise = await db.store.findFirst({
        where: { slug, id: { not: storeId }, deletedAt: null },
        select: { id: true },
      });

      if (prise) {
        throw new ApiError(400, "Cette adresse publique est déjà utilisée", "SLUG_TAKEN");
      }

      donnees.slug = slug;
    }

    if (voulu.email !== undefined) {
      const email = String(voulu.email || "").trim();

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, "E-mail invalide", "INVALID_EMAIL");
      }

      donnees.email = email || null;
    }

    if (voulu.phone !== undefined) {
      const phone = String(voulu.phone || "").trim();
      donnees.phone = phone || null;
    }

    for (const champ of ["address", "city", "postalCode"] as const) {
      if (voulu[champ] !== undefined) {
        const valeur = String(voulu[champ] || "").trim();
        donnees[champ] = valeur || null;
      }
    }

    for (const champ of ["latitude", "longitude"] as const) {
      if (voulu[champ] === undefined) continue;

      if (voulu[champ] === null || voulu[champ] === "") {
        donnees[champ] = null;
        continue;
      }

      const valeur = Number(voulu[champ]);
      const limite = champ === "latitude" ? 90 : 180;

      if (Number.isNaN(valeur) || Math.abs(valeur) > limite) {
        throw new ApiError(400, `${libelleDuChamp(champ)} hors limites`, "INVALID_COORDINATE");
      }

      donnees[champ] = valeur;
    }

    /**
     * Une adresse corrigée sans coordonnées est située d'office.
     *
     * Corriger l'adresse en laissant les anciennes coordonnées serait le pire
     * des deux mondes : le commerçant lirait la bonne adresse et les livreurs
     * continueraient d'aller à l'ancienne.
     */
    let situeeAutomatiquement = false;

    const adresseTouchee =
      donnees.address !== undefined ||
      donnees.city !== undefined ||
      donnees.postalCode !== undefined;

    if (adresseTouchee && donnees.latitude === undefined && donnees.longitude === undefined) {
      const texte = [
        donnees.address ?? boutique.address,
        donnees.postalCode ?? boutique.postalCode,
        donnees.city ?? boutique.city,
      ]
        .filter(Boolean)
        .join(" ");

      const situation = await AddressService.situer(texte);

      if (situation.point) {
        donnees.latitude = situation.point.latitude;
        donnees.longitude = situation.point.longitude;
        situeeAutomatiquement = true;
      }
    }

    // Ne garder que ce qui change vraiment : journaliser un champ réécrit à
    // l'identique noierait les vraies corrections.
    const changements: Record<string, { avant: unknown; apres: unknown }> = {};

    for (const [champ, valeur] of Object.entries(donnees)) {
      const avant = (boutique as unknown as Record<string, unknown>)[champ];
      const avantComparable = avant instanceof Object ? String(avant) : avant;

      if (avantComparable !== valeur) {
        changements[champ] = { avant: avantComparable ?? null, apres: valeur };
      }
    }

    if (Object.keys(changements).length === 0) {
      throw new ApiError(400, "Aucun changement à enregistrer", "NOTHING_TO_CHANGE");
    }

    const misAJour = await db.store.update({ where: { id: storeId }, data: donnees });

    logger.warn("Store corrected by platform", {
      storeId,
      adminId,
      champs: Object.keys(changements),
    });

    await this.prevenirLeCommercant(boutique.org.id, misAJour.name, changements);

    return { boutique: misAJour, changements, situeeAutomatiquement };
  }

  /**
   * Ouvre ou ferme un commerce, depuis la plateforme.
   *
   * Le commerçant a ce bouton dans son espace ; la plateforme, elle, n'avait
   * que le tout ou rien de la suspension du compte. Or fermer une boutique pour
   * l'après-midi — un incident, une demande par téléphone, un commerçant qui a
   * oublié — n'est pas suspendre un compte : ses commandes en cours restent
   * dues, et il rouvre le lendemain.
   *
   * Le geste part au journal avec son motif : une boutique fermée sans
   * explication se traduit par un appel au support.
   */
  static async basculerLOuverture(
    storeId: string,
    ouvert: boolean,
    motif?: string
  ) {
    const boutique = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, isOpen: true, orgId: true, deletedAt: true },
    });

    if (!boutique || boutique.deletedAt) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
    }

    if (boutique.isOpen === ouvert) {
      throw new ApiError(
        400,
        ouvert ? "Cette boutique est déjà ouverte" : "Cette boutique est déjà fermée",
        "NOTHING_TO_CHANGE"
      );
    }

    // Fermer sans dire pourquoi laisse le commerçant sans recours : il voit sa
    // boutique fermée et ne peut que téléphoner.
    if (!ouvert && !motif?.trim()) {
      throw new ApiError(400, "Dites pourquoi vous fermez cette boutique", "REASON_REQUIRED");
    }

    const misAJour = await db.store.update({
      where: { id: storeId },
      data: { isOpen: ouvert },
    });

    await this.prevenirDeLOuverture(boutique.orgId, boutique.name, ouvert, motif);

    return { boutique: misAJour, ouvert, motif: motif?.trim() || null };
  }

  /** Le commerçant doit l'apprendre autrement qu'en voyant ses commandes s'arrêter. */
  private static async prevenirDeLOuverture(
    orgId: string,
    nomDeLaBoutique: string,
    ouvert: boolean,
    motif?: string
  ) {
    const adhesions = await db.membership.findMany({
      where: { orgId },
      select: { user: { select: { email: true } } },
    });

    for (const adhesion of adhesions) {
      const email = adhesion.user?.email;
      if (!email) continue;

      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: ouvert
            ? `${nomDeLaBoutique} a été rouverte`
            : `${nomDeLaBoutique} a été fermée`,
          message: ouvert
            ? "La plateforme a rouvert votre boutique : vous recevez de nouveau des commandes."
            : `La plateforme a fermé votre boutique. Motif : ${motif?.trim()}`,
          recipientEmail: email,
          link: "/merchant",
        },
      });

      emitNotification(email, notification);
    }
  }

  /**
   * Prévient le commerçant de ce que la plateforme a corrigé.
   *
   * Une modification muette se découvre par hasard, des semaines plus tard.
   */
  private static async prevenirLeCommercant(
    orgId: string,
    nomDeLaBoutique: string,
    changements: Record<string, { avant: unknown; apres: unknown }>
  ) {
    const adhesions = await db.membership.findMany({
      where: { orgId },
      select: { user: { select: { email: true } } },
    });

    const comptes = adhesions.map((adhesion) => adhesion.user).filter((user) => !!user?.email);

    if (comptes.length === 0) return;

    const liste = Object.keys(changements).map(libelleDuChamp).join(", ");

    for (const compte of comptes) {
      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: `La plateforme a corrigé ${nomDeLaBoutique}`,
          message: `${liste} — vérifiez que cela vous convient, et dites-le-nous si ce n'est pas le cas.`,
          recipientEmail: compte.email,
          link: "/merchant",
        },
      });

      emitNotification(compte.email, notification);
    }
  }
}
