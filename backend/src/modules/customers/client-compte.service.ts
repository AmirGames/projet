import type { Request } from "express";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm, estUnPoint } from "../../utils/geo";
import { finAttente } from "../drivers/delivery-proof.service";
import { INCIDENTS_POUR_LE_CLIENT, reclamationPourLeClient, retardPourLeClient } from "../drivers/retard-livraison";
import { positionLivreurVisible } from "../orders/suivi-commande.service";
import { presenter } from "../files/fichiers-prives.service";
import { userIdRequis } from "../auth/utilisateur-requis";
import { genreDuCommerce } from "../stores/store-type.service";
import { avisARedemander, avisRestaurantParCommerce } from "../reviews/avis-client.service";
import { avecLaVraieNote } from "../reviews/review.service";
import { ficheClientDuCompte } from "./fiche-client.service";
import { adressesDuClient } from "./adresses-client.service";
import type { z } from "zod";
import type { adressesFavoritesSchema } from "./adresses-favorites";

type AdresseFavorite = z.infer<typeof adressesFavoritesSchema>[number];
type FicheClient = Awaited<ReturnType<typeof ficheClientDuCompte>>;

/**
 * La fiche client du compte connecté, créée à la première visite. Une fiche
 * née d'une commande sans compte n'est rattachée qu'une fois l'adresse
 * confirmée (voir fiche-client.service.ts).
 */
export async function clientConnecte(req: Request) {
  const userId = userIdRequis(req);
  return ficheClientDuCompte(userId, { creer: true });
}

/** Les suppléments figés sur une ligne de commande (OrderService.create). */
function supplementsDeLaLigne(selectedOptions: unknown): { id: string; groupe: string; label: string; price: number }[] {
  const liste = (selectedOptions as { supplements?: unknown } | null)?.supplements;
  return Array.isArray(liste) ? liste : [];
}

export type ProfilModifiable = {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
};

/**
 * Espace du client connecté : carnet d'adresses, profil, commandes, suivi de
 * livraison et favoris. Chaque lecture ou écriture est bornée au client du
 * compte connecté (`client.id`), jamais à un identifiant fourni par le navigateur.
 */
export const ClientCompteService = {
  /** Profil et destinations des commandes du compte. */
  async adresses(client: FicheClient) {
    const carnet = await db.customer.findUnique({ where: { id: client.id }, select: { savedAddresses: true } });
    return adressesDuClient({ ...client, savedAddresses: carnet?.savedAddresses });
  },

  /** Remplace le carnet du client connecté. */
  async enregistrerAdresses(clientId: string, addresses: AdresseFavorite[]) {
    await db.customer.update({ where: { id: clientId }, data: { savedAddresses: addresses } });
    return addresses.map((adresse) => ({ ...adresse, label: [adresse.street, adresse.city].join(", ") }));
  },

  /** Le profil et ses totaux. */
  async profil(client: FicheClient) {
    const [commandes, depenses] = await Promise.all([
      db.order.count({ where: { customerId: client.id, deletedAt: null } }),
      db.order.aggregate({
        where: { customerId: client.id, deletedAt: null },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
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
    };
  },

  /** Mise à jour de ses propres coordonnées. */
  async modifierProfil(clientId: string, body: ProfilModifiable) {
    // L'adresse e-mail sert de clé de rapprochement avec le compte : elle
    // n'est volontairement pas modifiable ici.
    const misAJour = await db.customer.update({
      where: { id: clientId },
      data: body,
    });

    return {
      name: misAJour.name,
      email: misAJour.email,
      phone: misAJour.phone,
      address: misAJour.address,
      city: misAJour.city,
      postalCode: misAJour.postalCode,
    };
  },

  /** Historique des commandes du client. */
  async commandes(client: FicheClient) {
    const commandes = await db.order.findMany({
      where: { customerId: client.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        store: { select: { id: true, name: true, slug: true, city: true } },
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { label: true } },
          },
        },
        delivery: { select: { status: true, deliveryTime: true } },
      },
    });

    const avisRestaurants = await avisRestaurantParCommerce(
      client.id,
      [...new Set(commandes.map((c) => c.storeId))]
    );

    return commandes.map((c) => ({
      id: c.id,
      status: c.status,
      paymentStatus: c.paymentStatus,
      deliveryType: c.deliveryType,
      // La liste l'affiche : sans lui, la colonne « Adresse » restait vide.
      deliveryAddress: c.deliveryAddress,
      totalAmount: Number(c.totalAmount),
      createdAt: c.createdAt,
      estimatedReadyAt: c.estimatedReadyAt,
      store: c.store,
      deliveryStatus: c.delivery?.status || null,
      // Le client est invité à donner son avis : jamais donné, ou vieux de
      // plus de quinze jours et antérieur à cette commande.
      avisARedemander: avisARedemander(c, avisRestaurants.get(c.storeId)),
      items: c.items.map((i) => ({
        // Le plat et sa déclinaison : « Commander à nouveau » les retrouve
        // dans le menu du jour, au prix du jour.
        productId: i.productId,
        variantId: i.variantId,
        variantLabel: i.variant?.label || null,
        // Les suppléments tels qu'ils ont été payés (copie figée).
        supplements: supplementsDeLaLigne(i.selectedOptions),
        name: i.product?.name || "Produit supprimé",
        quantity: i.quantity,
        price: Number(i.price),
        total: Number(i.total),
      })),
    }));
  },

  /** Suivi de livraison d'une commande du client (`null` : pas encore de course). */
  async suiviLivraison(client: FicheClient, orderId: string) {
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
        // Les constats de la surveillance des courses : la livraison dérape-t-elle ?
        incidents: INCIDENTS_POUR_LE_CLIENT,
      },
    });

    if (!course) return null;

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
      positionLivreurVisible(course.status) && estUnPoint(livreur) && estUnPoint(destination) ? distanceKm(livreur, destination) : null;
    const totale =
      estUnPoint(retrait) && estUnPoint(destination) ? distanceKm(retrait, destination) : null;

    return {
      id: course.id,
      status: course.status,
      estimatedTime: course.estimatedTime,
      deliveryTime: course.deliveryTime,
      boutique: course.order?.store?.name ?? null,
      adresseLivraison: course.order?.deliveryAddress ?? null,
      retrait: estUnPoint(retrait) ? retrait : null,
      destination: estUnPoint(destination) ? destination : null,
      // Même règle que GET /orders/:id/delivery : en route vers le client
      // seulement.
      position: positionLivreurVisible(course.status) && estUnPoint(livreur)
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
      photoDepot: course.proofType === "PHOTO" ? presenter(course.proofPhoto) : null,
      noteDepot: course.proofType === "PHOTO" ? course.proofNote : null,
      // Le livreur est à moins de 300 m : il peut descendre.
      livreurProche: Boolean(course.nearCustomerNotifiedAt),
      // Le livreur est à la porte et n'arrive pas à le joindre : passé cette
      // heure, la commande est déposée en lieu sûr.
      attenteFinLe: course.status === "PICKED_UP" ? finAttente(course) : null,
      // En retard, ou confiée à un nouveau livreur (voir retard-livraison.ts).
      retard: retardPourLeClient(course),
      // « Je n'ai pas reçu ma commande », après un dépôt en photo.
      reclamation: reclamationPourLeClient(course),
      maintenant: new Date(),
    };
  },

  /** Les boutiques favorites du client. */
  async favoris(client: FicheClient) {
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
    // La famille (« pizza », « sushi »…) donne au favori sans photo ni logo
    // l'illustration de sa catégorie, comme sur l'accueil.
    return favoris.map((f, i) => ({ ...f, store: { ...notes[i], ...genreDuCommerce(f.store) } }));
  },

  /** Ajoute une boutique aux favoris du client. */
  async ajouterFavori(clientId: string, storeId: string) {
    // Check if already favorited
    const existing = await db.favoriteStore.findFirst({
      where: { customerId: clientId, storeId }
    });

    if (existing) {
      throw new ApiError(400, "Déjà en favoris", "DUPLICATE");
    }

    return db.favoriteStore.create({
      data: {
        customerId: clientId,
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
  },

  /** Retire une boutique des favoris du client. */
  async retirerFavori(clientId: string, storeId: string) {
    await db.favoriteStore.deleteMany({
      where: { customerId: clientId, storeId }
    });
  },
};
