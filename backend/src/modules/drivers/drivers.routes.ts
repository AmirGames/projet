import { Router, Request, Response, NextFunction } from "express";
import { SsoService } from "../auth/sso.service";
import { ibanNormalise, ibanValide } from "../../utils/sepa";
import { db } from "../../services/db";
import { champAcceptation, enregistrerAcceptation } from "../legal/acceptation-conditions.service";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { uploadMiddleware } from "../files/file-upload.middleware";
import { limiterInscriptions } from "../../middleware/throttle";
import { logger } from "../../config/logger";
import { emitDeliveryUpdate, emitNotification } from "../realtime/socket";
import { DispatchService, STATUTS_EN_COURSE } from "./dispatch.service";
import { ordonner, versCourseTournee } from "./tournee.service";
import { AuthService } from "../auth/auth.service";
import {
  DriverApprovalService,
  TYPES_DOCUMENT,
  libelleDuDocument,
  piecesAttendues,
} from "./driver-approval.service";
import { DriverPayoutService } from "../payouts/driver-payout.service";
import {
  DeliveryProofService,
  exigerAttenteTerminee,
  exigerPresenceChezClient,
  finAttente,
  lirePositionDepot,
} from "./delivery-proof.service";
import { FileUploadService } from "../files/file-upload.service";
import { notesDuLivreur } from "./driver-rating.service";
import { bilanCourse, DriverActivityService, FiltreHistorique } from "./driver-activity.service";
import { DriverAvailabilityService, GPS_PERDU_APRES_MS } from "./driver-availability.service";
import { SurveillanceCoursesService } from "./surveillance-courses.service";
import { Notifier, enArrierePlan } from "../notifications/notifier.service";
import { DriverSupportService, LONGUEUR_MAX } from "./driver-support.service";
import { z } from "zod";
import { champEmail, champMotDePasse } from "../../utils/validation";
import { distanceKm, estUnPoint } from "../../utils/geo";
import { Prisma } from "@prisma/client";
import { adresseSignee, cheminRelatif } from "../files/fichiers-prives.service";
import { servirFichierPrive } from "../files/files.routes";

const router = Router();

// Résout le livreur rattaché au compte connecté. Sans ce contrôle, n'importe
// quel utilisateur authentifié pourrait manipuler les courses des autres.
async function livreurConnecte(req: Request) {
  const userId = req.user?.userId as string;
  const livreur = await db.courier.findUnique({ where: { userId } });

  if (!livreur) {
    throw new ApiError(404, "Aucun profil livreur associé à ce compte", "DRIVER_NOT_FOUND");
  }

  return livreur;
}

// Vérifie que la course appartient bien au livreur connecté.
async function courseDuLivreur(req: Request, deliveryId: string) {
  const livreur = await livreurConnecte(req);

  const course = await db.orderDelivery.findUnique({ where: { id: deliveryId } });

  if (!course) {
    throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");
  }

  if (course.driverId && course.driverId !== livreur.id) {
    throw new ApiError(403, "Cette course est attribuée à un autre livreur", "FORBIDDEN");
  }

  return { livreur, course };
}

// L'adresse du commerce où l'on retire la commande. Le retrait affichait
// l'adresse du client : le livreur partait au mauvais endroit.
function adresseRetrait(store?: { name?: string | null; address?: string | null; city?: string | null } | null) {
  if (!store) return "";
  return [store.address, store.city].filter(Boolean).join(", ") || store.name || "";
}

/**
 * Tournée : le client d'une course masquée (d'autres commandes attendent au
 * commerce, ou une autre remise passe avant) ne sort pas du serveur. Le
 * livreur ne découvre l'adresse suivante qu'une fois la précédente livrée.
 */
function masquerClient<T extends Record<string, unknown>>(course: T, raison: "RETRAITS" | "ORDRE" | null): T {
  if (!raison) return { ...course, masque: null };
  return {
    ...course,
    masque: raison,
    customerName: null,
    customerPhone: null,
    deliveryAddress: null,
    latitude: null,
    longitude: null,
  };
}

function adresseLivraison(order?: { deliveryAddress?: string | null; deliveryPostal?: string | null; deliveryCity?: string | null } | null) {
  if (!order) return "";
  const ville = [order.deliveryPostal, order.deliveryCity].filter(Boolean).join(" ");
  return [order.deliveryAddress, ville].filter(Boolean).join(", ");
}

const inscriptionSchema = z.object({
  name: z.string().min(2, "Nom minimum 2 caractères"),
  email: champEmail(),
  password: champMotDePasse(),
  phone: z.string().min(9, "Téléphone invalide"),
  vehicleType: z.enum(["car", "scooter", "bike"]),
  vehiclePlate: z.string().optional(),
  ...champAcceptation,
});

// POST /drivers/register - Inscription d'un livreur
router.post("/register", limiterInscriptions, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = inscriptionSchema.parse(req.body);

    const [compteExistant, livreurExistant] = await Promise.all([
      db.user.findUnique({ where: { email: body.email } }),
      db.courier.findUnique({ where: { email: body.email } }),
    ]);

    if (compteExistant || livreurExistant) {
      throw new ApiError(409, "Cette adresse e-mail est déjà utilisée", "EMAIL_EXISTS");
    }

    const passwordHash = await AuthService.hashPassword(body.password);

    const utilisateur = await db.user.create({
      data: { email: body.email, name: body.name, passwordHash },
    });

    await enregistrerAcceptation(req, {
      email: utilisateur.email,
      userId: utilisateur.id,
      documents: ["cgu", "conditions-livreurs", "confidentialite"],
    });

    const livreur = await db.courier.create({
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

    // Un livreur n'appartient à aucune organisation : le jeton ne porte donc
    // ni orgId ni boutique.
    const { accessToken, refreshToken } = await SsoService.connecter(utilisateur.id);

    res.status(201).json({
      message: "Inscription réussie",
      accessToken,
      refreshToken,
      driver: { id: livreur.id, name: livreur.name, email: livreur.email },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Le gain d'une course pour le livreur : figé à l'attribution, sinon celui de
 * la proposition, sinon (courses anciennes) les frais de livraison.
 */
function gainAnnonce(
  course: { driverPayout?: unknown; order?: { feesAmount?: unknown } | null },
  offre?: { payout?: unknown } | null
) {
  return Number(course.driverPayout ?? offre?.payout ?? course.order?.feesAmount ?? 0);
}

// GET /drivers/earnings - Revenus du livreur connecté
router.get("/earnings", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

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

    res.json({
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
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/availability - Se déclarer disponible ou non
router.patch("/availability", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    // Deux états distincts, souvent confondus :
    //   isOnline    — le livreur a décidé de prendre des courses ;
    //   isAvailable — il n'en a pas déjà une sur les bras.
    // Le premier lui appartient, le second est piloté par l'attribution. Le
    // bouton de l'application agit donc sur isOnline.
    const { isOnline, isAvailable } = req.body;
    const voulu = typeof isOnline === "boolean" ? isOnline : isAvailable;

    if (typeof voulu !== "boolean") {
      throw new ApiError(400, "Le champ isOnline doit être un booléen", "INVALID_INPUT");
    }

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

    const misAJour = await db.courier.update({
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

    res.json({
      isAvailable: misAJour.isAvailable,
      isOnline: misAJour.isOnline,
      pausedUntil: misAJour.pausedUntil,
    });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/pause - Pause temporaire { minutes, reason? }
router.post("/pause", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const body = z
      .object({ minutes: z.number(), reason: z.string().max(200).optional() })
      .parse(req.body);

    const misAJour = await DriverAvailabilityService.mettreEnPause(livreur.id, body.minutes, body.reason);

    res.json({
      success: true,
      isAvailable: misAJour.isAvailable,
      isOnline: misAJour.isOnline,
      pausedUntil: misAJour.pausedUntil,
      pauseReason: misAJour.pauseReason,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /drivers/pause - Reprendre avant la fin de la pause
router.delete("/pause", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const misAJour = await DriverAvailabilityService.reprendre(livreur.id);

    res.json({
      success: true,
      isAvailable: misAJour.isAvailable,
      isOnline: misAJour.isOnline,
      pausedUntil: null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/push/config - Clé publique VAPID pour s'abonner aux notifications
router.get("/push/config", authMiddleware, async (_req: Request, res: Response) => {
  res.json({ success: true, data: { enabled: Notifier.canaux.push, publicKey: Notifier.canaux.vapidPublicKey } });
});

// POST /drivers/push/subscribe - Enregistre l'abonnement push du navigateur
router.post("/push/subscribe", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const abonnement = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      })
      .passthrough()
      .parse(req.body);

    await db.courier.update({ where: { id: livreur.id }, data: { pushSubscription: abonnement as any } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /drivers/push/subscribe - Désactive les notifications push
router.delete("/push/subscribe", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    await db.courier.update({ where: { id: livreur.id }, data: { pushSubscription: Prisma.DbNull } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/push/test - Envoie une notification d'essai
router.post("/push/test", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const envoye = await Notifier.pushLivreur(livreur.id, {
      title: "Notifications activées",
      body: "Vous serez prévenu de chaque nouvelle course, même l'application en arrière-plan.",
      url: "/driver",
    });
    res.json({ success: true, envoye });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/support/messages - Le fil du livreur avec le support
router.get("/support/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const messages = await DriverSupportService.fil(livreur.id);
    // Ouvrir le fil vaut lecture des réponses du support.
    await DriverSupportService.marquerLu(livreur.id, "DRIVER");
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/support/messages - Écrire au support
router.post("/support/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const body = z.object({ body: z.string().min(1).max(LONGUEUR_MAX) }).parse(req.body);
    const message = await DriverSupportService.envoyer(livreur.id, "DRIVER", body.body);
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/support/read - Marquer les réponses du support comme lues
router.post("/support/read", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    await DriverSupportService.marquerLu(livreur.id, "DRIVER");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/support/unread - Nombre de réponses non lues (pastille du menu)
router.get("/support/unread", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    res.json({ success: true, data: { unread: await DriverSupportService.nonLusPourLivreur(livreur.id) } });
  } catch (err) {
    next(err);
  }
});

const dateLongue = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Brussels" });
const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * Ce que la suppression implique pour ce livreur : courses en cours, dernier
 * versement, et ce qui reste de son compte. Un compte ZupOne est unique : la
 * même adresse ouvre l'espace client ZupEat (et un espace commerçant s'il en
 * a un). Seul le compte livreur est supprimé.
 */
async function apercuSuppression(livreur: { id: string; userId: string | null }) {
  const [coursesEnCours, solde, commerces] = await Promise.all([
    db.orderDelivery.count({ where: { driverId: livreur.id, status: { in: STATUTS_EN_COURSE } } }),
    DriverPayoutService.soldeFinal(livreur.id),
    livreur.userId ? db.membership.count({ where: { userId: livreur.userId } }) : 0,
  ]);
  return { coursesEnCours, ...solde, restent: { client: true, commercant: commerces > 0 } };
}

/** « Votre compte client ZupEat reste actif » (et commerçant, s'il en a un). */
function phraseAutresEspaces(restent: { commercant: boolean }) {
  return restent.commercant
    ? "Votre compte client ZupEat et votre espace commerçant restent actifs, avec la même adresse e-mail et le même mot de passe."
    : "Votre compte client ZupEat reste actif : vous pouvez toujours commander avec la même adresse e-mail et le même mot de passe.";
}

// GET /drivers/me/suppression - Ce que la suppression implique, avant de confirmer
router.get("/me/suppression", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    res.json({
      success: true,
      data: { ...(await apercuSuppression(livreur)), demandeeLe: livreur.suppressionDemandeeLe },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /drivers/me/suppression - Le livreur demande la suppression de son compte
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
router.post("/me/suppression", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const { motif } = z.object({ motif: z.string().max(500).optional() }).parse(req.body ?? {});

    const apercu = await apercuSuppression(livreur);
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

    res.json({
      success: true,
      data: apercu,
      message: `Votre compte livreur est supprimé : vous ne recevrez plus de courses. ${
        apercu.versementLe
          ? `Vos ${euros(apercu.montantDu)} de courses vous seront versés avec les paiements du ${dateLongue(apercu.versementLe)}, sur votre compte •••${apercu.ibanFin}. Vos données de livreur seront ensuite supprimées sous 30 jours, sauf celles que la loi nous oblige à conserver.`
          : "Vos données de livreur seront supprimées sous 30 jours, sauf celles que la loi nous oblige à conserver."
      } ${phraseAutresEspaces(apercu.restent)}`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/me - Get current driver info (protected)
const compteSchema = z.object({
  iban: z.string().min(15).max(40),
  bic: z.string().max(11).optional().nullable(),
  accountHolder: z.string().min(2).max(70),
});

// PUT /drivers/me/bank-account - Le compte où recevoir ses versements du lundi
router.put("/me/bank-account", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const corps = compteSchema.parse(req.body);

    if (!ibanValide(corps.iban)) {
      throw new ApiError(400, "Cet IBAN n'est pas valide : vérifiez-le.", "INVALID_IBAN");
    }

    await db.courier.update({
      where: { id: livreur.id },
      data: {
        iban: ibanNormalise(corps.iban),
        bic: corps.bic ? corps.bic.replace(/\s+/g, "").toUpperCase() : null,
        accountHolder: corps.accountHolder.trim(),
      },
    });

    res.json({ success: true, message: "Compte enregistré" });
  } catch (err) {
    next(err);
  }
});

router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId as string;

    const driver = await db.courier.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    }) as any;

    if (!driver) {
      throw new ApiError(404, "Driver not found", "DRIVER_NOT_FOUND");
    }

    res.json({
      success: true,
      data: {
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
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /drivers/documents - Les pièces du dossier du livreur connecté
 *
 * Le modèle existait sans qu'aucune route ne l'écrive ni ne le lise : le
 * livreur n'avait aucun moyen de déposer son permis, ni de savoir ce qu'on
 * attendait de lui.
 */
router.get("/documents", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const dossier = await DriverApprovalService.dossier(livreur.id);

    res.json({
      success: true,
      data: {
        status: dossier.status,
        statusReason: dossier.statusReason,
        dossierComplet: dossier.dossierComplet,
        piecesAttendues: dossier.piecesAttendues.map((type) => ({
          type,
          libelle: libelleDuDocument(type),
        })),
        piecesManquantes: dossier.piecesManquantes,
        documents: dossier.documents.map((piece) => ({
          id: piece.id,
          type: piece.type,
          libelle: libelleDuDocument(piece.type),
          documentUrl: piece.documentUrl,
          expiryDate: piece.expiryDate,
          status: piece.status,
          reviewNote: piece.reviewNote,
          reviewedAt: piece.reviewedAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

const pieceSchema = z.object({
  type: z.enum(TYPES_DOCUMENT),
  documentUrl: z.string().url("Donnez un lien vers le document"),
  expiryDate: z.string().optional().nullable(),
});

// POST /drivers/documents - Déposer une pièce du dossier par URL
router.post("/documents", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const body = pieceSchema.parse(req.body);

    const piece = await DriverApprovalService.deposerPiece(livreur.id, body);

    res.status(201).json({
      message: `${libelleDuDocument(piece.type)} déposée, en attente de validation`,
      data: piece,
    });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/documents/upload - Déposer une pièce du dossier par upload de fichier
router.post(
  "/documents/upload",
  authMiddleware,
  uploadMiddleware.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);

      if (!req.file) {
        throw new ApiError(400, "Aucun fichier fourni", "NO_FILE");
      }

      const schema = z.object({
        type: z.enum(TYPES_DOCUMENT),
        expiryDate: z.string().optional().nullable(),
      });

      const body = schema.parse(req.body);

      logger.info("Driver file upload", {
        driverId: livreur.id,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      const piece = await DriverApprovalService.deposerFichier(livreur.id, {
        type: body.type,
        file: req.file.buffer,
        filename: req.file.originalname || `document.${req.file.mimetype.split("/")[1]}`,
        mimeType: req.file.mimetype,
        expiryDate: body.expiryDate,
      });

      res.status(201).json({
        message: `${libelleDuDocument(piece.type)} déposée, en attente de validation`,
        data: piece,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /drivers/payouts - Ce qui est dû au livreur, et ce qui lui a été versé
 *
 * Ses gains s'accumulaient dans un seul total, sans qu'il puisse savoir si
 * l'argent était arrivé.
 */
router.get("/payouts", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    res.json({ success: true, data: await DriverPayoutService.situation(livreur.id) });
  } catch (err) {
    next(err);
  }
});

/** GET /drivers/payouts/:id - Le détail d'un relevé, course par course */
router.get(
  "/payouts/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);
      const releve = await DriverPayoutService.detail(req.params.id as string);

      // Le relevé d'un autre livreur ne le regarde pas.
      if (releve.driverId !== livreur.id) {
        throw new ApiError(404, "Relevé introuvable", "PAYOUT_NOT_FOUND");
      }

      res.json({ success: true, data: releve });
    } catch (err) {
      next(err);
    }
  }
);

// GET /drivers/deliveries - Get deliveries for driver (protected)
router.get("/deliveries", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const status = (req.query.status as string) || "PENDING";

    // Une course en attente ne regarde que le livreur à qui elle a été
    // proposée. Renvoyer toutes les courses de la plateforme laissait
    // n'importe qui prendre celle d'un autre, ce qui vide l'attribution de
    // son sens.
    const enAttente = status === "PENDING";

    // « ACTIVE » : la course en cours du livreur, acceptée ou déjà récupérée.
    // Sans ce filtre, le tableau de bord ne relevait que les courses en
    // attente : une fois acceptée, la course disparaissait de l'écran.
    const filtreStatut =
      status === "ACTIVE"
        ? { in: ["ACCEPTED", "PICKED_UP"] }
        : status.includes(",")
          ? { in: status.split(",").map((s) => s.trim()).filter(Boolean) }
          : status;

    const deliveries = await db.orderDelivery.findMany({
      where: {
        status: filtreStatut as any,
        ...(enAttente
          ? {
              driverId: null,
              offers: {
                some: { driverId: livreur.id, status: "PENDING", expiresAt: { gt: new Date() } },
              },
            }
          : { driverId: livreur.id }),
      },
      include: {
        order: {
          include: {
            items: {
              include: { product: true }
            },
            store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
            pourboireApres: { select: { status: true, amount: true } },
          }
        },
        // Le gain annoncé à ce livreur : la proposition en cours, ou celle
        // qu'il a acceptée.
        offers: {
          where: { driverId: livreur.id },
          select: { payout: true },
          orderBy: { offeredAt: "desc" },
          take: 1,
        },
      },
      take: 50,
      orderBy: { createdAt: "desc" }
    });

    // Les courses du livreur : celles de sa tournée qui ne sont pas encore
    // à leur tour ne montrent pas leur client.
    const etat = enAttente ? null : await DispatchService.etatTournee(livreur.id);
    const formatted = deliveries.map((d: any) => masquerClient({
      id: d.id,
      orderId: d.orderId,
      status: d.status,
      pickupAddress: adresseRetrait(d.order?.store),
      pickupStore: d.order?.store?.name || "",
      deliveryAddress: adresseLivraison(d.order),
      customerName: d.order?.customerName || "",
      customerPhone: d.order?.customerPhone || "",
      // Ce que la course lui rapporte. Le total payé par le client (articles,
      // livraison, frais de service) s'affichait à sa place : 20,25 € pour
      // une course qui lui rapporte 5 €. Il n'a rien à encaisser.
      payout: gainAnnonce(d, d.offers?.[0]),
      // La part du gain qui vient du pourboire du client (déjà comprise).
      pourboire: Number(d.order?.tipAmount || 0),
      pourboireApres: d.order?.pourboireApres?.status === "PAID" ? Number(d.order.pourboireApres.amount) : 0,
      distance: d.distanceKm ?? undefined,
      estimatedTime: d.estimatedTime,
      items: d.order?.items || [],
      // Les deux arrêts d'une course attribuée : l'application sait ainsi où
      // l'immobilité est normale (attendre au commerce, chez le client).
      ...(enAttente
        ? {}
        : {
            pickupLat: d.pickupLat ?? d.order?.store?.latitude ?? null,
            pickupLng: d.pickupLng ?? d.order?.store?.longitude ?? null,
            latitude: d.deliveryLat ?? null,
            longitude: d.deliveryLng ?? null,
          }),
    }, etat && STATUTS_EN_COURSE.includes(d.status) ? DispatchService.masquage(etat, d.id) : null));

    res.json({
      success: true,
      data: formatted
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/history - Historique paginé des courses du livreur
router.get("/history", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    const query = z
      .object({
        filtre: z.enum(["ALL", "ACTIVE", "DELIVERED", "CANCELLED"]).optional(),
        depuis: z.coerce.date().optional(),
        jusqua: z.coerce.date().optional(),
        page: z.coerce.number().int().min(1).optional(),
        parPage: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query);

    res.json({
      success: true,
      ...(await DriverActivityService.historique(livreur.id, {
        ...query,
        filtre: query.filtre as FiltreHistorique | undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/analytics?jours=7|30|90 - Statistiques du livreur
router.get("/analytics", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const { jours } = z
      .object({ jours: z.coerce.number().refine((j) => [7, 30, 90].includes(j)).default(7) })
      .parse(req.query);

    res.json({ success: true, data: await DriverActivityService.analytics(livreur.id, jours) });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/deliveries/:id - Get specific delivery (protected)
router.get("/deliveries/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveryId = req.params.id as string;

    // Seul le livreur de la course (ou celui à qui elle est proposée) la lit :
    // elle porte le nom, le téléphone et l'adresse du client.
    const { livreur } = await courseDuLivreur(req, deliveryId);

    const delivery = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: {
            items: { include: { product: true } },
            store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
            pourboireApres: { select: { status: true, amount: true } },
          }
        },
        offers: {
          where: { driverId: livreur.id, status: "ACCEPTED" },
          select: { payout: true, distanceKm: true, respondedAt: true },
          take: 1,
        },
      }
    });

    if (!delivery) {
      throw new ApiError(404, "Delivery not found", "DELIVERY_NOT_FOUND");
    }

    // Tant que la course n'est pas attribuée, seules les coordonnées
    // obfusquées sortent. Une fois acceptée, le livreur a besoin du point
    // exact pour s'y rendre.
    const attribuee = Boolean(delivery.driverId);
    const destLat = attribuee ? delivery.deliveryLat : delivery.deliveryLatObfusquee;
    const destLng = attribuee ? delivery.deliveryLng : delivery.deliveryLngObfusquee;

    const raison =
      delivery.driverId === livreur.id && STATUTS_EN_COURSE.includes(delivery.status)
        ? DispatchService.masquage(await DispatchService.etatTournee(livreur.id), delivery.id)
        : null;

    res.json({
      success: true,
      data: masquerClient({
        id: delivery.id,
        orderId: delivery.orderId,
        status: delivery.status,
        // Le livreur arrive pendant la préparation : il ne prend la commande
        // qu'une fois que le commerçant l'a déclarée prête.
        orderStatus: delivery.order?.status,
        pickupStore: delivery.order?.store?.name || "",
        pickupAddress: adresseRetrait(delivery.order?.store),
        deliveryAddress: adresseLivraison(delivery.order),
        customerName: delivery.order?.customerName,
        customerPhone: delivery.order?.customerPhone,
        payout: gainAnnonce(delivery, delivery.offers[0]),
        pourboire: Number(delivery.order?.tipAmount || 0),
        pourboireApres:
          delivery.order?.pourboireApres?.status === "PAID" ? Number(delivery.order.pourboireApres.amount) : 0,
        distance: delivery.distanceKm ?? undefined,
        estimatedTime: delivery.estimatedTime,
        pickupLat: delivery.pickupLat ?? delivery.order?.store?.latitude ?? null,
        pickupLng: delivery.pickupLng ?? delivery.order?.store?.longitude ?? null,
        latitude: destLat,
        longitude: destLng,
        items: delivery.order?.items || [],
        // Le livreur doit savoir qu'un code lui sera demandé, sans jamais le
        // lire : c'est le client qui le détient.
        ...DeliveryProofService.etatDeLaPreuve(delivery),
        // Course livrée par lui : ce qu'elle lui a rapporté, en distance et
        // en temps, pour l'écran de fin de course.
        bilan:
          delivery.status === "DELIVERED" && delivery.driverId === livreur.id
            ? bilanCourse(delivery, delivery.offers[0])
            : null,
      }, raison),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/deliveries/:id/accept - Accept delivery (protected)
router.patch(
  "/deliveries/:id/accept",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { livreur, course } = await courseDuLivreur(req, deliveryId);

      if (course.driverId === livreur.id) {
        throw new ApiError(409, "Vous avez déjà accepté cette course", "ALREADY_ACCEPTED");
      }

      // On accepte une proposition, pas une course au hasard. Cette route
      // attribuait la course sans fixer la rémunération ni marquer le livreur
      // occupé : il repartait avec une course non payée et pouvait en
      // recevoir une deuxième.
      const proposition = await db.deliveryOffer.findFirst({
        where: {
          deliveryId,
          driverId: livreur.id,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });

      if (!proposition) {
        throw new ApiError(
          403,
          "Cette course ne vous a pas été proposée",
          "NOT_OFFERED"
        );
      }

      const delivery = await DispatchService.accepter(proposition.id, livreur.id);

      res.json({
        success: true,
        message: "Course acceptée",
        data: delivery
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/deliveries/:id - Update delivery status (protected)
router.patch(
  "/deliveries/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { status } = req.body;

      const STATUTS = ["PENDING", "ACCEPTED", "PICKED_UP", "DELIVERED", "FAILED"];
      if (!status || !STATUTS.includes(status)) {
        throw new ApiError(400, `Statut invalide (attendu : ${STATUTS.join(", ")})`, "INVALID_INPUT");
      }

      const { livreur, course } = await courseDuLivreur(req, deliveryId);

      if (course.driverId !== livreur.id) {
        throw new ApiError(403, "Acceptez d'abord cette course", "NOT_ASSIGNED");
      }

      /**
       * Une course terminée ne revient pas en arrière.
       *
       * L'application renvoie au retour du réseau les étapes faites sans lui ;
       * une prise en charge partie en double après la remise ne doit pas
       * rouvrir une course livrée.
       */
      if ((course.status === "DELIVERED" || course.status === "FAILED") && status !== course.status) {
        throw new ApiError(409, "Cette course est déjà terminée", "DELIVERY_FINISHED");
      }

      /**
       * L'heure où l'étape a vraiment eu lieu.
       *
       * Faite sans réseau, elle n'arrive qu'au retour de celui-ci, parfois
       * vingt minutes plus tard : l'historique et les statistiques doivent
       * garder l'heure réelle. Retenue seulement si elle est plausible (dans
       * les six dernières heures, pas dans le futur, pas avant l'attribution) ;
       * sinon, l'heure de réception.
       */
      const maintenant = new Date();
      const declaree = typeof req.body?.effectueLe === "string" ? new Date(req.body.effectueLe) : null;
      const effectueLe =
        declaree &&
        !Number.isNaN(declaree.getTime()) &&
        declaree.getTime() <= maintenant.getTime() + 60_000 &&
        declaree.getTime() >= maintenant.getTime() - 6 * 3600_000 &&
        (!course.assignedAt || declaree.getTime() >= course.assignedAt.getTime())
          ? new Date(Math.min(declaree.getTime(), maintenant.getTime()))
          : maintenant;

      /**
       * La commande ne quitte le commerce qu'une fois prête.
       *
       * Le livreur est appelé dès « En préparation » pour avoir le temps
       * d'arriver : il attend alors que le commerçant la déclare prête.
       */
      if (status === "PICKED_UP" && course.status !== "PICKED_UP") {
        const commande = await db.order.findUnique({
          where: { id: course.orderId },
          select: { status: true },
        });
        if (commande && commande.status !== "READY") {
          throw new ApiError(
            409,
            "La commande est encore en préparation : attendez que le commerçant la déclare prête.",
            "ORDER_NOT_READY"
          );
        }
      }

      /**
       * Clore une course demande une preuve.
       *
       * Elle passait à DELIVERED sur simple clic : rien ne distinguait un repas
       * remis en main propre d'un repas jamais sorti du sac. Le code du client
       * le prouve ; à défaut, la photo du dépôt.
       */
      let preuve: string | null = null;
      if (status === "DELIVERED" && course.status !== "DELIVERED") {
        // Tournée : on ne remet qu'à son tour, toutes les commandes en main.
        await DispatchService.exigerTourAtteint(livreur.id, deliveryId);
        preuve = await DeliveryProofService.verifier(deliveryId, {
          code: req.body?.code,
          photoUrl: req.body?.photoUrl,
          note: req.body?.note,
          // Où le téléphone était quand la photo a été prise (indice, voir
          // photoPriseLoinDuClient).
          position: lirePositionDepot(req.body?.positionDepot),
        });
      }

      const delivery = await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          status: status as any,
          ...(status === "DELIVERED" && course.status !== "DELIVERED" && { deliveryTime: effectueLe }),
          // L'heure de récupération sert à l'historique et aux statistiques.
          ...(status === "PICKED_UP" && course.status !== "PICKED_UP" && { pickupTime: effectueLe })
        },
        include: { order: { select: { feesAmount: true, tipAmount: true } } }
      });

      // Un retrait de plus : l'ordre des remises se recalcule, depuis le
      // dernier commerce, une fois toutes les commandes en main.
      if (status === "PICKED_UP" && course.status !== "PICKED_UP") {
        await db.orderDelivery.updateMany({
          where: { driverId: livreur.id, status: { in: STATUTS_EN_COURSE } },
          data: { ordreRemise: null },
        });
      }

      // Une course livrée alimente les compteurs du livreur. On paie ce qui a
      // été annoncé à l'attribution, pas les frais facturés au client : une
      // course longue doit être payée comme telle même si le commerçant offre
      // la livraison.
      if (status === "DELIVERED" && course.status !== "DELIVERED") {
        const remuneration = Number(delivery.driverPayout ?? delivery.order?.feesAmount ?? 0);

        // Mettre à jour le statut de la commande à COMPLETED quand la livraison est DELIVERED
        await db.order.update({
          where: { id: delivery.orderId },
          data: { status: "COMPLETED" },
        });

        await db.courier.update({
          where: { id: livreur.id },
          data: {
            totalDeliveries: { increment: 1 },
            totalEarnings: { increment: remuneration },
          },
        });
        // Le livreur redevient disponible pour la course suivante, sauf s'il
        // lui en reste d'autres dans sa tournée.
        await DispatchService.liberer(livreur.id);

        // Le pourboire laissé en commandant lui est acquis à la remise : on
        // le lui dit, comme pour celui laissé après la livraison.
        const pourboire = Number(delivery.order?.tipAmount ?? 0);
        if (pourboire > 0) {
          try {
            const notification = await db.notification.create({
              data: {
                type: "PLATFORM_ANNOUNCEMENT",
                title: "Vous avez reçu un pourboire 🎉",
                message: `${pourboire.toFixed(2).replace(".", ",")} € laissés par le client pour cette course. Ils sont compris dans votre gain.`,
                recipientEmail: livreur.email,
                link: "/driver/earnings",
                relatedOrderId: delivery.orderId,
              },
            });
            emitNotification(livreur.email, notification);
          } catch (err) {
            logger.warn("Pourboire : notification du livreur impossible", { error: (err as Error).message });
          }
        }

        // Notifier le client que la commande est livrée avec succès
        const order = await db.order.findUnique({
          where: { id: delivery.orderId },
          select: { customerEmail: true },
        });

        if (order?.customerEmail) {
          // Créer une notification pour le client
          await db.notification.create({
            data: {
              type: "ORDER_DELIVERED",
              title: "Commande livrée avec succès",
              message: "Votre commande a été livrée. Merci pour votre achat !",
              recipientEmail: order.customerEmail,
              link: `/client/orders/${delivery.orderId}`,
              relatedOrderId: delivery.orderId,
            },
          });

          // Notifier en temps réel via Socket.IO
          const { emitOrderUpdate } = await import("../realtime/socket");
          emitOrderUpdate(delivery.orderId, "COMPLETED", {
            message: "Votre commande a été livrée. Merci pour votre achat !",
            title: "Commande livrée avec succès",
          });
          emitNotification(order.customerEmail, {
            type: "order_delivered",
            orderId: delivery.orderId,
            status: "COMPLETED",
            title: "Commande livrée avec succès",
            message: "Votre commande a été livrée. Merci pour votre achat !",
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Un dépôt en photo fait pendant un incident de livraison n'est pas payé
      // sans examen de la plateforme. Un échec ici n'annule pas la remise.
      if (preuve === "PHOTO") {
        try {
          await SurveillanceCoursesService.apresDepotPhoto(deliveryId);
        } catch (err) {
          logger.error("Dépôt en photo : examen impossible", {
            deliveryId,
            error: err instanceof Error ? err.message : err,
          });
        }
      }

      // Une course abandonnée doit libérer le livreur, sans quoi il ne reçoit
      // plus rien.
      if (status === "FAILED" && course.status !== "FAILED") {
        await DispatchService.liberer(livreur.id);
      }

      emitDeliveryUpdate(delivery.orderId, { status });

      // Le client est prévenu hors de l'application des étapes qui comptent.
      if ((status === "PICKED_UP" || status === "DELIVERED") && course.status !== status) {
        enArrierePlan(Notifier.etapeLivraisonClient(delivery.orderId, status));
      }

      res.json({
        success: true,
        message: "Delivery updated",
        data: delivery
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /drivers/deliveries/:id/photo - La photo du dépôt, prise sur place
 *
 * Le livreur devait coller un lien vers une photo hébergée ailleurs : personne
 * ne le faisait. La photo part maintenant de l'appareil du téléphone et reste
 * chez nous, où le client la voit. Elle n'est retenue comme preuve qu'à la
 * clôture de la course (PATCH /deliveries/:id avec `photoUrl`).
 */
router.post(
  "/deliveries/:id/photo",
  authMiddleware,
  uploadMiddleware.single("photo"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { livreur, course } = await courseDuLivreur(req, deliveryId);

      if (course.driverId !== livreur.id) {
        throw new ApiError(403, "Acceptez d'abord cette course", "NOT_ASSIGNED");
      }
      if (course.status !== "PICKED_UP") {
        throw new ApiError(400, "La photo se prend au moment du dépôt", "NOT_PICKED_UP");
      }
      await DispatchService.exigerTourAtteint(livreur.id, deliveryId);
      // Le dépôt ne se photographie qu'au terme de l'attente du client.
      exigerAttenteTerminee(course);
      if (!req.file) {
        throw new ApiError(400, "Aucune photo reçue", "NO_FILE");
      }
      if (!req.file.mimetype.startsWith("image/")) {
        throw new ApiError(400, "Le dépôt se prouve par une photo", "INVALID_FILE_TYPE");
      }

      const { url } = await FileUploadService.uploadDocument(
        req.file.buffer,
        req.file.originalname || "depot.jpg",
        "deliveries",
        req.file.mimetype
      );

      // photoUrl est l'adresse à transmettre à la remise ; apercuUrl, signée
      // et valable cinq minutes, s'affiche tout de suite dans une balise <img>
      // (la pièce n'est pas encore rattachée à la course).
      const relatif = cheminRelatif(url);
      res.status(201).json({
        success: true,
        data: { photoUrl: url, apercuUrl: relatif ? adresseSignee(relatif) : url },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /drivers/deliveries/:id/attente - Le client ne répond pas : l'attente commence
 *
 * Le livreur est à la porte, il a appelé sans réponse. Six minutes commencent,
 * que le client voit sur son suivi et reçoit par notification ; à leur terme
 * seulement, le livreur peut déposer la commande en lieu sûr et la
 * photographier. Relancer ne remet pas le compteur à zéro.
 */
router.post(
  "/deliveries/:id/attente",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { livreur, course } = await courseDuLivreur(req, deliveryId);

      if (course.driverId !== livreur.id) {
        throw new ApiError(403, "Acceptez d'abord cette course", "NOT_ASSIGNED");
      }
      if (course.status !== "PICKED_UP") {
        throw new ApiError(409, "L'attente commence une fois la commande récupérée, chez le client", "NOT_PICKED_UP");
      }
      // Tournée : on n'attend un client qu'à son tour.
      await DispatchService.exigerTourAtteint(livreur.id, deliveryId);

      // Devant chez le client, et pas ailleurs : l'attente ouvre le dépôt en
      // photo (voir exigerPresenceChezClient). Un second appui sur une attente
      // déjà lancée n'est pas contrôlé de nouveau.
      if (!course.customerWaitStartedAt) {
        const fraiche =
          !livreur.gpsLostAt &&
          livreur.lastLocationUpdate &&
          Date.now() - livreur.lastLocationUpdate.getTime() <= GPS_PERDU_APRES_MS;
        const position =
          fraiche && livreur.latitude != null && livreur.longitude != null
            ? { latitude: livreur.latitude, longitude: livreur.longitude }
            : null;
        exigerPresenceChezClient(position, course);
      }

      // Une seule attente par course, même si le bouton est touché deux fois.
      const lancee = await db.orderDelivery.updateMany({
        where: { id: deliveryId, customerWaitStartedAt: null },
        data: { customerWaitStartedAt: new Date() },
      });
      const aJour = await db.orderDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
        select: { orderId: true, customerWaitStartedAt: true },
      });
      const fin = finAttente(aJour);

      if (lancee.count > 0 && fin) {
        // Le suivi du client affiche aussitôt le compte à rebours.
        emitDeliveryUpdate(aJour.orderId, { status: "PICKED_UP", attenteFinLe: fin, maintenant: new Date() });
        enArrierePlan(Notifier.attenteClient(aJour.orderId, fin));
        logger.info("Customer wait started", { deliveryId, driverId: livreur.id });
      }

      res.json({
        success: true,
        data: { attenteDebutLe: aJour.customerWaitStartedAt, attenteFinLe: fin, maintenant: new Date() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /drivers/ratings - Ce que les clients ont dit de ses courses
router.get("/ratings", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    res.json({ success: true, data: await notesDuLivreur(livreur.id) });
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/deliveries/:id/location - Update driver location (protected)
router.patch(
  "/deliveries/:id/location",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { latitude, longitude } = req.body;

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        throw new ApiError(400, "Latitude et longitude requises", "INVALID_INPUT");
      }

      await courseDuLivreur(req, deliveryId);

      const { livreur } = await courseDuLivreur(req, deliveryId);

      // Écrire ici dans deliveryLat/Lng effaçait l'adresse de livraison du
      // client à chaque envoi de position. La position du livreur a désormais
      // ses propres colonnes.
      await DispatchService.enregistrerPosition(livreur.id, { latitude, longitude });

      res.json({
        success: true,
        message: "Position enregistrée",
        data: { latitude, longitude }
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/location - Position du livreur, course ou non
router.patch("/location", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .parse(req.body);

    const livreur = await livreurConnecte(req);

    // La position compte même sans course en cours : c'est elle qui décide à
    // qui la prochaine sera proposée.
    const resultat = await DispatchService.enregistrerPosition(livreur.id, body);

    res.json({ success: true, ...resultat });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/offers - Courses proposées, en attente de réponse
router.get("/offers", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    const propositions = await db.deliveryOffer.findMany({
      where: {
        driverId: livreur.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      include: {
        delivery: {
          include: {
            order: {
              select: {
                id: true,
                deliveryAddress: true,
                deliveryCity: true,
                deliveryPostal: true,
                store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
              },
            },
          },
        },
      },
      orderBy: { offeredAt: "asc" },
    });

    res.json({
      success: true,
      data: propositions.map((proposition) => ({
        id: proposition.id,
        deliveryId: proposition.deliveryId,
        // Trajet payé, du commerce au client.
        distanceKm: proposition.distanceKm,
        // Chemin du livreur jusqu'au commerce, depuis sa dernière position.
        approcheKm: (() => {
          const store = proposition.delivery.order?.store;
          const depart = { latitude: livreur.latitude, longitude: livreur.longitude };
          const arrivee = { latitude: store?.latitude, longitude: store?.longitude };
          return estUnPoint(depart) && estUnPoint(arrivee)
            ? Number(distanceKm(depart, arrivee).toFixed(2))
            : null;
        })(),
        payout: Number(proposition.payout || 0),
        expiresAt: proposition.expiresAt,
        // Plusieurs courses : proposées ensemble (même batchId, un seul
        // « Accepter » pour tout le lot), ou ajoutée à la course en cours.
        batchId: proposition.batchId,
        ajout: proposition.ajout,
        // Nouvelles données
        pickupStore: proposition.delivery.order?.store?.name,
        pickupAddress: proposition.delivery.order?.store?.address,
        pickupCity: proposition.delivery.order?.store?.city,
        pickupLat: proposition.delivery.order?.store?.latitude,
        pickupLng: proposition.delivery.order?.store?.longitude,
        deliveryAddress: proposition.delivery.order?.deliveryAddress,
        deliveryCity: proposition.delivery.order?.deliveryCity,
        deliveryPostal: proposition.delivery.order?.deliveryPostal,
        // Le point de livraison, à 50-100 m près tant que la course n'est pas
        // acceptée : de quoi tracer le trajet sur la carte de la proposition.
        deliveryLat: proposition.delivery.deliveryLatObfusquee,
        deliveryLng: proposition.delivery.deliveryLngObfusquee,
        // Anciennes données (rétrocompatibilité)
        boutique: proposition.delivery.order?.store,
        adresse: proposition.delivery.order?.deliveryAddress,
        ville: proposition.delivery.order?.deliveryCity,
        codePostal: proposition.delivery.order?.deliveryPostal,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /drivers/tournee - Les arrêts du livreur, dans l'ordre
 *
 * Avec plusieurs courses, l'ordre des retraits et des remises ne va pas de
 * soi : le serveur le calcule depuis la position du livreur (voir
 * tournee.service.ts), un retrait toujours avant sa remise.
 */
router.get("/tournee", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const courses = await db.orderDelivery.findMany({
      where: { driverId: livreur.id, status: { in: STATUTS_EN_COURSE } },
      include: {
        order: {
          select: {
            status: true,
            customerName: true,
            deliveryAddress: true,
            deliveryPostal: true,
            deliveryCity: true,
            store: { select: { name: true, address: true, city: true } },
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    });

    const depart = { latitude: livreur.latitude, longitude: livreur.longitude };
    const { arrets: tous, km } = ordonner(
      estUnPoint(depart) ? depart : null,
      courses.map(versCourseTournee)
    );
    const parId = new Map(courses.map((c) => [c.id, c]));

    // Ce que le livreur voit : les commandes à récupérer d'abord ; ensuite
    // une seule remise, celle dont c'est le tour (ordre figé au dernier
    // retrait). Les autres clients restent masqués.
    const etat = await DispatchService.etatTournee(livreur.id);
    const arrets =
      etat.retraitsRestants > 0
        ? tous.filter((a) => a.type === "RETRAIT")
        : tous.filter((a) => a.type === "REMISE" && a.deliveryId === etat.remiseCourante);
    const remisesMasquees = courses.length - (etat.retraitsRestants > 0 ? 0 : arrets.length);

    res.json({
      success: true,
      data: {
        km: Number(km.toFixed(2)),
        remisesMasquees,
        arrets: arrets.map((a) => {
          const c = parId.get(a.deliveryId)!;
          const retrait = a.type === "RETRAIT";
          return {
            deliveryId: c.id,
            orderId: c.orderId,
            type: a.type,
            statutCourse: c.status,
            // Au commerce : la commande n'est à prendre qu'une fois prête.
            commandePrete: c.order?.status === "READY",
            nom: retrait ? c.order?.store?.name || "Commerce" : c.order?.customerName || "Client",
            adresse: retrait ? adresseRetrait(c.order?.store) : adresseLivraison(c.order),
            lat: a.point.latitude ?? null,
            lng: a.point.longitude ?? null,
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /drivers/offers/:id/accept - Accepter une course proposée
router.post(
  "/offers/:id/accept",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);
      const course = await DispatchService.accepter(req.params.id as string, livreur.id);

      res.json({
        success: true,
        message: course.lot.length > 1 ? `${course.lot.length} courses acceptées` : "Course acceptée",
        data: course,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drivers/offers/:id/decline - Refuser, la course part au suivant
router.post(
  "/offers/:id/decline",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const livreur = await livreurConnecte(req);
      const suivante = await DispatchService.refuser(req.params.id as string, livreur.id);

      res.json({
        success: true,
        message: "Course refusée",
        // Dit au commerçant si quelqu'un d'autre a été sollicité.
        reproposee: Boolean(suivante),
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/deliveries/:id/cancel - Annuler une course acceptée
router.patch(
  "/deliveries/:id/cancel",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body;
      const deliveryId = req.params.id as string;

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        throw new ApiError(400, "La raison d'annulation est requise", "MISSING_REASON");
      }

      const { livreur, course } = await courseDuLivreur(req, deliveryId);

      if (course.status !== "ACCEPTED") {
        throw new ApiError(
          409,
          "Seule une course acceptée peut être annulée",
          "INVALID_STATUS"
        );
      }

      // Annuler la course
      await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "FAILED",
          driverId: null,
          assignedAt: null,
          cancelledBy: "DRIVER",
          cancellationReason: reason.trim(),
        },
      });

      // Libérer le livreur, s'il n'a pas d'autre course dans sa tournée.
      await DispatchService.liberer(livreur.id);

      // Remettre la commande en READY pour permettre au restaurant de proposer à un autre livreur
      const order = await db.order.update({
        where: { id: course.orderId },
        data: { status: "READY" },
        select: { customerEmail: true },
      });

      // Notifier le client et le restaurant
      if (order.customerEmail) {
        await db.notification.create({
          data: {
            type: "DELIVERY_CANCELLED",
            title: "Livraison annulée",
            message: `Votre livraison a été annulée. Un autre livreur sera assigné sous peu.`,
            recipientEmail: order.customerEmail,
            link: `/client/orders/${course.orderId}`,
            relatedOrderId: course.orderId,
          },
        });

        const { emitNotification } = await import("../realtime/socket");
        emitNotification(order.customerEmail, {
          type: "delivery_cancelled",
          orderId: course.orderId,
          reason,
          title: "Livraison annulée",
          message: "Un autre livreur sera assigné.",
        });
      }

      res.json({
        success: true,
        message: "Course annulée. Un autre livreur sera proposé au restaurant.",
        data: { deliveryId, orderId: course.orderId },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /drivers/documents/file/<dossier>/<fichier> - L'ancienne adresse des
 * pièces, gardée pour les écrans qui s'en servent encore. Elle était publique
 * et répondait « Access-Control-Allow-Origin: * » : n'importe quel site lisait
 * un permis ou un RIB. Elle passe maintenant par le même contrôle que
 * /api/files (voir modules/files/files.routes.ts).
 */
router.get(/^\/documents\/file\/(.+)$/, (req: Request, res: Response, next: NextFunction) =>
  servirFichierPrive(cheminRelatif((req.params as any)[0]), req, res, next)
);

// GET /drivers/available - Get available delivery drivers within radius
router.get("/available", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Désactiver le cache pour cette route (elle retourne des données dynamiques)
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const storeId = req.query.storeId as string;
    // Même rayon que l'attribution par défaut : un livreur listé ici doit
    // pouvoir recevoir la course.
    const reglages = await DispatchService.reglages();
    const radius = Math.min(parseInt(req.query.radius as string) || reglages.maxRadiusKm, 50);

    if (!storeId) {
      throw new ApiError(400, "storeId est requis", "STORE_ID_REQUIRED");
    }

    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, latitude: true, longitude: true },
    });

    if (!store) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
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

    res.json({
      success: true,
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
    });
  } catch (err) {
    next(err);
  }
});

export default router;
