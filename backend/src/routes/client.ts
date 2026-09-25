import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { fraisDeServiceEnVigueur } from "../services/delivery-mode.service";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { distanceKm, estUnPoint } from "../utils/geo";
import { boutiqueVisible, livreVraiment } from "../utils/visibilite-boutique";
import { StoreHoursService } from "../services/store-hours.service";
import { genreDuCommerce } from "../services/store-type.service";
import { trierProduitsSelonCategorie } from "../services/category.service";
import { DeliveryZoneService } from "../services/delivery-zone.service";
import { authMiddleware } from "../middleware/auth";
import { avisARedemander, avisRestaurantParCommerce } from "../services/avis-client.service";
import { avecLaVraieNote } from "../services/review.service";
import { CustomerCartService, panierSchema } from "../services/customer-cart.service";
import {
  COMMENTAIRE_MAX,
  NOTE_MAX,
  NOTE_MIN,
  noterLivreur,
} from "../services/driver-rating.service";

const router = Router();

/** « be », « fr »… : le pays de la région du site, en deux lettres. */
const paysDemande = (brut: unknown) =>
  typeof brut === "string" && /^[a-z]{2}$/i.test(brut) ? brut.toLowerCase() : undefined;

// GET /api/client/stores - Get all stores (public)
router.get("/stores", async (req: Request, res: Response, next: NextFunction) => {
  try {
    /**
     * `?pays=be` : les commerces de ce pays seulement — la région du site
     * (/be-fr/…) décide de ce qu'on liste. Une boutique dont le pays n'est
     * pas encore connu reste listée partout : mieux vaut une boutique de trop
     * qu'un commerce devenu introuvable.
     */
    const pays = paysDemande(req.query.pays);

    const stores = await db.store.findMany({
      /**
       * Une boutique fermée reste dans la liste.
       *
       * Elle en disparaissait entièrement : le client croyait le commerce parti.
       * Elle est maintenant listée avec son `isOpen`, que la vitrine affiche en
       * « momentanément indisponible » — on peut voir le menu, pas commander.
       */
      // Un commerce pas encore validé ne se montre pas : il prépare sa
      // boutique, il ne vend pas encore.
      where: {
        deletedAt: null,
        org: { status: "ACTIVE", approvedAt: { not: null } },
        ...(pays && { OR: [{ countryCode: pays }, { countryCode: null }] }),
      },
      include: {
        org: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
          take: 5
        }
      },
      orderBy: { name: "asc" }
    });

    res.json({
      success: true,
      count: stores.length,
      data: (await avecLaVraieNote(stores)).map((store) => ({
        ...store,
        // Ce que disent à la fois le planning hebdomadaire et le bouton
        // rapide, croisés — pas juste le bouton, sinon un jour fermé dans les
        // horaires n'a jamais d'effet ici.
        isOpenNow: StoreHoursService.isOpenNow(store),
        // La famille (Pizzas, Sushis…) pour filtrer, et le libellé précis.
        ...genreDuCommerce(store),
      })),
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

    // Récupérer tous les stores avec localisation
    const stores = await db.store.findMany({
      where: {
        // Fermée ou non : c'est la vitrine qui le dit, pas cette liste.
        deletedAt: null,
        org: { status: "ACTIVE", approvedAt: { not: null } },
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        org: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
          take: 3
        }
      }
    });

    // Au-delà, aucun commerce de quartier ne livre : on n'interroge même pas
    // ses zones, pour ne pas calculer un verdict par boutique du pays.
    const PORTEE_MAX_KM = Math.max(50, maxDist);

    const proches = stores
      .map((store) => ({
        store,
        distance: distanceKm(
          { latitude: lat, longitude: lng },
          { latitude: store.latitude as number, longitude: store.longitude as number }
        ),
      }))
      .filter(({ distance }) => distance <= PORTEE_MAX_KM);

    // `maxDistance` n'est plus un couperet : c'est le rayon où l'on montre
    // aussi les boutiques qui ne livrent pas, pour un retrait sur place. Au
    // delà, seules restent celles dont les zones couvrent vraiment l'adresse.
    const evaluees = await Promise.all(
      proches.map(async ({ store, distance }) => {
        const verdict = await DeliveryZoneService.verdict(store.id, { latitude: lat, longitude: lng }).catch(
          () => null
        );
        const livre = livreVraiment(verdict, distance, maxDist);

        return {
          visible: boutiqueVisible(verdict, distance, maxDist),
          store: {
            ...store,
            distance: parseFloat(distance.toFixed(2)),
            estimatedDeliveryTime: Math.ceil(distance * 5) + " min",
            isOpenNow: StoreHoursService.isOpenNow(store),
            // La famille (Pizzas, Sushis…) pour filtrer, et le libellé précis.
            ...genreDuCommerce(store),
            // Un calcul qui échoue ne prive pas le client de la boutique.
            livraison: verdict
              ? {
                  livrable: livre,
                  frais: verdict.frais,
                  minimum: verdict.minimum,
                  deliveryMinutes: verdict.zone?.deliveryMinutes ?? null,
                }
              : null,
          },
        };
      })
    );

    // Celles qui livrent d'abord, puis les autres ; la plus proche en tête.
    const avecLivraison = evaluees
      .filter(({ visible }) => visible)
      .map(({ store }) => store)
      .sort(
        (a, b) =>
          Number(b.livraison?.livrable !== false) - Number(a.livraison?.livrable !== false) ||
          a.distance - b.distance
      );

    res.json({
      success: true,
      count: avecLivraison.length,
      data: await avecLaVraieNote(avecLivraison)
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

    const stores = await db.store.findMany({
      where: {
        deletedAt: null,
        org: { status: "ACTIVE", approvedAt: { not: null } },
        OR: [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { description: { contains: searchQuery, mode: "insensitive" } },
          { city: city ? { contains: city as string, mode: "insensitive" } : undefined }
        ].filter(Boolean) as any
      },
      include: {
        org: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
          take: 3
        }
      },
      take: parseInt(limit as string)
    });

    res.json({
      success: true,
      count: stores.length,
      data: (await avecLaVraieNote(stores)).map((store) => ({
        ...store,
        isOpenNow: StoreHoursService.isOpenNow(store),
        // La famille (Pizzas, Sushis…) pour filtrer, et le libellé précis.
        ...genreDuCommerce(store),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Regroupe les produits par catégorie, dans l'ordre choisi par le commerçant.
 *
 * Les catégories sortent dans leur propre ordre d'affichage, et les produits
 * dans le leur : c'est tout l'intérêt du glisser-déposer côté commerçant, qui
 * était enregistré mais jamais relu ici.
 *
 * Un produit épuisé n'est pas retiré. Le masquer laisse le client chercher en
 * vain un plat qu'il commande d'habitude ; le montrer barré lui dit ce qui se
 * passe, et qu'il peut revenir demain.
 */
/**
 * Les déclinaisons telles que le client doit les recevoir.
 *
 * Elles arrivaient brutes : sans ordre, et sans le prix réellement payé. La
 * page n'a pas à savoir qu'un prix vide signifie « celui du plat ».
 */
function declinaisonsLisibles(produit: any) {
  const variantes = Array.isArray(produit.variants) ? produit.variants : [];

  return variantes
    .slice()
    .sort((a: any, b: any) =>
      a.displayOrder !== b.displayOrder
        ? a.displayOrder - b.displayOrder
        : String(a.label).localeCompare(String(b.label), "fr")
    )
    .map((variante: any) => ({
      id: variante.id,
      label: variante.label,
      price: variante.price === null ? null : Number(variante.price),
      prixEffectif: Number(variante.price ?? produit.price),
      isAvailable: variante.isAvailable,
    }));
}

function regrouperParCategorie(produits: any[]) {
  const categories = new Map<string, { ordre: number; sortMode: string | undefined; produits: any[] }>();

  for (const produit of produits) {
    const nom = produit.category?.name || "Autres";

    if (!categories.has(nom)) {
      categories.set(nom, {
        // Sans catégorie, on passe en dernier plutôt qu'en premier.
        ordre: produit.category ? produit.category.displayOrder ?? 0 : Number.MAX_SAFE_INTEGER,
        sortMode: produit.category?.sortMode,
        produits: [],
      });
    }

    categories.get(nom)!.produits.push({
      ...produit,
      variants: declinaisonsLisibles(produit),
      // La question posée au client, quand le plat se décline.
      variantLabel: produit.variantLabel || null,
    });
  }

  const ordonnees = [...categories.entries()].sort((a, b) => {
    if (a[1].ordre !== b[1].ordre) return a[1].ordre - b[1].ordre;
    return a[0].localeCompare(b[0], "fr");
  });

  return Object.fromEntries(
    ordonnees.map(([nom, groupe]) => [nom, trierProduitsSelonCategorie(groupe.produits, groupe.sortMode)])
  );
}

// GET /api/client/stores/:id - Get store details with menu (public)
router.get("/stores/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const store = await db.store.findUnique({
      where: { id: id as string },
      include: {
        org: {
          select: { id: true, name: true, slug: true, email: true, status: true, approvedAt: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
          include: {
            category: true,
            media: true,
            variants: true
          },
          // L'ordre voulu par le commerçant d'abord ; le nom ne sert qu'à
          // départager deux produits laissés au même rang.
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
        },
        // Seuls les avis publiés : un avis retiré par la plateforme ne se
        // montre plus.
        reviews: {
          where: { status: "APPROVED" },
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            customer: {
              select: { id: true, name: true }
            }
          }
        }
      }
    }) as any;

    if (!store) {
      throw new ApiError(404, "Restaurant non trouvé", "NOT_FOUND");
    }

    if (store.org?.status !== "ACTIVE" || store.deletedAt) {
      throw new ApiError(423, "Boutique temporairement fermée", "STORE_TEMPORARILY_CLOSED");
    }

    /**
     * Les vraies notes, calculées sur tous les avis publiés.
     *
     * La vitrine affichait en dur quatre étoiles et « 24 avis » sous chaque
     * plat, même créé à l'instant : une note inventée, trompeuse pour le
     * client et contraire aux règles sur les avis en ligne. Un plat sans avis
     * n'affiche plus rien. La moyenne du commerce se calculait, elle, sur les
     * dix derniers avis, plats et avis retirés compris.
     */
    const [notesParPlat, noteDuCommerce] = await Promise.all([
      db.review.groupBy({
        by: ["productId"],
        where: { storeId: store.id, status: "APPROVED", productId: { not: null } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      db.review.aggregate({
        where: { storeId: store.id, status: "APPROVED", productId: null },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const noteDe = new Map(
      notesParPlat.map((n) => [
        n.productId,
        { moyenne: Math.round((n._avg.rating ?? 0) * 10) / 10, nombre: n._count._all },
      ])
    );

    const categorizedProducts = regrouperParCategorie(
      store.products.map((produit: any) => ({ ...produit, note: noteDe.get(produit.id) ?? null }))
    );

    res.json({
      success: true,
      data: {
        ...store,
        menu: categorizedProducts,
        // La fiche reste lisible — le commerçant y prévisualise sa boutique —
        // mais un commerce pas encore validé n'est jamais ouvert.
        isOpenNow: !!store.org?.approvedAt && StoreHoursService.isOpenNow(store),
        enAttenteDeValidation: !store.org?.approvedAt,
        ...genreDuCommerce(store),
        averageRating:
          noteDuCommerce._count._all > 0 ? (noteDuCommerce._avg.rating ?? 0).toFixed(1) : 0,
        reviewCount: noteDuCommerce._count._all
      }
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

/**
 * GET /api/client/stores/:id/payment-methods
 *
 * Les moyens de paiement que le commerçant propose. La route de l'espace
 * commerçant exige un compte : un client, lui, n'en a pas forcément — il ne
 * voyait donc aucun moyen de paiement au moment de payer.
 *
 * On ne rend que l'identifiant, le type et le nom : la configuration d'un moyen
 * de paiement contient les clés d'API du commerçant.
 */
/**
 * GET /api/client/service-fee - Les frais de service de la plateforme
 *
 * Annoncés au tunnel avant de valider : le serveur les ajoute de toute façon,
 * et un total qui change entre l'écran et le ticket ne se pardonne pas.
 */
router.get("/service-fee", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await db.systemConfig.findFirst({ select: { serviceFee: true } });
    res.json({ success: true, data: { frais: fraisDeServiceEnVigueur(config) } });
  } catch (err) {
    next(err);
  }
});

router.get("/stores/:id/payment-methods", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const moyens = await db.paymentMethod.findMany({
      where: { storeId: req.params.id as string, isActive: true },
      select: { id: true, type: true, name: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    res.json({ success: true, data: moyens });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id/menu - Get menu only
router.get("/stores/:id/menu", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const products = await db.product.findMany({
      where: {
        storeId: id as string,
        status: "ACTIVE",
        deletedAt: null,
        store: { deletedAt: null, org: { status: "ACTIVE" } }
      },
      include: {
        category: true,
        media: true,
        variants: true
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    });

    const categorized = regrouperParCategorie(products);

    res.json({
      success: true,
      data: categorized
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me/favorites - Get customer favorites (protected)
/**
 * Résout la fiche client du compte connecté.
 *
 * `User` et `Customer` sont deux tables distinctes sans clé étrangère entre
 * elles ; l'e-mail, unique des deux côtés, fait le lien — c'est aussi la clé
 * utilisée à la création d'une commande.
 */
async function clientConnecte(req: Request) {
  const userId = req.userId || (req as any).user?.userId;

  const utilisateur = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } })
    : null;

  if (!utilisateur) {
    throw new ApiError(401, "Session invalide", "UNAUTHORIZED");
  }

  const client = await db.customer.findUnique({ where: { email: utilisateur.email } });

  /**
   * Tout compte peut commander : seule l'inscription « client » créait la
   * fiche, et un livreur ou un commerçant qui ouvrait l'espace client tombait
   * sur « aucune fiche ». Elle est créée à la première visite.
   */
  if (!client) {
    return db.customer.create({
      data: {
        userId: utilisateur.id,
        name: utilisateur.name || utilisateur.email.split("@")[0],
        email: utilisateur.email,
      },
    });
  }

  if (client.deletedAt) {
    throw new ApiError(404, "Aucune fiche client pour ce compte", "CUSTOMER_NOT_FOUND");
  }

  // Fiche née d'une commande passée sans compte : on la rattache au compte,
  // pour que /auth/me/roles la voie aussi.
  if (!client.userId) {
    const dejaLiee = await db.customer.findUnique({ where: { userId: utilisateur.id }, select: { id: true } });
    if (!dejaLiee) {
      return db.customer.update({ where: { id: client.id }, data: { userId: utilisateur.id } });
    }
  }

  return client;
}

const profilSchema = z.object({
  name: z.string().min(2, "Nom minimum 2 caractères").optional(),
  phone: z.string().min(9, "Téléphone invalide").optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
});

// GET /api/client/me - Profil du client connecté
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    const [commandes, depenses] = await Promise.all([
      db.order.count({ where: { customerId: client.id, deletedAt: null } }),
      db.order.aggregate({
        where: { customerId: client.id, deletedAt: null },
        _sum: { totalAmount: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        city: client.city,
        postalCode: client.postalCode,
        status: client.status,
        memberSince: client.createdAt,
        totalOrders: commandes,
        totalSpent: Number(depenses._sum.totalAmount) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/client/me - Mise à jour de ses propres coordonnées
router.put("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const body = profilSchema.parse(req.body);

    // L'adresse e-mail sert de clé de rapprochement avec le compte : elle
    // n'est volontairement pas modifiable ici.
    const misAJour = await db.customer.update({
      where: { id: client.id },
      data: body,
    });

    res.json({
      message: "Profil mis à jour",
      data: {
        name: misAJour.name,
        email: misAJour.email,
        phone: misAJour.phone,
        address: misAJour.address,
        city: misAJour.city,
        postalCode: misAJour.postalCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me/orders - Historique des commandes du client connecté
router.get("/me/orders", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    const commandes = await db.order.findMany({
      where: { customerId: client.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        store: { select: { id: true, name: true, slug: true, city: true } },
        items: { include: { product: { select: { name: true } } } },
        delivery: { select: { status: true, deliveryTime: true } },
      },
    });

    const avisRestaurants = await avisRestaurantParCommerce(
      client.id,
      [...new Set(commandes.map((c) => c.storeId))]
    );

    res.json({
      success: true,
      data: commandes.map((c) => ({
        id: c.id,
        status: c.status,
        paymentStatus: c.paymentStatus,
        deliveryType: c.deliveryType,
        totalAmount: Number(c.totalAmount),
        createdAt: c.createdAt,
        estimatedReadyAt: c.estimatedReadyAt,
        store: c.store,
        deliveryStatus: c.delivery?.status || null,
        // Le client est invité à donner son avis : jamais donné, ou vieux de
        // plus de quinze jours et antérieur à cette commande.
        avisARedemander: avisARedemander(c, avisRestaurants.get(c.storeId)),
        items: c.items.map((i) => ({
          name: i.product?.name || "Produit supprimé",
          quantity: i.quantity,
          price: Number(i.price),
          total: Number(i.total),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/deliveries/:orderId - Suivi de livraison d'une commande
router.get("/deliveries/:orderId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const orderId = req.params.orderId as string;

    const commande = await db.order.findFirst({
      where: { id: orderId, customerId: client.id, deletedAt: null },
      select: { id: true },
    });

    if (!commande) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }

    const course = await db.orderDelivery.findUnique({
      where: { orderId },
      include: {
        driver: {
          select: { name: true, phone: true, vehicleType: true, rating: true, totalRatings: true, gpsLostAt: true },
        },
        order: { select: { deliveryAddress: true, store: { select: { name: true } } } },
        // La note déjà donnée : sans elle l'écran reproposerait les étoiles à
        // chaque visite, pour un enregistrement que le serveur refuse.
        rating: { select: { note: true, commentaire: true, createdAt: true } },
      },
    });

    if (!course) {
      res.json({ success: true, data: null });
      return;
    }

    // Trois points distincts, longtemps confondus : d'où part la commande, où
    // elle va, et où se trouve le livreur en ce moment. Renvoyer deliveryLat
    // comme position du livreur ne montrait plus rien depuis que celle-ci a
    // ses propres colonnes.
    const retrait = { latitude: course.pickupLat, longitude: course.pickupLng };
    const destination = { latitude: course.deliveryLat, longitude: course.deliveryLng };
    const livreur = { latitude: course.driverLat, longitude: course.driverLng };

    // La distance restante est ce qui intéresse le client ; la distance totale
    // sert à situer l'avancement.
    const restante =
      estUnPoint(livreur) && estUnPoint(destination) ? distanceKm(livreur, destination) : null;
    const totale =
      estUnPoint(retrait) && estUnPoint(destination) ? distanceKm(retrait, destination) : null;

    res.json({
      success: true,
      data: {
        id: course.id,
        status: course.status,
        estimatedTime: course.estimatedTime,
        deliveryTime: course.deliveryTime,
        boutique: course.order?.store?.name ?? null,
        adresseLivraison: course.order?.deliveryAddress ?? null,
        retrait: estUnPoint(retrait) ? retrait : null,
        destination: estUnPoint(destination) ? destination : null,
        position: estUnPoint(livreur)
          ? { ...livreur, misAJourLe: course.driverLocationAt }
          : null,
        // Le livreur n'envoie plus sa position : la pastille est figée.
        gpsPerdu: Boolean(course.driver?.gpsLostAt),
        distanceRestanteKm: restante,
        distanceTotaleKm: totale,
        driver: course.driver
          ? {
              ...course.driver,
              // Un livreur jamais noté n'a pas de note : la colonne vaut 5 par
              // défaut, ce qui lui prêterait un sans-faute qu'il n'a pas gagné.
              rating: course.driver.totalRatings > 0 ? Number(course.driver.rating) : null,
              avis: course.driver.totalRatings,
            }
          : null,
        maNote: course.rating
          ? {
              note: course.rating.note,
              commentaire: course.rating.commentaire,
              donneeLe: course.rating.createdAt,
            }
          : null,
        // Le code que le client donne au livreur à la porte. Il n'a de sens que
        // tant que la course n'est pas remise, et c'est le seul endroit où il
        // se lit : le livreur ne le voit jamais.
        codeRemise: course.status === "DELIVERED" ? null : course.deliveryCode,
        preuve: course.proofType,
        prouveeLe: course.proofAt,
        // La photo du dépôt, quand le client était absent : c'est à lui
        // qu'elle sert, pour retrouver son repas.
        photoDepot: course.proofType === "PHOTO" ? course.proofPhoto : null,
        noteDepot: course.proofType === "PHOTO" ? course.proofNote : null,
        // Le livreur est à moins de 300 m : il peut descendre.
        livreurProche: Boolean(course.nearCustomerNotifiedAt),
      },
    });
  } catch (err) {
    next(err);
  }
});

const noteSchema = z.object({
  note: z
    .number({ error: "La note est un nombre" })
    .int("La note est un entier")
    .min(NOTE_MIN, `La note va de ${NOTE_MIN} à ${NOTE_MAX}`)
    .max(NOTE_MAX, `La note va de ${NOTE_MIN} à ${NOTE_MAX}`),
  commentaire: z.string().max(COMMENTAIRE_MAX).optional(),
});

// POST /api/client/deliveries/:orderId/rating - Noter le livreur d'une course
router.post(
  "/deliveries/:orderId/rating",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await clientConnecte(req);
      const corps = noteSchema.parse(req.body);

      const resultat = await noterLivreur({
        orderId: req.params.orderId as string,
        customerId: client.id,
        note: corps.note,
        commentaire: corps.commentaire,
      });

      res.status(201).json({
        success: true,
        message: "Merci, votre note est enregistrée",
        data: {
          note: resultat.note.note,
          commentaire: resultat.note.commentaire,
          donneeLe: resultat.note.createdAt,
          livreur: { moyenne: resultat.moyenne, avis: resultat.avis },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/me/favorites", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    const customer = await db.customer.findUnique({
      where: { id: client.id },
      include: {
        favorites: {
          include: {
            store: {
              include: {
                products: {
                  where: { status: "ACTIVE", deletedAt: null },
                  take: 3
                }
              }
            }
          }
        }
      }
    });

    const favoris = customer?.favorites || [];
    const notes = await avecLaVraieNote(favoris.map((f) => f.store));
    res.json({
      success: true,
      data: favoris.map((f, i) => ({ ...f, store: notes[i] }))
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/client/me/favorites - Add to favorites (protected)
router.post("/me/favorites", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const userId = client.id;
    const { storeId } = req.body;

    if (!storeId) {
      throw new ApiError(400, "storeId requis", "INVALID_REQUEST");
    }

    // Check if already favorited
    const existing = await db.favoriteStore.findFirst({
      where: { customerId: userId, storeId }
    });

    if (existing) {
      throw new ApiError(400, "Déjà en favoris", "DUPLICATE");
    }

    const favorite = await db.favoriteStore.create({
      data: {
        customerId: userId,
        storeId
      },
      include: {
        store: {
          include: {
            products: { where: { status: "ACTIVE" }, take: 3 }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: "Ajouté aux favoris",
      data: favorite
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/client/me/favorites/:storeId - Remove from favorites (protected)
router.delete("/me/favorites/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const { storeId } = req.params;

    await db.favoriteStore.deleteMany({
      where: { customerId: client.id, storeId: storeId as string }
    });

    res.json({
      success: true,
      message: "Supprimé des favoris"
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me/paniers - Les paniers du compte, quel que soit l'appareil
router.get("/me/paniers", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    res.json({ success: true, data: await CustomerCartService.lister(client.id) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/client/me/paniers/:storeId - Remplace le panier d'un commerce (vide : vidé)
router.put("/me/paniers/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const recu = panierSchema.parse(req.body);
    const panier = await CustomerCartService.enregistrer(client, req.params.storeId as string, recu);
    res.json({ success: true, data: panier });
  } catch (err) {
    next(err);
  }
});

export default router;
