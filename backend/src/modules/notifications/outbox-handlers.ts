import { z } from "zod";
import { Outbox } from "../jobs/outbox.service";
import { EmailService } from "./email.service";

/** Types de messages de l'outbox et ce qu'ils déclenchent. */
export const TYPE_EMAIL_SUIVI_COMMANDE = "email.suivi_commande";

/** La commande payée en ligne est annoncée au commerçant (sonnerie, e-mail, push). */
export const TYPE_ANNONCE_COMMANDE = "commande.annonce_commercant";

/** L'e-mail d'une notification ZupDrive (journal NotificationLog) : le journal passe SENT après l'envoi. */
export const TYPE_EMAIL_NOTIFICATION_ZUPDRIVE = "zupdrive.notification_email";

/** L'e-mail d'une alerte de monitoring ZupDrive (NotificationDrive). */
export const TYPE_EMAIL_ALERTE_ZUPDRIVE = "zupdrive.alerte_email";

export interface PayloadAnnonceCommande {
  orderId: string;
}

export interface PayloadEmailSuiviCommande {
  commande: { id: string; customerName: string; customerEmail: string; totalAmount: number };
  contenu: { titre: string; message: string };
}

/** Rejouable : une annonce reprise après un arrêt peut arriver deux fois, jamais zéro. */
export async function annoncerCommande({ orderId }: PayloadAnnonceCommande) {
  const { db } = await import("../../services/db");
  const commande = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { product: { include: { category: { select: { name: true } } } }, variant: true },
      },
    },
  });
  if (!commande || commande.deletedAt) return;
  // Import tardif : le service des commandes dépend déjà du paiement.
  const { OrderService } = await import("../orders/order.service");
  await OrderService.annoncerAuCommercant(commande);
}

/** Imports tardifs : les services ZupDrive dépendent déjà du notifier. */
async function servicesZupDrive() {
  const [{ ZupDriveNotificationsService }, { ZupDriveMonitoringService }] = await Promise.all([
    import("../zupdrive/zupdrive-notifications.service"),
    import("../zupdrive/zupdrive-monitoring.service"),
  ]);
  return { ZupDriveNotificationsService, ZupDriveMonitoringService };
}

// Le contenu de l'outbox vient de la base : relu et validé avant d'agir.
const payloadAnnonceCommande = z.object({ orderId: z.string() });
const payloadEmailSuiviCommande = z.object({
  commande: z.object({ id: z.string(), customerName: z.string(), customerEmail: z.string(), totalAmount: z.number() }),
  contenu: z.object({ titre: z.string(), message: z.string() }),
});
const payloadEmailNotificationZupDrive = z.object({ logId: z.string() });
const payloadEmailAlerteZupDrive = z.object({ notificationId: z.string() });
const payloadEmailConfirmation = z.object({ userId: z.string() });

export function declarerGestionnairesOutbox() {
  Outbox.declarer("auth.confirmation_email", async (payload) => {
    const { userId } = payloadEmailConfirmation.parse(payload);
    const { envoyerConfirmationDuCompte } = await import("../auth/auth-confirmation.service");
    return envoyerConfirmationDuCompte(userId);
  });
  Outbox.declarer(TYPE_ANNONCE_COMMANDE, (payload) => annoncerCommande(payloadAnnonceCommande.parse(payload)));
  Outbox.declarer(TYPE_EMAIL_SUIVI_COMMANDE, (payload) => {
    const { commande, contenu } = payloadEmailSuiviCommande.parse(payload);
    return EmailService.sendOrderStatusUpdate(commande, contenu);
  }
  );
  Outbox.declarer(
    TYPE_EMAIL_NOTIFICATION_ZUPDRIVE,
    async (payload) => {
      const { logId } = payloadEmailNotificationZupDrive.parse(payload);
      return (await servicesZupDrive()).ZupDriveNotificationsService.envoyerEmailDuJournal(logId);
    },
    async (payload, erreur) => {
      const { logId } = payloadEmailNotificationZupDrive.parse(payload);
      return (await servicesZupDrive()).ZupDriveNotificationsService.marquerEmailEchoue(logId, erreur);
    }
  );
  Outbox.declarer(TYPE_EMAIL_ALERTE_ZUPDRIVE, async (payload) => {
    const { notificationId } = payloadEmailAlerteZupDrive.parse(payload);
    return (await servicesZupDrive()).ZupDriveMonitoringService.envoyerEmailAlerte(notificationId);
  });
}
