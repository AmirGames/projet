import type { Request } from "express";
import { Prisma, type Courier } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { ibanNormalise, ibanValide } from "../../utils/sepa";
import { SsoService } from "../auth/sso.service";
import { AuthService } from "../auth/auth.service";
import { enregistrerAcceptation } from "../legal/acceptation-conditions.service";
import { DriverPayoutService } from "../payouts/driver-payout.service";
import { DispatchService, STATUTS_EN_COURSE } from "./dispatch.service";
import { piecesAttendues } from "./driver-approval.service";
import { DriverAvailabilityService } from "./driver-availability.service";
import { DriverSupportService } from "./driver-support.service";
import { confirmationExigee, confirmationAEnvoyer, envoyerConfirmation } from "../auth/auth-confirmation.service";
import { codeErreur } from "../../utils/code-erreur";

export type InscriptionLivreur = {
  name: string;
  email: string;
  password: string;
  phone: string;
  vehicleType: "car" | "scooter" | "bike";
  vehiclePlate?: string;
};

export type CompteBancaireLivreur = {
  iban: string;
  bic?: string | null;
  accountHolder: string;
};

const dateLongue = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Brussels" });
const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/** « Votre compte client ZupEat reste actif » (et commerçant, s'il en a un). */
function phraseAutresEspaces(restent: { commercant: boolean }) {
  return restent.commercant
    ? "Votre compte client ZupEat et votre espace commerçant restent actifs, avec la même adresse e-mail et le même mot de passe."
    : "Votre compte client ZupEat reste actif : vous pouvez toujours commander avec la même adresse e-mail et le même mot de passe.";
}

/**
 * Compte du livreur : inscription, profil, revenus, disponibilité, notifications
 * push, compte bancaire et suppression du compte.
 */
export const DriverAccountService = {
  /** Inscription d'un livreur : compte ZupOne, preuve d'acceptation, profil livreur, jetons. */
  async inscrire(req: Request, body: InscriptionLivreur) {
    const [compteExistant, livreurExistant] = await Promise.all([
      db.user.findUnique({ where: { email: body.email } }),
      db.courier.findUnique({ where: { email: body.email } }),
    ]);

    if (compteExistant || livreurExistant) {
      if (confirmationExigee()) {
        await AuthService.hashPassword(body.password);
        if (compteExistant && !compteExistant.emailVerified && compteExistant.status === "ACTIVE") {
          await envoyerConfirmation(compteExistant);
        }
        return { aConfirmer: true as const };
      }
      throw new ApiError(409, "Cette adresse e-mail est déjà utilisée", "EMAIL_EXISTS");
    }

    const passwordHash = await AuthService.hashPassword(body.password);

    let creation;
    try {
      creation = await db.$transaction(async (tx) => {
        const utilisateur = await tx.user.create({
          data: { email: body.email, name: body.name, passwordHash },
        });
        await enregistrerAcceptation(req, {
          email: utilisateur.email,
          userId: utilisateur.id,
          documents: ["cgu", "conditions-livreurs", "confidentialite"],
        }, tx);
        const livreur = await tx.courier.create({
          data: {
            userId: utilisateur.id,
            name: body.name,
            email: body.email,
            phone: body.phone,
            vehicleType: body.vehicleType,
            vehiclePlate: body.vehiclePlate,
            licensePlate: body.vehiclePlate,
          },
        });
        if (confirmationAEnvoyer()) await envoyerConfirmation(utilisateur, tx);
        return { utilisateur, livreur };
      });
    } catch (err) {
      if (codeErreur(err) !== "P2002") throw err;
      if (confirmationExigee()) return { aConfirmer: true as const };
      throw new ApiError(409, "Cette adresse e-mail est déjà utilisée", "EMAIL_EXISTS");
    }
    const { utilisateur, livreur } = creation;
    if (confirmationExigee()) return { aConfirmer: true as const };

    // Un livreur n'appartient à aucune organisation : le jeton ne porte donc
    // ni orgId ni boutique.
    const { accessToken, refreshToken } = await SsoService.connecter(utilisateur.id);

    return { aConfirmer: false as const, accessToken, refreshToken, driver: { id: livreur.id, name: livreur.name, email: livreur.email } };
  },

  /** Revenus du livreur : totaux par période, pourboires, dernières courses. */
  async revenus(livreur: Courier) {
    const [courses, pourboires] = await Promise.all([
      db.orderDelivery.findMany({
        where: { driverId: livreur.id, status: "DELIVERED" },
        include: { order: { select: { feesAmount: true, tipAmount: true } } },
        orderBy: { deliveryTime: "desc" },
      }),
      // Les pourboires laissés après la livraison : un revenu à part entière.
      db.courierTip.findMany({
        where: { driverId: livreur.id, status: "PAID" },
        select: { orderId: true, amount: true, paidAt: true },
      }),
    ]);

    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const debutSemaine = new Date(debutJour);
    debutSemaine.setDate(debutJour.getDate() - ((debutJour.getDay() + 6) % 7));
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

    // On paie ce qui a été annoncé à l'attribution : base + distance. Les
    // frais facturés au client ne servent de repli que pour les courses
    // antérieures au barème, qui n'ont pas de montant figé.
    const gain = (c: (typeof courses)[number]) =>
      Number(c.driverPayout ?? c.order?.feesAmount ?? 0);
    const pourboiresDepuis = (date: Date) =>
      pourboires
        .filter((p) => p.paidAt && p.paidAt >= date)
        .reduce((somme, p) => somme + Number(p.amount), 0);
    const depuis = (date: Date) =>
      courses
        .filter((c) => (c.deliveryTime || c.updatedAt) >= date)
        .reduce((somme, c) => somme + gain(c), 0) + pourboiresDepuis(date);
    const apresLivraison = new Map(pourboires.map((p) => [p.orderId, Number(p.amount)]));

    // Les pourboires à part : celui laissé en commandant (déjà compris dans
    // le gain de la course) compte au jour de la livraison, celui laissé
    // après au jour où il est encaissé.
    const pourboireCommande = (c: (typeof courses)[number]) => Number(c.order?.tipAmount ?? 0);
    const tousPourboiresDepuis = (date: Date) =>
      courses
        .filter((c) => (c.deliveryTime || c.updatedAt) >= date)
        .reduce((somme, c) => somme + pourboireCommande(c), 0) + pourboiresDepuis(date);
    const arrondi = (n: number) => Math.round(n * 100) / 100;

    return {
      total: courses.reduce((somme, c) => somme + gain(c), 0) + pourboiresDepuis(new Date(0)),
      today: depuis(debutJour),
      week: depuis(debutSemaine),
      month: depuis(debutMois),
      deliveryCount: courses.length,
      // Déjà compris dans les montants ci-dessus : le détail des pourboires.
      pourboires: {
        today: arrondi(tousPourboiresDepuis(debutJour)),
        week: arrondi(tousPourboiresDepuis(debutSemaine)),
        month: arrondi(tousPourboiresDepuis(debutMois)),
        total: arrondi(tousPourboiresDepuis(new Date(0))),
      },
      // Nulle tant que personne ne l'a noté : « 5,00 / 5 » s'affichait sur un
      // écran de revenus dès la première course.
      rating: livreur.totalRatings > 0 ? Number(livreur.rating) : null,
      avis: livreur.totalRatings,
      deliveries: courses.slice(0, 30).map((c) => ({
        id: c.id,
        orderId: c.orderId,
        deliveredAt: c.deliveryTime || c.updatedAt,
        earning: gain(c),
        // Laissé en commandant, déjà compris dans le gain de la course.
        pourboire: pourboireCommande(c),
        // Laissé après la livraison, en plus du gain de la course.
        pourboireApres: apresLivraison.get(c.orderId) ?? 0,
      })),
    };
  },

  /** Le profil du livreur du compte, tel que l'application le lit. */
  async profil(userId: string) {
    const driver = await db.courier.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    if (!driver) {
      throw new ApiError(404, "Driver not found", "DRIVER_NOT_FOUND");
    }

    return {
      id: driver.id,
      name: driver.user?.name,
      email: driver.user?.email,
      // Un livreur jamais noté n'a pas de note : la colonne vaut 5 par
      // défaut, et son tableau de bord lui annonçait un sans-faute dès
      // l'inscription. `avis` est ce qui distingue les deux.
      rating: driver.totalRatings > 0 ? Number(driver.rating) : null,
      avis: driver.totalRatings,
      totalEarnings: driver.totalEarnings,
      // Le compte des versements : jamais l'IBAN entier.
      compte: driver.iban
        ? { ibanFin: ibanNormalise(driver.iban).slice(-4), titulaire: driver.accountHolder, valide: ibanValide(driver.iban) }
        : null,
      completedDeliveries: driver.totalDeliveries,
      // isOnline est ce que le livreur a choisi, isAvailable ce que
      // l'attribution en a fait. L'application a besoin des deux.
      isOnline: driver.isOnline,
      isAvailable: driver.isAvailable,
      // Combien de courses à la fois la plateforme autorise (tournée).
      maxCourses: (await DispatchService.reglages()).tournee.maxCourses,
      latitude: driver.latitude,
      longitude: driver.longitude,
      lastLocationUpdate: driver.lastLocationUpdate,
      vehicleType: driver.vehicleType,
      licensePlate: driver.licensePlate,
      // L'état du dossier : sans lui, un livreur en attente de validation
      // voyait un écran normal et ne comprenait pas pourquoi aucune course
      // n'arrivait.
      status: driver.status,
      statusReason: driver.statusReason,
      pausedUntil: driver.pausedUntil,
      pauseReason: driver.pauseReason,
      gpsLostAt: driver.gpsLostAt,
      approvedAt: driver.approvedAt,
      piecesAttendues: piecesAttendues(driver.vehicleType),
    };
  },

  /**
   * Se déclarer en ligne ou non.
   *
   * Deux états distincts, souvent confondus :
   *   isOnline    — le livreur a décidé de prendre des courses ;
   *   isAvailable — il n'en a pas déjà une sur les bras.
   * Le premier lui appartient, le second est piloté par l'attribution. Le
   * bouton de l'application agit donc sur isOnline.
   */
  async definirEnLigne(livreur: Courier, voulu: boolean) {
    /**
     * Seul un livreur validé se met en ligne.
     *
     * L'attribution ne s'adresse déjà qu'aux ACTIVE, mais un dossier en attente
     * qui se voit « en ligne » sans jamais rien recevoir ne comprend pas ce qui
     * se passe : mieux vaut le lui dire ici.
     */
    if (voulu && livreur.status !== "ACTIVE") {
      const explications: Record<string, string> = {
        PENDING: "Votre dossier est en cours de validation : vous ne pouvez pas encore prendre de course.",
        REJECTED: "Votre dossier a été refusé.",
        SUSPENDED: "Votre compte est suspendu.",
        INACTIVE: "Votre compte est désactivé.",
      };

      throw new ApiError(
        403,
        [explications[livreur.status] || "Votre compte n'est pas actif.", livreur.statusReason]
          .filter(Boolean)
          .join(" "),
        "DRIVER_NOT_APPROVED"
      );
    }

    const enPause = DriverAvailabilityService.estEnPause(livreur);

    return db.courier.update({
      where: { id: livreur.id },
      data: {
        isOnline: voulu,
        // Se remettre en ligne ne rend pas disponible si une course est en
        // cours (elle doit d'abord être terminée) ni pendant une pause.
        ...(voulu
          ? { isAvailable: livreur.currentOrderId === null && !enPause }
          : // Se déconnecter met fin à la pause : elle n'a plus d'objet.
            { isAvailable: false, pausedUntil: null, pauseReason: null }),
      },
    });
  },

  /** Enregistre l'abonnement push du navigateur. */
  async abonnerPush(livreurId: string, abonnement: Record<string, unknown>) {
    await db.courier.update({ where: { id: livreurId }, data: { pushSubscription: abonnement as Prisma.InputJsonValue } });
  },

  /** Désactive les notifications push. */
  async desabonnerPush(livreurId: string) {
    await db.courier.update({ where: { id: livreurId }, data: { pushSubscription: Prisma.DbNull } });
  },

  /** Le compte où recevoir ses versements du lundi. */
  async enregistrerCompte(livreurId: string, corps: CompteBancaireLivreur) {
    if (!ibanValide(corps.iban)) {
      throw new ApiError(400, "Cet IBAN n'est pas valide : vérifiez-le.", "INVALID_IBAN");
    }

    await db.courier.update({
      where: { id: livreurId },
      data: {
        iban: ibanNormalise(corps.iban),
        bic: corps.bic ? corps.bic.replace(/\s+/g, "").toUpperCase() : null,
        accountHolder: corps.accountHolder.trim(),
      },
    });
  },

  /**
   * Ce que la suppression implique pour ce livreur : courses en cours, dernier
   * versement, et ce qui reste de son compte. Un compte ZupOne est unique : la
   * même adresse ouvre l'espace client ZupEat (et un espace commerçant s'il en
   * a un). Seul le compte livreur est supprimé.
   */
  async apercuSuppression(livreur: { id: string; userId: string | null }) {
    const [coursesEnCours, solde, commerces] = await Promise.all([
      db.orderDelivery.count({ where: { driverId: livreur.id, status: { in: STATUTS_EN_COURSE } } }),
      DriverPayoutService.soldeFinal(livreur.id),
      livreur.userId ? db.membership.count({ where: { userId: livreur.userId } }) : 0,
    ]);
    return { coursesEnCours, ...solde, restent: { client: true, commercant: commerces > 0 } };
  },

  /**
   * Le livreur demande la suppression de son compte.
   *
   * Depuis que l'on peut créer un compte dans l'application, les stores
   * exigent de pouvoir l'y supprimer. Le compte est désactivé sur-le-champ
   * (plus de courses, plus de notifications livreur) et la plateforme reçoit
   * la demande par le support : elle efface les données de livreur, sauf ce
   * que la loi oblige à garder (courses payées, pièces comptables), comme le
   * dit la politique de confidentialité.
   *
   * Seul le compte livreur disparaît : le compte ZupOne (même e-mail, même
   * mot de passe) reste, et avec lui l'espace client ZupEat.
   *
   * Ce qui est dû n'est pas perdu : les courses de la semaine sont arrêtées le
   * lundi suivant (00 h 00, Bruxelles) avec celles de tout le monde, et
   * versées sur l'IBAN du livreur. Sans IBAN, la demande attend qu'il le
   * donne ; les données ne s'effacent qu'après ce dernier versement.
   */
  async demanderSuppression(livreur: Courier, motif?: string) {
    const apercu = await DriverAccountService.apercuSuppression(livreur);
    if (apercu.coursesEnCours > 0) {
      throw new ApiError(
        409,
        "Terminez ou annulez d'abord vos courses en cours, puis refaites la demande.",
        "DELIVERIES_IN_PROGRESS"
      );
    }
    // Supprimer son compte ne fait pas perdre ce qui est dû : encore faut-il
    // savoir où le verser. Sans IBAN, le virement serait écarté du lot.
    if (apercu.montantDu > 0 && !apercu.ibanValide) {
      throw new ApiError(
        409,
        `Il vous reste ${euros(apercu.montantDu)} à recevoir : ajoutez d'abord votre IBAN (Mon compte › Mes versements), puis refaites la demande.`,
        "IBAN_REQUIRED"
      );
    }

    const le = livreur.suppressionDemandeeLe ?? new Date();
    await db.courier.update({
      where: { id: livreur.id },
      data: {
        status: "INACTIVE",
        statusReason: `Suppression du compte livreur demandée le ${le.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}.`,
        suppressionDemandeeLe: le,
        isOnline: false,
        isAvailable: false,
        pausedUntil: null,
        pauseReason: null,
      },
    });
    // Plus aucune notification de l'application Livreur. Celles de
    // l'application client ZupEat continuent : ce compte-là reste actif.
    if (livreur.userId) await db.pushDevice.deleteMany({ where: { userId: livreur.userId, app: "delivery" } });

    const versement = apercu.versementLe
      ? `Dernier versement : ${euros(apercu.montantDu)}, arrêté le ${dateLongue(apercu.versementLe)} (IBAN •••${apercu.ibanFin}). Ne pas effacer les données avant ce versement.`
      : "Rien à verser.";
    await DriverSupportService.envoyer(
      livreur.id,
      "DRIVER",
      `🗑️ Je demande la suppression de mon compte livreur et de mes données de livreur (pièces, véhicule, IBAN, position). Mon compte client ZupEat reste actif : ne pas supprimer le compte utilisateur.${
        motif?.trim() ? `\nMotif : ${motif.trim()}` : ""
      }\n${versement}`,
      { deliveryId: null }
    );

    logger.warn("Suppression de compte demandée", { driverId: livreur.id, montantDu: apercu.montantDu });

    return {
      apercu,
      message: `Votre compte livreur est supprimé : vous ne recevrez plus de courses. ${
        apercu.versementLe
          ? `Vos ${euros(apercu.montantDu)} de courses vous seront versés avec les paiements du ${dateLongue(apercu.versementLe)}, sur votre compte •••${apercu.ibanFin}. Vos données de livreur seront ensuite supprimées sous 30 jours, sauf celles que la loi nous oblige à conserver.`
          : "Vos données de livreur seront supprimées sous 30 jours, sauf celles que la loi nous oblige à conserver."
      } ${phraseAutresEspaces(apercu.restent)}`,
    };
  },
};
