import { db } from "./db";
import { EmailService } from "./email.service";
import { logger } from "../config/logger";
import { ApiError } from "../middleware/errorHandler";
import { VariantService } from "./variant.service";
import { DeliveryZoneService } from "./delivery-zone.service";
import { PromotionService } from "./promotion.service";
import { emitWebhook } from "./webhook.service";
import { TaxService } from "./tax.service";

export interface OrderData {
  storeId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryType: "PICKUP" | "DELIVERY";
  pickupTime?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostal?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  totalAmount: number;
  taxAmount?: number;
  feesAmount?: number;
  customerId?: string;
  /** Le code saisi par le client. La remise est calculée par le serveur. */
  promoCode?: string;
  /** Le moyen de paiement retenu, parmi ceux que le commerçant propose. */
  paymentMethodId?: string;
  notes?: string;
  items?: {
    productId: string;
    variantId?: string;
    quantity: number;
    price: number;
    selectedOptions?: Record<string, string>;
  }[];
}

export class OrderService {
  /**
   * Rattache la commande à une fiche client, créée au besoin.
   *
   * Les clients sont globaux et identifiés par leur e-mail : une commande
   * passée sans compte doit tout de même alimenter la clientèle du commerçant,
   * sans quoi son carnet d'adresses reste vide.
   */
  /**
   * Le taux de commission qui s'applique à cette commande, maintenant.
   *
   * La facturation le recalculait à l'affichage, au taux de la formule *du
   * jour* : un commerçant passé de Free à Pro voyait toutes ses commandes du
   * mois — et de tout mois rouvert plus tard — refacturées au taux Pro. Dans
   * l'autre sens, la plateforme perdait la différence sur tout l'historique.
   *
   * Le taux est donc lu ici, une fois, et gardé sur la commande.
   */
  private static async commissionDeLaBoutique(storeId: string, montant: number) {
    const boutique = await db.store.findUnique({
      where: { id: storeId },
      select: { org: { select: { tier: true } } },
    });

    const tier = boutique?.org?.tier ?? null;

    const formule = tier
      ? await db.planTier.findUnique({ where: { code: tier }, select: { commissionPercent: true } })
      : null;

    // Le réglage global ne sert que de repli, pour une formule sans taux propre.
    const config = await db.systemConfig.findFirst({ select: { platformFeePercent: true } });

    const taux = Number(formule?.commissionPercent ?? config?.platformFeePercent ?? 5);

    return {
      tier,
      taux,
      montant: Number(((montant * taux) / 100).toFixed(2)),
    };
  }

  private static async resoudreClient(data: OrderData) {
    if (data.customerId) return data.customerId;
    if (!data.customerEmail) return undefined;

    const existant = await db.customer.findUnique({
      where: { email: data.customerEmail },
      select: { id: true },
    });

    if (existant) return existant.id;

    const cree = await db.customer.create({
      data: {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        address: data.deliveryAddress,
        city: data.deliveryCity,
        postalCode: data.deliveryPostal,
      },
      select: { id: true },
    });

    return cree.id;
  }

  static async create(data: OrderData) {
    try {
      /**
       * Une boutique fermée n'accepte pas de commande.
       *
       * Rien ne le vérifiait : le commerçant fermait sa boutique et les
       * commandes continuaient d'arriver. Elle reste visible en vitrine — le
       * client consulte le menu — mais la commande, elle, est refusée ici.
       */
      const boutique = await db.store.findUnique({
        where: { id: data.storeId },
        select: { isOpen: true, deletedAt: true, name: true },
      });

      if (!boutique || boutique.deletedAt) {
        throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
      }

      if (!boutique.isOpen) {
        throw new ApiError(
          400,
          `« ${boutique.name} » est momentanément indisponible et n'accepte pas de commande.`,
          "STORE_CLOSED"
        );
      }

      const customerId = await this.resoudreClient(data);

      // On refuse la commande entière si un article n'est plus disponible :
      // mieux vaut un message clair qu'une commande amputée en silence.
      const lignes = data.items || [];

      /**
       * Les lignes, avec leur prix recalculé.
       *
       * Le prix arrivait du navigateur et n'était jamais recoupé : une pizza à
       * 14 € pouvait être commandée à un centime, et le total avec. Le serveur
       * le relit du catalogue — ou de la déclinaison choisie.
       */
      const lignesTarifees: {
        productId: string;
        variantId?: string;
        quantity: number;
        price: number;
        selectedOptions?: Record<string, string>;
      }[] = [];

      if (lignes.length > 0) {
        const produits = await db.product.findMany({
          where: { id: { in: lignes.map((l) => l.productId) } },
          select: { id: true, name: true, storeId: true, isAvailable: true, deletedAt: true },
        });

        for (const ligne of lignes) {
          const produit = produits.find((p) => p.id === ligne.productId);

          if (!produit || produit.deletedAt || produit.storeId !== data.storeId) {
            throw new ApiError(400, "Un article du panier n'existe plus", "PRODUCT_NOT_FOUND");
          }

          if (!produit.isAvailable) {
            throw new ApiError(
              400,
              `« ${produit.name} » n'est plus disponible`,
              "PRODUCT_UNAVAILABLE"
            );
          }

          if (!Number.isInteger(ligne.quantity) || ligne.quantity < 1) {
            throw new ApiError(400, "Une quantité doit être un entier positif", "INVALID_QUANTITY");
          }

          lignesTarifees.push({
            ...ligne,
            price: await VariantService.prixDeLaLigne(ligne.productId, ligne.variantId),
          });
        }
      }

      // Le total suit les lignes, et non ce que le navigateur annonce.
      const totalDesLignes = lignesTarifees.reduce(
        (somme, ligne) => somme + ligne.price * ligne.quantity,
        0
      );

      /**
       * Les frais de livraison viennent de la zone, pas du navigateur.
       *
       * Les zones existaient en base sans que rien ne les applique : la
       * commande facturait le forfait de la boutique et acceptait n'importe
       * quel montant, où que soit le client.
       */
      let fraisDeLivraison = Number(data.feesAmount || 0);

      if (data.deliveryType === "DELIVERY" && lignesTarifees.length > 0) {
        const verdict = await DeliveryZoneService.controlerLaLivraison(
          data.storeId,
          {
            latitude: data.deliveryLat,
            longitude: data.deliveryLng,
            // L'adresse écrite à la main, pour la situer à défaut de
            // coordonnées : sans elle, commander sans passer par une
            // suggestion était impossible.
            texte: [data.deliveryAddress, data.deliveryPostal, data.deliveryCity]
              .filter(Boolean)
              .join(" "),
          },
          Number(totalDesLignes.toFixed(2))
        );

        fraisDeLivraison = verdict.frais;
      }

      /**
       * La remise, calculée par le serveur.
       *
       * Le code promo n'était ni vérifié ni conservé : la commande ne gardait
       * aucune trace de la remise, et le commerçant ne savait pas quel code
       * avait servi. Un code refusé fait échouer la commande plutôt que de
       * passer en silence au prix plein — le client a vu un prix remisé.
       */
      let remise = 0;
      let codePromo: string | null = null;

      if (data.promoCode && lignesTarifees.length > 0) {
        const validation = await PromotionService.validateAndApply(
          data.storeId,
          data.promoCode,
          Number(totalDesLignes.toFixed(2)),
          lignesTarifees.map((ligne) => ligne.productId)
        );

        remise = Number(validation.discountAmount.toFixed(2));
        codePromo = validation.promotion.code;

        // Le compteur d'utilisations n'avançait jamais : une limite de dix
        // usages n'en limitait aucun.
        await PromotionService.applyPromotion(validation.promotion.id);
      }

      /** Le moyen de paiement doit être celui de cette boutique, et actif. */
      let moyenDePaiement: { id: string; name: string } | null = null;

      if (data.paymentMethodId) {
        const propose = await db.paymentMethod.findFirst({
          where: { id: data.paymentMethodId, storeId: data.storeId, isActive: true },
          select: { id: true, name: true },
        });

        if (!propose) {
          throw new ApiError(
            400,
            "Ce moyen de paiement n'est pas proposé par ce commerce",
            "PAYMENT_METHOD_UNAVAILABLE"
          );
        }

        moyenDePaiement = propose;
      }

      /**
       * La taxe, calculée ici et non annoncée par le navigateur.
       *
       * `data.taxAmount` était pris tel quel ; aucun écran ne l'envoyant, toute
       * commande naissait avec zéro de taxe. Le taux réglé par le commerçant ne
       * servait à rien, et son ticket n'avait pas de TVA à montrer.
       */
      const taxe = await TaxService.taxeDesLignes(
        data.storeId,
        lignesTarifees.map((ligne) => ({
          productId: ligne.productId,
          montant: ligne.price * ligne.quantity,
        }))
      );

      const totalCalcule = lignesTarifees.length > 0
        ? Number(
            (totalDesLignes + taxe.aAjouter + fraisDeLivraison - remise).toFixed(2)
          )
        : Number(data.totalAmount);

      /**
       * La commission de la plateforme, figée sur la commande.
       *
       * Elle se recalculait à chaque affichage de la facturation, au taux de la
       * formule *actuelle* du commerçant : changer sa formule refacturait tout
       * son historique au nouveau taux. Une commande passée sous une formule
       * doit rester facturée au taux de cette formule.
       */
      const commission = await this.commissionDeLaBoutique(data.storeId, totalCalcule);

      /**
       * Les bornes de la plateforme.
       *
       * `minOrderAmount` et `maxOrderAmount` étaient réglables dans
       * Configuration, affichés, enregistrés — et appliqués nulle part. Un
       * garde-fou qui ne garde rien vaut moins que pas de garde-fou : on croit
       * être protégé.
       */
      const bornes = await db.systemConfig.findFirst({
        select: { minOrderAmount: true, maxOrderAmount: true },
      });

      const minimum = Number(bornes?.minOrderAmount ?? 0);
      const maximum = Number(bornes?.maxOrderAmount ?? 0);

      if (minimum > 0 && totalCalcule < minimum) {
        throw new ApiError(
          400,
          `Le montant minimum d'une commande est de ${minimum.toFixed(2)} €.`,
          "BELOW_PLATFORM_MINIMUM"
        );
      }

      if (maximum > 0 && totalCalcule > maximum) {
        throw new ApiError(
          400,
          `Le montant maximum d'une commande est de ${maximum.toFixed(2)} €. Passez plusieurs commandes.`,
          "ABOVE_PLATFORM_MAXIMUM"
        );
      }

      const order = await db.order.create({
        data: {
          storeId: data.storeId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          deliveryType: data.deliveryType as any,
          pickupTime: data.pickupTime ? new Date(data.pickupTime) : null,
          deliveryAddress: data.deliveryAddress,
          deliveryCity: data.deliveryCity,
          deliveryPostal: data.deliveryPostal,
          deliveryLat: data.deliveryLat,
          deliveryLng: data.deliveryLng,
          totalAmount: totalCalcule,
          feesAmount: fraisDeLivraison,
          promoCode: codePromo,
          discountAmount: remise,
          paymentMethodId: moyenDePaiement?.id,
          paymentMethodName: moyenDePaiement?.name,
          customerId,
          notes: data.notes,
          taxAmount: taxe.total,
          taxRate: taxe.taux,
          commissionPercent: commission.taux,
          commissionAmount: commission.montant,
          tierAtOrder: commission.tier,
          status: "PENDING" as any,
          paymentStatus: "PENDING" as any,
          items: {
            create: lignesTarifees.map((ligne, index) => ({
              productId: ligne.productId,
              variantId: ligne.variantId,
              quantity: ligne.quantity,
              price: ligne.price,
              total: Number((ligne.price * ligne.quantity).toFixed(2)),
              selectedOptions: ligne.selectedOptions || {},
              // La taxe de cette ligne, figée au moment de la commande.
              // Permet le récapitulatif multi-taux (6 % nourriture + 21 % boissons)
              // sur le ticket, sans avoir à recalculer après coup.
              taxRate:   taxe.parLigne[index]?.taxRate   ?? 0,
              taxAmount: taxe.parLigne[index]?.taxAmount ?? 0,
            })),
          },
        },
        include: {
          items: {
            include: { product: { include: { category: { select: { name: true } } } }, variant: true },
          },
        },
      });

      try {
        await EmailService.sendOrderConfirmation(order);
      } catch (emailErr) {
        logger.warn("Email notification failed, but order was created", { error: emailErr });
      }

      // L'événement était proposé à l'abonnement et n'était émis nulle part :
      // une caisse branchée dessus n'a jamais vu passer une seule commande.
      emitWebhook("order.created", {
        orderId: order.id,
        storeId: order.storeId,
        status: order.status,
        deliveryType: order.deliveryType,
        totalAmount: Number(order.totalAmount),
        customerName: order.customerName,
        createdAt: order.createdAt,
      });

      return order;
    } catch (error: any) {
      throw error;
    }
  }

  static async getById(id: string) {
    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { include: { category: { select: { name: true } } } }, variant: true },
        },
        payments: true,
      },
    });

    if (!order) {
      throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
    }

    return order;
  }

  static async getByStoreId(storeId: string, limit: number = 100, offset: number = 0) {
    return await db.order.findMany({
      where: { storeId },
      include: {
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  static async getByStatus(storeId: string, status: string, limit: number = 50) {
    return await db.order.findMany({
      where: { storeId, status: status as any },
      include: {
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async updateStatus(id: string, status: string) {
    try {
      // L'ancien état est lu avant la mise à jour : un abonné qui reçoit « la
      // commande est prête » sans savoir d'où elle vient ne peut pas distinguer
      // une préparation qui avance d'un renvoi du même état.
      const avant = await db.order.findUnique({ where: { id }, select: { status: true } });

      const commande = await db.order.update({
        where: { id },
        data: { status: status as any },
        include: {
          items: true,
        },
      });

      emitWebhook("order.status_changed", {
        orderId: commande.id,
        storeId: commande.storeId,
        previousStatus: avant?.status ?? null,
        status: commande.status,
        totalAmount: Number(commande.totalAmount),
      });

      return commande;
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }
      throw error;
    }
  }

  static async addOrderItem(
    orderId: string,
    productId: string,
    quantity: number,
    // Conservé pour ne pas casser les appelants, mais ignoré : le prix se lit
    // dans le catalogue.
    _prixAnnonce: number,
    variantId?: string,
    selectedOptions?: Record<string, string>
  ) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");

    // Le suivi chiffré du stock est remplacé par une simple disponibilité que
    // le commerçant bascule lui-même : un restaurant ne compte pas ses plats,
    // il indique ce qui est épuisé.
    if (!product.isAvailable) {
      throw new ApiError(400, `« ${product.name} » n'est plus disponible`, "PRODUCT_UNAVAILABLE");
    }

    // Le prix vient du catalogue, pas de l'appelant : c'est le même contrôle
    // que pour une commande entière, et il vaut aussi pour un ajout isolé.
    const prixReel = await VariantService.prixDeLaLigne(productId, variantId);
    const total = prixReel * quantity;

    const orderItem = await db.orderItem.create({
      data: {
        orderId,
        productId,
        variantId,
        quantity,
        price: prixReel,
        total,
        selectedOptions: selectedOptions || {},
      },
      include: { product: true },
    });

    return orderItem;
  }

  static async countByStoreId(storeId: string) {
    return await db.order.count({ where: { storeId } });
  }

  static async getRecentOrders(storeId: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await db.order.findMany({
      where: {
        storeId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getOrderWithItems(id: string) {
    const commande = await db.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { include: { category: { select: { name: true } } } }, variant: true },
        },
        payments: true,
        delivery: {
          select: { status: true, deliveryCode: true, proofType: true, proofAt: true },
        },
      },
    });

    if (!commande) return null;

    // Le code de remise se lit avec la commande : c'est ce que le client donne
    // au livreur à la porte, et une commande suivie sans compte n'a pas
    // d'autre endroit où le lire. Remise, il n'a plus d'objet.
    const { delivery, ...reste } = commande;

    return {
      ...reste,
      delivery,
      codeRemise:
        delivery && delivery.status !== "DELIVERED" ? delivery.deliveryCode : null,
      preuveDeLivraison: delivery?.proofType ?? null,
    };
  }

  static async delete(id: string) {
    try {
      return await db.order.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }
      throw error;
    }
  }

  static async getByOrgId(orgId: string, status?: string, limit: number = 100, offset: number = 0) {
    const whereClause: any = {
      store: { orgId },
    };

    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    return await db.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: { product: true },
        },
        store: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Le chiffre d'affaires d'une organisation, toutes boutiques confondues.
   *
   * La page d'accueil du commerçant affichait « 0,00 € » et « 0 commande » en
   * dur : les deux compteurs n'étaient jamais renseignés.
   */
  static async chiffreAffairesOrg(orgId: string, status?: string) {
    const where: any = { store: { orgId }, deletedAt: null };
    if (status && status !== "ALL") where.status = status;

    const somme = await db.order.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: true,
    });

    return {
      commandes: somme._count,
      chiffreAffaires: Number(somme._sum.totalAmount || 0),
    };
  }

  static async countByOrgId(orgId: string, status?: string) {
    const whereClause: any = {
      store: { orgId },
    };

    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    return await db.order.count({ where: whereClause });
  }
}
