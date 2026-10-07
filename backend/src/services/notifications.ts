/**
 * Notifications Service
 *
 * Multi-channel notification delivery:
 * - Email (SendGrid/Mailgun)
 * - Push (Firebase Cloud Messaging)
 * - SMS (Twilio - critical only)
 * - In-app (database + WebSocket)
 *
 * Priority-based routing:
 * - LOW: In-app only
 * - MEDIUM: Push + In-app
 * - HIGH: Email + Push + In-app
 * - CRITICAL: SMS + Email + Push + In-app
 */

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
export type NotificationChannel = 'email' | 'push' | 'sms' | 'inapp';

export interface NotificationPayload {
  userId: string;
  chauffeurId?: string;
  type: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  channels?: NotificationChannel[];
  data?: Record<string, unknown>;
  actionUrl?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

interface EmailTemplate {
  subject: string;
  html: string;
}

class NotificationsService {
  constructor() {
    this.initializeEmailTransporter();
    this.initializeFirebase();
    this.initializeTwilio();
  }

  /**
   * Initialiser le transporter email
   */
  private initializeEmailTransporter() {
    // TODO: Configure avec SendGrid ou Mailgun
    // Pour développement: Ethereal (test email)
    if (process.env.EMAIL_PROVIDER === 'sendgrid') {
      // this.emailTransporter = nodemailer.createTransport({
      //   host: 'smtp.sendgrid.net',
      //   port: 587,
      //   auth: {
      //     user: 'apikey',
      //     pass: process.env.SENDGRID_API_KEY,
      //   },
      // });
    } else if (process.env.EMAIL_PROVIDER === 'mailgun') {
      // this.emailTransporter = nodemailer.createTransport({
      //   host: process.env.MAILGUN_SMTP_HOST,
      //   port: 587,
      //   auth: {
      //     user: process.env.MAILGUN_SMTP_USER,
      //     pass: process.env.MAILGUN_SMTP_PASS,
      //   },
      // });
    } else {
      // Development: Log to console
      console.log('[Email] Using console transport (development)');
    }
  }

  /**
   * Initialiser Firebase Cloud Messaging
   */
  private initializeFirebase() {
    // TODO: Initialize Firebase Admin SDK
    // import admin from 'firebase-admin';
    // admin.initializeApp({
    //   credential: admin.credential.cert(serviceAccountKey),
    // });
    // this.firebaseAdmin = admin;
    console.log('[Firebase] Using mock transport (development)');
  }

  /**
   * Initialiser Twilio pour SMS
   */
  private initializeTwilio() {
    // TODO: Initialize Twilio client
    // const twilio = require('twilio');
    // this.twilioClient = twilio(
    //   process.env.TWILIO_ACCOUNT_SID,
    //   process.env.TWILIO_AUTH_TOKEN
    // );
    console.log('[Twilio] Using mock transport (development)');
  }

  /**
   * Envoyer une notification multi-canal
   */
  async send(payload: NotificationPayload): Promise<void> {
    const channels = this.getChannelsForPriority(payload.priority);

    console.log(`[Notifications] Sending ${payload.type} to ${payload.userId} (${payload.priority})`);

    try {
      // En-app notification toujours
      await this.sendInAppNotification(payload);

      // Channels basés sur la priorité
      if (channels.includes('push') && payload.priority !== 'low') {
        await this.sendPushNotification(payload).catch(err =>
          console.error('[Push] Error:', err.message)
        );
      }

      if (channels.includes('email') && payload.priority !== 'low') {
        await this.sendEmailNotification(payload).catch(err =>
          console.error('[Email] Error:', err.message)
        );
      }

      if (channels.includes('sms') && payload.priority === 'critical') {
        await this.sendSMSNotification(payload).catch(err =>
          console.error('[SMS] Error:', err.message)
        );
      }
    } catch (error) {
      console.error('[Notifications] Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Déterminer les channels basés sur la priorité
   */
  private getChannelsForPriority(priority: NotificationPriority): NotificationChannel[] {
    switch (priority) {
      case 'critical':
        return ['sms', 'email', 'push', 'inapp'];
      case 'high':
        return ['email', 'push', 'inapp'];
      case 'medium':
        return ['push', 'inapp'];
      case 'low':
      default:
        return ['inapp'];
    }
  }

  /**
   * Envoyer une notification en-app
   */
  private async sendInAppNotification(payload: NotificationPayload): Promise<void> {
    // TODO: Sauvegarder en base de données
    // await db.notificationDrive.create({
    //   data: {
    //     userId: payload.userId,
    //     chauffeurId: payload.chauffeurId,
    //     type: payload.type,
    //     title: payload.title,
    //     message: payload.message,
    //     priority: payload.priority,
    //     data: payload.data,
    //     actionUrl: payload.actionUrl,
    //     read: false,
    //   },
    // });

    console.log(`[In-app] ${payload.title}: ${payload.message}`);
  }

  /**
   * Envoyer une push notification
   */
  private async sendPushNotification(payload: NotificationPayload): Promise<void> {
    // TODO: Récupérer les tokens FCM de l'utilisateur
    // const user = await db.user.findUnique({
    //   where: { id: payload.userId },
    //   select: { fcmTokens: true },
    // });

    // if (!user?.fcmTokens?.length) {
    //   console.log('[Push] No FCM tokens for user');
    //   return;
    // }

    // TODO: Envoyer via Firebase Cloud Messaging
    // await Promise.all(
    //   user.fcmTokens.map(token =>
    //     this.firebaseAdmin.messaging().send({
    //       token,
    //       notification: {
    //         title: payload.title,
    //         body: payload.message,
    //       },
    //       data: {
    //         type: payload.type,
    //         ...payload.data,
    //       },
    //       android: {
    //         priority: this.getPushPriority(payload.priority),
    //       },
    //       apns: {
    //         headers: {
    //           'apns-priority': this.getAPNSPriority(payload.priority),
    //         },
    //       },
    //     })
    //   )
    // );

    console.log(`[Push] Sent to ${payload.userId}: ${payload.title}`);
  }

  /**
   * Envoyer un email
   */
  private async sendEmailNotification(payload: NotificationPayload): Promise<void> {
    // TODO: Récupérer l'adresse email de l'utilisateur
    // const user = await db.user.findUnique({
    //   where: { id: payload.userId },
    //   select: { email: true, language: true },
    // });

    // if (!user?.email) {
    //   console.log('[Email] No email address for user');
    //   return;
    // }

    // Générer le template
    const template = this.getEmailTemplate(payload);

    // TODO: Envoyer via SendGrid/Mailgun
    // if (this.emailTransporter) {
    //   await this.emailTransporter.sendMail({
    //     from: process.env.EMAIL_FROM || 'noreply@zupdrive.com',
    //     to: user.email,
    //     subject: template.subject,
    //     html: template.html,
    //     text: this.stripHTML(template.html),
    //   });
    // }

    console.log(`[Email] Sent to ${payload.userId}: ${template.subject}`);
  }

  /**
   * Envoyer un SMS (critiques seulement)
   */
  private async sendSMSNotification(payload: NotificationPayload): Promise<void> {
    // TODO: Récupérer le numéro de téléphone
    // const user = await db.user.findUnique({
    //   where: { id: payload.userId },
    //   select: { phoneNumber: true },
    // });

    // if (!user?.phoneNumber) {
    //   console.log('[SMS] No phone number for user');
    //   return;
    // }

    // TODO: Envoyer via Twilio
    // await this.twilioClient.messages.create({
    //   body: `[ALERTE ZUPDRIVE] ${payload.message}`,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: user.phoneNumber,
    // });

    console.log(`[SMS] Sent critical alert: ${payload.message}`);
  }

  /**
   * Obtenir le template d'email
   */
  private getEmailTemplate(payload: NotificationPayload): EmailTemplate {
    const baseURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const actionLink = payload.actionUrl ? `${baseURL}${payload.actionUrl}` : null;

    const templates: Record<string, (p: NotificationPayload) => EmailTemplate> = {
      COURSE_COMPLETED: (p) => ({
        subject: '🎉 Course completed - You earned €' + (p.data?.amount || 'X'),
        html: this.emailTemplate(
          'Course Completed',
          `You completed a course and earned €${(Number(p.data?.amount) / 100).toFixed(2)}`,
          'View Earnings',
          `${baseURL}/driver/dashboard`
        ),
      }),
      PAYOUT_COMPLETED: (p) => ({
        subject: '💰 Payout received - €' + (p.data?.amount || 'X'),
        html: this.emailTemplate(
          'Payout Completed',
          `€${(Number(p.data?.amount) / 100).toFixed(2)} has been transferred to your bank account`,
          'View Payouts',
          `${baseURL}/driver/payouts`
        ),
      }),
      PAYOUT_FAILED: (p) => ({
        subject: '❌ Payout failed - Action required',
        html: this.emailTemplate(
          'Payout Failed',
          `Your payout failed: ${p.data?.reason || 'Unknown error'}. Please update your bank details.`,
          'Fix Bank Details',
          `${baseURL}/driver/settings/bank`
        ),
      }),
      RATING_RECEIVED: (p) => ({
        subject: '⭐ New rating - ' + p.data?.rating + '/5 stars',
        html: this.emailTemplate(
          'Rating Received',
          `You received a ${p.data?.rating}-star rating: "${p.data?.comment || ''}"`,
          'View Reviews',
          `${baseURL}/driver/reputation/reviews`
        ),
      }),
      COMPLIANCE_ALERT: (p) => ({
        subject: '⚠️ Compliance Alert - Action Required',
        html: this.emailTemplate(
          'Compliance Alert',
          `${p.data?.reason || 'A compliance issue was detected on your account'}. Risk Level: ${p.data?.riskLevel}`,
          'Review Account',
          `${baseURL}/admin/drivers/${p.chauffeurId}`
        ),
      }),
      DOCUMENT_EXPIRING: (p) => ({
        subject: '📋 Document expiring - ' + p.data?.daysUntilExpiry + ' days left',
        html: this.emailTemplate(
          'Document Expiring',
          `Your ${p.data?.documentType} expires in ${p.data?.daysUntilExpiry} days. Renew it now.`,
          'Renew Document',
          `${baseURL}/driver/documents`
        ),
      }),
    };

    const template = templates[payload.type];
    if (!template) {
      return {
        subject: payload.title,
        html: this.emailTemplate(payload.title, payload.message, 'View More', actionLink || baseURL),
      };
    }

    return template(payload);
  }

  /**
   * Template HTML d'email générique
   */
  private emailTemplate(title: string, message: string, buttonText: string, buttonLink: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 40px 20px; background: #f9fafb; }
            .message { font-size: 16px; line-height: 1.6; margin: 20px 0; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🚗 ZupDrive</h1>
            </div>
            <div class="content">
              <h2>${title}</h2>
              <div class="message">${message}</div>
              <a href="${buttonLink}" class="button">${buttonText}</a>
            </div>
            <div class="footer">
              <p>© 2026 ZupDrive. All rights reserved.</p>
              <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/notifications-preferences">Manage your preferences</a></p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Envoyer une notification par lot
   */
  async sendBatch(payloads: NotificationPayload[]): Promise<void> {
    console.log(`[Notifications] Sending ${payloads.length} notifications in batch`);
    await Promise.all(payloads.map(p => this.send(p)));
  }
}

// Export singleton
export const notificationsService = new NotificationsService();

export default NotificationsService;

/**
 * USAGE EXAMPLES
 *
 * // Course completed
 * await notificationsService.send({
 *   userId: 'user-123',
 *   type: 'COURSE_COMPLETED',
 *   title: '🎉 Course completed',
 *   message: 'You earned €8.25',
 *   priority: 'medium',
 *   data: { amount: 825, courseId: 'course-789' },
 *   actionUrl: '/driver/dashboard',
 * });
 *
 * // Critical alert
 * await notificationsService.send({
 *   userId: 'user-123',
 *   chauffeurId: 'chauffeur-123',
 *   type: 'COMPLIANCE_ALERT',
 *   title: '🚨 Critical compliance issue',
 *   message: 'Fraud indicators detected',
 *   priority: 'critical',
 *   data: { riskLevel: 'CRITICAL', score: 15 },
 * });
 *
 * // Batch
 * await notificationsService.sendBatch([
 *   { userId: 'user-1', type: 'COURSE_COMPLETED', ... },
 *   { userId: 'user-2', type: 'PAYOUT_COMPLETED', ... },
 * ]);
 */
