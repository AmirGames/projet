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

export function declarerGestionnairesOutbox() {
  Outbox.declarer(TYPE_ANNONCE_COMMANDE, annoncerCommande);
  Outbox.declarer(TYPE_EMAIL_SUIVI_COMMANDE, (payload: PayloadEmailSuiviCommande) =>
    EmailService.sendOrderStatusUpdate(payload.commande, payload.contenu)
  );
  Outbox.declarer(
    TYPE_EMAIL_NOTIFICATION_ZUPDRIVE,
    async ({ logId }: { logId: string }) => (await servicesZupDrive()).ZupDriveNotificationsService.envoyerEmailDuJournal(logId),
    async ({ logId }: { logId: string }, erreur) =>
      (await servicesZupDrive()).ZupDriveNotificationsService.marquerEmailEchoue(logId, erreur)
  );
  Outbox.declarer(TYPE_EMAIL_ALERTE_ZUPDRIVE, async ({ notificationId }: { notificationId: string }) =>
    (await servicesZupDrive()).ZupDriveMonitoringService.envoyerEmailAlerte(notificationId)
  );
}
