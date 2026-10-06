import { Outbox } from "../jobs/outbox.service";
import { EmailService } from "./email.service";

/** Types de messages de l'outbox et ce qu'ils déclenchent. */
export const TYPE_EMAIL_SUIVI_COMMANDE = "email.suivi_commande";

/** La commande payée en ligne est annoncée au commerçant (sonnerie, e-mail, push). */
export const TYPE_ANNONCE_COMMANDE = "commande.annonce_commercant";

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

export function declarerGestionnairesOutbox() {
  Outbox.declarer(TYPE_ANNONCE_COMMANDE, annoncerCommande);
  Outbox.declarer(TYPE_EMAIL_SUIVI_COMMANDE, (payload: PayloadEmailSuiviCommande) =>
    EmailService.sendOrderStatusUpdate(payload.commande, payload.contenu)
  );
}
