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
                <h1>✅ Commande confirmée!</h1>
              </div>

              <div class="content">
                <p>Bonjour ${order.customerName},</p>
                <p>Merci pour votre commande! Voici les détails:</p>

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
                    <strong>Montant total:</strong>
                    <span style="font-size: 18px; color: #48bb78;">€${order.totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                <p>Statut: <strong>${order.status}</strong></p>
                <p>Nous vous enverrons une notification dès que votre commande sera prête!</p>
              </div>

              <div style="text-align: center;">
                <a href="${EMAIL_CONFIG.siteUrl}/order-confirmation?orderId=${order.id}" class="button">
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
        subject: `Commande confirmée #${order.id.slice(0, 8)}`,
        html,
      });
    } catch (err) {
      logger.error("Order confirmation email failed", { error: err });
      throw err;
    }
  }

  // Order status update email
  static async sendOrderStatusUpdate(order: any, newStatus: string) {
    try {
      const statusMessages = {
        ACCEPTED: "Votre commande a été acceptée et est en préparation!",
        READY: "Votre commande est prête! Vous pouvez la retirer.",
        COMPLETED: "Merci pour votre achat! À bientôt.",
      };

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
              .status-badge { display: inline-block; background-color: #48bb78; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
              .footer { text-align: center; color: #718096; font-size: 12px; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📦 Mise à jour de votre commande</h1>
              </div>

              <div class="content">
                <p>Bonjour ${order.customerName},</p>
                <p>${statusMessages[newStatus as keyof typeof statusMessages] || `Statut: ${newStatus}`}</p>

                <div style="margin: 20px 0;">
                  <p><strong>Commande:</strong> ${order.id.slice(0, 12).toUpperCase()}</p>
                  <p><strong>Nouveau statut:</strong> <span class="status-badge">${newStatus}</span></p>
                </div>

                <p>Montant: <strong>€${order.totalAmount.toFixed(2)}</strong></p>
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
        subject: `Commande #${order.id.slice(0, 8)} - ${newStatus}`,
        html,
      });
    } catch (err) {
      logger.error("Order status email failed", { error: err });
      throw err;
    }
  }
}