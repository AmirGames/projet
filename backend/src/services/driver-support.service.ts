import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { emitDriverEvent, emitSupportEvent } from "../config/socket";
import { Notifier, enArrierePlan } from "./notifier.service";

/**
 * Chat en direct entre les livreurs et le support de la plateforme.
 *
 * Un livreur bloqué devant un immeuble fermé, un client injoignable ou un
 * restaurant qui n'a pas préparé la commande n'avait que le ticket écrit,
 * pensé pour les commerçants et lu le lendemain. Ici chaque message est
 * poussé en direct des deux côtés, et le fil garde la course concernée.
 */

export const LONGUEUR_MAX = 2000;

type Expediteur = "DRIVER" | "SUPPORT";

function formater(message: {
  id: string;
  driverId: string;
  sender: string;
  body: string;
  deliveryId: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    driverId: message.driverId,
    sender: message.sender as Expediteur,
    body: message.body,
    deliveryId: message.deliveryId,
    readAt: message.readAt,
    createdAt: message.createdAt,
  };
}

export class DriverSupportService {
  static async envoyer(
    driverId: string,
    expediteur: Expediteur,
    texte: string,
    options: { authorId?: string; deliveryId?: string | null } = {}
  ) {
    const body = texte.trim();
    if (!body) throw new ApiError(400, "Le message est vide", "EMPTY_MESSAGE");
    if (body.length > LONGUEUR_MAX) {
      throw new ApiError(400, `Message limité à ${LONGUEUR_MAX} caractères`, "MESSAGE_TOO_LONG");
    }

    const livreur = await db.driver.findUnique({
      where: { id: driverId },
      select: { id: true, name: true, email: true, currentOrderId: true, user: { select: { email: true } } },
    });
    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");

    const message = await db.driverSupportMessage.create({
      data: {
        driverId,
        sender: expediteur,
        authorId: options.authorId ?? null,
        body,
        // Écrit en pleine course, le message y est rattaché d'office : le
        // support voit tout de suite de quelle commande il s'agit.
        deliveryId:
          options.deliveryId !== undefined
            ? options.deliveryId
            : expediteur === "DRIVER"
              ? livreur.currentOrderId
              : null,
      },
    });

    const charge = formater(message);
    emitDriverEvent(livreur.user?.email || livreur.email, "support-message", charge);
    emitSupportEvent("support-message", { ...charge, driverName: livreur.name });

    if (expediteur === "SUPPORT") {
      enArrierePlan(
        Notifier.pushLivreur(driverId, {
          title: "Réponse du support",
          body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
          url: "/driver/support",
          tag: "support",
        })
      );
    }

    return charge;
  }

  /** Le fil d'un livreur, du plus ancien au plus récent. */
  static async fil(driverId: string, limite = 200) {
    const messages = await db.driverSupportMessage.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limite, 1), 500),
    });
    return messages.reverse().map(formater);
  }

  /** Marque comme lus les messages écrits par l'autre partie. */
  static async marquerLu(driverId: string, lecteur: Expediteur) {
    const { count } = await db.driverSupportMessage.updateMany({
      where: { driverId, sender: lecteur === "DRIVER" ? "SUPPORT" : "DRIVER", readAt: null },
      data: { readAt: new Date() },
    });

    if (count > 0) {
      // L'autre côté voit ses messages passer en « lu ».
      if (lecteur === "SUPPORT") {
        const livreur = await db.driver.findUnique({
          where: { id: driverId },
          select: { email: true, user: { select: { email: true } } },
        });
        if (livreur) emitDriverEvent(livreur.user?.email || livreur.email, "support-lu", { driverId });
      } else {
        emitSupportEvent("support-lu", { driverId });
      }
    }
    return count;
  }

  static async nonLusPourLivreur(driverId: string) {
    return db.driverSupportMessage.count({ where: { driverId, sender: "SUPPORT", readAt: null } });
  }

  /** Les conversations, la plus récente d'abord, avec les messages en attente. */
  static async conversations() {
    const derniers = await db.driverSupportMessage.groupBy({
      by: ["driverId"],
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 100,
    });
    if (derniers.length === 0) return [];

    const ids = derniers.map((d) => d.driverId);

    const [livreurs, nonLus, apercus] = await Promise.all([
      db.driver.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, phone: true, isOnline: true, currentOrderId: true },
      }),
      db.driverSupportMessage.groupBy({
        by: ["driverId"],
        where: { driverId: { in: ids }, sender: "DRIVER", readAt: null },
        _count: true,
      }),
      Promise.all(
        ids.map((driverId) =>
          db.driverSupportMessage.findFirst({ where: { driverId }, orderBy: { createdAt: "desc" } })
        )
      ),
    ]);

    return derniers.map((d, i) => {
      const livreur = livreurs.find((l) => l.id === d.driverId);
      const apercu = apercus[i];
      return {
        driverId: d.driverId,
        driverName: livreur?.name ?? "Livreur",
        phone: livreur?.phone ?? null,
        isOnline: livreur?.isOnline ?? false,
        enCourse: Boolean(livreur?.currentOrderId),
        unread: nonLus.find((n) => n.driverId === d.driverId)?._count ?? 0,
        lastMessage: apercu ? { body: apercu.body, sender: apercu.sender, createdAt: apercu.createdAt } : null,
      };
    });
  }
}
