import { emailTransporter, EMAIL_CONFIG } from "../config/email";
import { logger } from "../config/logger";

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  // Send email
  static async sendEmail(data: EmailData) {
    try {
      logger.info("Sending email", { to: data.to, subject: data.subject });

      const result = await emailTransporter.sendMail({
        from: EMAIL_CONFIG.from,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      });

      logger.info("Email sent successfully", { messageId: result.messageId });
      return { success: true, messageId: result.messageId };
    } catch (err) {
      logger.error("Email sending failed", { error: err });
      throw err;
    }
  }

  // Order confirmation email
  static async sendOrderConfirmation(order: any) {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #2d3748; color: white; padding: 20px; border-radius: 5px; }
              .content { padding: 20px; background-color: #f7fafc; margin: 20px 0; border-radius: 5px; }
              .order-number { font-size: 24px; font-weight: bold; color: #2d3748; }
              .details { margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
              .button { display: inline-block; background-color: #48bb78; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; color: #718096; font-size: 12px; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🕒 Commande reçue</h1>
              </div>

              <div class="content">
                <p>Bonjour ${order.customerName},</p>
                <p>Merci pour votre commande ! Elle a été transmise au restaurant, qui doit maintenant la confirmer. Vous recevrez un e-mail dès qu'il l'aura acceptée, avec l'heure prévue.</p>

                <div class="details">
                  <div class="detail-row">
                    <strong>Numéro de commande:</strong>
                    <span class="order-number">${order.id.slice(0, 12).toUpperCase()}</span>
                  </div>
                  <div class="detail-row">
                    <strong>Date:</strong>
                    <span>${new Date(order.createdAt).toLocaleDateString('fr-FR')}</span>
                  </div>
                  <div class="detail-row">
                    <strong>Type de livraison:</strong>
                    <span>${order.deliveryType === 'PICKUP' ? 'À emporter' : 'Livraison'}</span>
                  </div>
                  ${
                    order.pickupTime
                      ? `<div class="detail-row">
                          <strong>Heure de retrait:</strong>
                          <span>${new Date(order.pickupTime).toLocaleTimeString('fr-FR')}</span>
                        </div>`
                      : ''
                  }
                  <div class="detail-row">
                    <strong>Montant total TTC:</strong>
                    <span style="font-size: 18px; color: #48bb78;">€${Number(order.totalAmount).toFixed(2)}</span>
                  </div>
                  ${
                    /* La TVA que contient le prix. Le client recevait un montant
                       TTC sans jamais savoir quelle taxe il y avait dedans :
                       l'email ne valait pas justificatif. */
                    Number(order.taxAmount) > 0
                      ? `<div class="detail-row">
                          <strong>Total HT:</strong>
                          <span>€${(Number(order.totalAmount) - Number(order.taxAmount)).toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                          <strong>dont TVA${
                            Number(order.taxRate) > 0 ? ` ${Number(order.taxRate)} %` : ''
                          }:</strong>
                          <span>€${Number(order.taxAmount).toFixed(2)}</span>
                        </div>`
                      : ''
                  }
                </div>

                <p>Statut : <strong>en attente de confirmation du restaurant</strong></p>
              </div>

              <div style="text-align: center;">
                <a href="${EMAIL_CONFIG.siteUrl}/track?commande=${order.id}" class="button">
                  Voir ma commande
                </a>
              </div>

              <div class="footer">
                <p>Maison Tamara | ${EMAIL_CONFIG.siteUrl}</p>
                <p>Cet email a été envoyé à ${order.customerEmail}</p>
              </div>
            </div>
          </body>
        </html>
      `;

      return this.sendEmail({
        to: order.customerEmail,
        subject: `Commande reçue #${order.id.slice(0, 8)} — en attente de confirmation`,
        html,
      });
    } catch (err) {
      logger.error("Order confirmation email failed", { error: err });
      throw err;
    }
  }

  /**
   * Suivi de commande : acceptée, refusée, prête.
   *
   * Le client invité n'a pas de compte : sans cet e-mail, il n'apprenait ni que
   * sa commande était acceptée, ni qu'elle était annulée.
   */
  static async sendOrderStatusUpdate(
    order: { id: string; customerName: string; customerEmail: string; totalAmount: unknown },
    contenu: { titre: string; message: string }
  ) {
    const echappe = (texte: string) =>
      texte.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

    const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #2d3748; color: white; padding: 20px; border-radius: 5px; }
              .content { padding: 20px; background-color: #f7fafc; margin: 20px 0; border-radius: 5px; }
              .button { display: inline-block; background-color: #48bb78; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; color: #718096; font-size: 12px; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${echappe(contenu.titre)}</h1>
              </div>
              <div class="content">
                <p>Bonjour ${echappe(order.customerName)},</p>
                <p>${echappe(contenu.message)}</p>
                <p><strong>Commande :</strong> ${order.id.slice(0, 12).toUpperCase()}</p>
                <p><strong>Montant :</strong> €${Number(order.totalAmount).toFixed(2)}</p>
              </div>
              <div style="text-align: center;">
                <a href="${EMAIL_CONFIG.siteUrl}/track?commande=${order.id}" class="button">
                  Voir ma commande
                </a>
              </div>
              <div class="footer">
                <p>Maison Tamara | ${EMAIL_CONFIG.siteUrl}</p>
              </div>
            </div>
          </body>
        </html>
      `;

    return this.sendEmail({
      to: order.customerEmail,
      subject: `${contenu.titre} — commande #${order.id.slice(0, 8)}`,
      html,
    });
  }

  /**
   * Gabarit commun aux courriels de compte.
   *
   * Ces messages n'ont qu'un rôle : mener à un lien. Tout le reste — détails,
   * offres, mises en page — dilue ce rôle et fait ressembler le message à du
   * hameçonnage.
   */
  private static gabaritAction(options: {
    titre: string;
    corps: string;
    libelleBouton: string;
    lien: string;
    apres: string;
  }) {
    return `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2d3748; color: white; padding: 20px; border-radius: 5px; }
            .content { padding: 20px; background-color: #f7fafc; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; background-color: #dd6b20; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .lien-brut { word-break: break-all; color: #718096; font-size: 12px; }
            .footer { text-align: center; color: #718096; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>${options.titre}</h1></div>

            <div class="content">
              ${options.corps}

              <div style="text-align: center;">
                <a href="${options.lien}" class="button">${options.libelleBouton}</a>
              </div>

              <p class="lien-brut">
                Si le bouton ne fonctionne pas, copiez cette adresse dans votre
                navigateur :<br>${options.lien}
              </p>

              <p>${options.apres}</p>
            </div>

            <div class="footer"><p>${EMAIL_CONFIG.siteUrl}</p></div>
          </div>
        </body>
      </html>
    `;
  }

  /** Lien de réinitialisation de mot de passe. */
  static async sendPasswordReset(email: string, nom: string | null, lien: string) {
    return this.sendEmail({
      to: email,
      subject: "Réinitialiser votre mot de passe",
      html: this.gabaritAction({
        titre: "🔑 Nouveau mot de passe",
        corps: `
          <p>Bonjour${nom ? ` ${nom}` : ""},</p>
          <p>Vous avez demandé à changer le mot de passe de votre compte.
             Ce lien est valable une heure et ne fonctionne qu'une fois.</p>
        `,
        libelleBouton: "Choisir un nouveau mot de passe",
        lien,
        apres:
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : " +
          "votre mot de passe actuel reste valable et personne n'a été prévenu que " +
          "vous possédez cette adresse.",
      }),
      text:
        `Bonjour${nom ? ` ${nom}` : ""},\n\n` +
        `Pour changer votre mot de passe, ouvrez ce lien dans l'heure : ${lien}\n\n` +
        `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    });
  }

  /** Lien de confirmation d'adresse. */
  static async sendEmailVerification(email: string, nom: string | null, lien: string) {
    return this.sendEmail({
      to: email,
      subject: "Confirmez votre adresse e-mail",
      html: this.gabaritAction({
        titre: "✉️ Confirmez votre adresse",
        corps: `
          <p>Bonjour${nom ? ` ${nom}` : ""},</p>
          <p>Confirmez cette adresse pour que nous puissions vous joindre :
             commandes, réinitialisation de mot de passe, alertes importantes.
             Ce lien est valable 24 heures.</p>
        `,
        libelleBouton: "Confirmer mon adresse",
        lien,
        apres:
          "Si vous n'avez pas créé de compte chez nous, ignorez ce message : " +
          "aucun compte ne sera activé avec cette adresse.",
      }),
      text:
        `Bonjour${nom ? ` ${nom}` : ""},\n\n` +
        `Confirmez votre adresse en ouvrant ce lien sous 24 heures : ${lien}\n\n` +
        `Si vous n'avez pas créé de compte, ignorez ce message.`,
    });
  }
}