import { Outbox } from "../jobs/outbox.service";
import { EmailService } from "./email.service";

/** Types de messages de l'outbox et ce qu'ils déclenchent. */
export const TYPE_EMAIL_SUIVI_COMMANDE = "email.suivi_commande";

export interface PayloadEmailSuiviCommande {
  commande: { id: string; customerName: string; customerEmail: string; totalAmount: number };
  contenu: { titre: string; message: string };
}

export function declarerGestionnairesOutbox() {
  Outbox.declarer(TYPE_EMAIL_SUIVI_COMMANDE, (payload: PayloadEmailSuiviCommande) =>
    EmailService.sendOrderStatusUpdate(payload.commande, payload.contenu)
  );
}
