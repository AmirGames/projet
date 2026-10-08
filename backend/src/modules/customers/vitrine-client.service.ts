import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm } from "../../utils/geo";
import { boutiqueVisible, livreVraiment } from "../../utils/visibilite-boutique";
import { fraisDeServiceEnVigueur } from "../delivery/delivery-mode.service";
import { StoreHoursService } from "../delivery/store-hours.service";
import { DeliveryZoneService } from "../delivery/delivery-zone.service";
import { genreDuCommerce } from "../stores/store-type.service";
import { SupplementService } from "../catalog/supplement.service";
import { TaxService } from "../catalog/tax.service";
import { avecLaVraieNote } from "../reviews/review.service";
import { regrouperParCategorie } from "./vitrine-menu";

/**
 * La vitrine publique : ce que le client voit d'un commerce sans compte —
 * liste, proximité, recherche, fiche avec menu, moyens de paiement, frais.
 * Aucune de ces lectures n'est liée à un client : elles ne montrent que les
 * commerces actifs et validés (sauf la fiche, que le commerçant prévisualise).
 */
export const VitrineClientService = {
  /**
   * Les commerces à lister. `pays` : ceux de ce pays seulement — la région du
   * site (/be-fr/…) décide de ce qu'on liste. Une boutique dont le pays n'est
   * pas encore connu reste listée partout : mieux vaut une boutique de trop
   * qu'un commerce devenu introuvable.
   */
  async boutiques(pays: string | undefined) {
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
        org: { status: "ACTIVE", approvedAt: { not: null }, isDemo: false },
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

    return (await avecLaVraieNote(stores)).map((store) => ({
      ...store,
      // Ce que disent à la fois le planning hebdomadaire et le bouton
      // rapide, croisés — pas juste le bouton, sinon un jour fermé dans les
      // horaires n'a jamais d'effet ici.
      isOpenNow: StoreHoursService.isOpenNow(store),
      // La famille (Pizzas, Sushis…) pour filtrer, et le libellé précis.
      ...genreDuCommerce(store),
    }));
  },

  /** Les commerces autour d'un point, avec leur verdict de livraison. */
  async proches(lat: number, lng: number, maxDist: number) {
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

    return avecLaVraieNote(avecLivraison);
  },

  /** Recherche par nom, description ou ville. */
  async rechercher(searchQuery: string, city: string | undefined, limite: number) {
    const stores = await db.store.findMany({
      where: {
        deletedAt: null,
        org: { status: "ACTIVE", approvedAt: { not: null } },
        OR: [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { description: { contains: searchQuery, mode: "insensitive" } },
          ...(city ? [{ city: { contains: city, mode: "insensitive" as const } }] : []),
        ]
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
      take: limite
    });

    return (await avecLaVraieNote(stores)).map((store) => ({
      ...store,
      isOpenNow: StoreHoursService.isOpenNow(store),
      // La famille (Pizzas, Sushis…) pour filtrer, et le libellé précis.
      ...genreDuCommerce(store),
    }));
  },

  /** La fiche d'une boutique avec son menu, ses notes et ses avis publiés. */
  async fiche(id: string) {
    const store = await db.store.findUnique({
      where: { id },
      include: {
        org: {
          select: { id: true, name: true, slug: true, email: true, status: true, approvedAt: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
          include: {
            category: true,
            // Dans l'ordre choisi par le commerçant : la vitrine affiche la première.
            media: { orderBy: { displayOrder: "asc" } },
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
    });

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

    // Des prix saisis hors taxe : le client les voit TTC.
    store.products = await TaxService.prixAuClient(store.id, store.products);

    // Les suppléments payants de chaque plat, TTC comme le reste.
    const supplements = await SupplementService.auClient(store.id, store.products);
    store.products = store.products.map((produit) => ({
      ...produit,
      supplements: supplements.get(produit.id) || [],
    }));

    const categorizedProducts = regrouperParCategorie(
      store.products.map((produit) => ({ ...produit, note: noteDe.get(produit.id) ?? null }))
    );

    return {
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
    };
  },

  /** Le menu seul, par catégorie. */
  async menu(storeId: string) {
    const products = await db.product.findMany({
      where: {
        storeId,
        status: "ACTIVE",
        deletedAt: null,
        store: { deletedAt: null, org: { status: "ACTIVE" } }
      },
      include: {
        category: true,
        media: { orderBy: { displayOrder: "asc" } },
        variants: true
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    });

    return regrouperParCategorie(products);
  },

  /**
   * Les moyens de paiement que le commerçant propose. La route de l'espace
   * commerçant exige un compte : un client, lui, n'en a pas forcément — il ne
   * voyait donc aucun moyen de paiement au moment de payer.
   *
   * On ne rend que l'identifiant, le type et le nom : la configuration d'un moyen
   * de paiement contient les clés d'API du commerçant.
   */
  moyensDePaiement(storeId: string) {
    return db.paymentMethod.findMany({
      where: { storeId, isActive: true },
      select: { id: true, type: true, name: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  },

  /**
   * Les frais de service de la plateforme, annoncés au tunnel avant de
   * valider : le serveur les ajoute de toute façon, et un total qui change
   * entre l'écran et le ticket ne se pardonne pas.
   */
  async fraisDeService() {
    const config = await db.systemConfig.findFirst({ select: { serviceFee: true } });
    return fraisDeServiceEnVigueur(config);
  },
};
