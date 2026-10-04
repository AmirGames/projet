import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { oublierCompte } from "../auth/auth.middleware";

/**
 * Supprimer son compte client ZupEat.
 *
 * Un compte ZupOne est unique : la même adresse ouvre ZupEat, l'espace
 * livreur et un éventuel espace commerçant. Supprimer ZupEat efface le
 * profil client (coordonnées, adresse, favoris, paniers) ; les commandes
 * passées restent, détachées du compte, le temps que la loi l'exige
 * (comptabilité, litiges).
 *
 * - La personne n'est que cliente : sa connexion disparaît aussi, et ses
 *   sessions avec (le compte n'existe plus).
 * - Elle est aussi livreur ou commerçant : la connexion reste pour ces
 *   espaces-là, et on le lui dit. Si elle revient un jour sur ZupEat, une
 *   fiche vierge est recréée.
 */

/** Une commande qui n'est ni remise ni refusée : on ne supprime pas en plein milieu. */
const STATUTS_EN_COURS = ["ACCEPTED", "PREPARING", "READY"] as const;
/** Une commande « en attente » plus ancienne est un paiement abandonné, pas une commande en cours. */
const ATTENTE_ABANDONNEE_MS = 24 * 3600000;

export class CustomerAccountService {
  /** Ce que la suppression implique pour ce compte. */
  static async apercu(userId: string) {
    const utilisateur = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        isSuperOwner: true,
        isSystemAdmin: true,
        _count: { select: { memberships: true, accesEquipe: true } },
        driver: { select: { id: true, suppressionDemandeeLe: true } },
        societeDrive: { select: { id: true } },
      },
    });
    if (!utilisateur) throw new ApiError(401, "Session invalide", "UNAUTHORIZED");

    const client = await db.customer.findFirst({
      // Une fiche invité de même adresse n'est concernée qu'une fois l'adresse
      // confirmée : sinon, supprimer son compte effacerait les données
      // d'autrui (voir fiche-client.service.ts).
      where: {
        OR: [
          { userId },
          ...(utilisateur.emailVerified ? [{ email: utilisateur.email, userId: null }] : []),
        ],
        deletedAt: null,
      },
      select: { id: true },
    });

    const commandesEnCours = client
      ? await db.order.count({
          where: {
            customerId: client.id,
            deletedAt: null,
            OR: [
              { status: { in: [...STATUTS_EN_COURS] } },
              { status: "PENDING", createdAt: { gt: new Date(Date.now() - ATTENTE_ABANDONNEE_MS) } },
            ],
          },
        })
      : 0;

    const livreur = Boolean(utilisateur.driver);
    const commercant = utilisateur._count.memberships > 0;
    // Gérant d'une société ZupDrive : la société et l'historique de ses
    // courses ne partent pas avec lui (relation Restrict).
    const societeDrive = Boolean(utilisateur.societeDrive);
    const equipe = utilisateur.isSuperOwner || utilisateur.isSystemAdmin || utilisateur._count.accesEquipe > 0;

    return {
      commandesEnCours,
      restent: {
        livreur,
        // Un livreur qui a demandé sa suppression garde sa connexion le temps
        // de son dernier versement.
        livreurEnSuppression: Boolean(utilisateur.driver?.suppressionDemandeeLe),
        commercant,
        societeDrive,
      },
      // Personne d'autre ne s'en sert : la connexion part avec ZupEat.
      compteEntierSupprime: !livreur && !commercant && !equipe && !societeDrive,
      _clientId: client?.id ?? null,
      _email: utilisateur.email,
    };
  }

  static async supprimer(userId: string, motif?: string) {
    const apercu = await this.apercu(userId);
    if (apercu.commandesEnCours > 0) {
      throw new ApiError(
        409,
        "Une commande est en cours : attendez qu'elle soit livrée (ou annulée), puis refaites la demande.",
        "ORDERS_IN_PROGRESS"
      );
    }

    // Une course ZupDrive en cours : le chauffeur est peut-être déjà en route.
    const trajetsEnCours = await db.courseDrive.count({
      where: { passagerId: userId, statut: { in: ["RECHERCHE", "ACCEPTEE", "ARRIVEE", "EN_COURS"] } },
    });
    if (trajetsEnCours > 0) {
      throw new ApiError(
        409,
        "Un trajet ZupDrive est en cours : attendez qu'il soit terminé (ou annulé), puis refaites la demande.",
        "RIDE_IN_PROGRESS"
      );
    }

    const maintenant = new Date();
    await db.$transaction(async (tx) => {
      if (apercu._clientId) {
        const id = apercu._clientId;
        await tx.favoriteStore.deleteMany({ where: { customerId: id } });
        await tx.customerCart.deleteMany({ where: { customerId: id } });
        // La fiche reste pour les commandes passées qui y renvoient, mais ne
        // dit plus rien de la personne ; l'adresse e-mail est libérée.
        await tx.customer.update({
          where: { id },
          data: {
            name: "Client supprimé",
            email: `supprime-${id}@zupeat.invalid`,
            phone: null,
            address: null,
            city: null,
            postalCode: null,
            latitude: null,
            longitude: null,
            savedAddresses: [],
            notes: null,
            userId: null,
            status: "INACTIVE",
            deletedAt: maintenant,
          },
        });
      }

      // Plus de notifications de l'application ZupEat.
      await tx.pushDevice.deleteMany({ where: { userId, app: "customer" } });

      if (apercu.compteEntierSupprime) {
        await tx.notification.deleteMany({ where: { recipientEmail: apercu._email } });
        // Les commandes et la preuve d'acceptation des conditions gardent leur
        // trace sans compte (relations SetNull) ; appareils et messages partent
        // avec lui.
        await tx.user.delete({ where: { id: userId } });
      }
    });

    // Les sessions tombent tout de suite, sans attendre le cache.
    if (apercu.compteEntierSupprime) oublierCompte(userId);

    logger.warn("Compte client ZupEat supprimé", {
      userId,
      compteEntier: apercu.compteEntierSupprime,
      motif: motif?.trim() || undefined,
    });

    return apercu;
  }

  /** Ce qu'on dit à la personne, selon ce qui reste de son compte. */
  static message(apercu: Awaited<ReturnType<typeof CustomerAccountService.apercu>>) {
    const base =
      "Votre compte ZupEat est supprimé : votre profil, vos adresses, vos favoris et vos paniers sont effacés. Vos commandes passées sont conservées sans lien avec vous, le temps que la loi l'exige.";
    if (apercu.compteEntierSupprime) return `${base} Votre compte ZupOne n'existe plus.`;
    const autres = [
      apercu.restent.livreur &&
        (apercu.restent.livreurEnSuppression
          ? "Votre compte livreur, en cours de suppression, reste accessible jusqu'au dernier versement de vos courses."
          : "Votre compte livreur reste actif."),
      apercu.restent.commercant && "Votre espace commerçant reste actif.",
      apercu.restent.societeDrive && "Votre société ZupDrive reste active.",
    ].filter(Boolean);
    return `${base} ${autres.join(" ")} Vous vous y connectez avec la même adresse e-mail et le même mot de passe.`;
  }

  /** L'aperçu, sans les champs internes. */
  static public(apercu: Awaited<ReturnType<typeof CustomerAccountService.apercu>>) {
    const { _clientId, _email, ...visible } = apercu;
    void _clientId;
    void _email;
    return visible;
  }
}
