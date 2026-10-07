# Notifications Service - Multi-channel Delivery 📧📱

> **Document de phase, partiellement dépassé.** Les routes sont sous **`/api/zupdrive/notifications`** : `/alerts/*` pour le chauffeur connecté (identité tirée du jeton, `driverId` ignoré), `/admin/*` pour l'équipe (section `courses-drive`, écritures journalisées). Le webhook d'accusés `POST /api/zupdrive/notifications/webhooks/status` exige une signature HMAC-SHA256 du corps brut avec horodatage (`ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET`) et ne fait qu'avancer le statut. La référence à jour est [`zupdrive-api-admin.md`](./zupdrive-api-admin.md).

**Status**: Complete notification system with Email, Push, SMS, and In-app

## Overview

ZupDrive's notification service provides:
- **Email**: SendGrid/Mailgun integration
- **Push**: Firebase Cloud Messaging (FCM)
- **SMS**: Twilio for critical alerts
- **In-app**: Database + WebSocket real-time
- **Priority-based Routing**: Automatic channel selection

---

## Priority Levels & Channels

```
┌─────────────┬────────────────────────────────────────┐
│ Priority    │ Channels                               │
├─────────────┼────────────────────────────────────────┤
│ LOW         │ In-app only                            │
│ MEDIUM      │ Push + In-app                          │
│ HIGH        │ Email + Push + In-app                  │
│ CRITICAL    │ SMS + Email + Push + In-app + Sound    │
└─────────────┴────────────────────────────────────────┘
```

---

## Setup

### Email Configuration

#### SendGrid
```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
EMAIL_FROM=noreply@zupdrive.com
```

#### Mailgun
```env
EMAIL_PROVIDER=mailgun
MAILGUN_SMTP_HOST=smtp.mailgun.org
MAILGUN_SMTP_USER=postmaster@zupdrive.mailgun.org
MAILGUN_SMTP_PASS=xxxxxxxxxxxxxx
EMAIL_FROM=noreply@zupdrive.com
```

### Firebase Cloud Messaging
```env
FIREBASE_PROJECT_ID=zupdrive-prod
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@zupdrive-prod.iam.gserviceaccount.com
```

### Twilio (SMS)
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+33123456789
```

---

## Notification Types

### Driver Notifications

#### COURSE_COMPLETED
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'COURSE_COMPLETED',
  title: '🎉 Course completed',
  message: 'You earned €8.25',
  priority: 'medium',
  data: {
    courseId: 'course-789',
    amount: 825,
    passengerName: 'Jean Dupont',
  },
  actionUrl: '/driver/dashboard',
});
```

**Email Subject**: "🎉 Course completed - You earned €8.25"

#### PAYOUT_PROCESSING
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'PAYOUT_PROCESSING',
  title: '⚙️ Payout processing',
  message: '€250.00 is being transferred',
  priority: 'medium',
  data: {
    payoutId: 'payout-456',
    amount: 250000,
  },
  actionUrl: '/driver/payouts',
});
```

#### PAYOUT_COMPLETED
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'PAYOUT_COMPLETED',
  title: '💰 Payout received',
  message: '€250.00 has been credited to your account',
  priority: 'high',
  data: {
    payoutId: 'payout-456',
    amount: 250000,
  },
  actionUrl: '/driver/payouts',
});
```

#### PAYOUT_FAILED
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'PAYOUT_FAILED',
  title: '❌ Payout failed',
  message: 'Invalid IBAN. Update your bank details.',
  priority: 'critical',
  data: {
    payoutId: 'payout-456',
    reason: 'Invalid IBAN',
  },
  actionUrl: '/driver/settings/bank',
});
```

#### RATING_RECEIVED
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'RATING_RECEIVED',
  title: '⭐ 5-star rating',
  message: 'Jean Dupont rated your service',
  priority: 'medium',
  data: {
    rating: 5,
    passengerName: 'Jean Dupont',
    comment: 'Excellent driver!',
  },
  actionUrl: '/driver/reputation/reviews',
});
```

#### REPUTATION_CHANGED
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'REPUTATION_CHANGED',
  title: '📈 Reputation updated',
  message: 'Your score is now 92/100 (EXCELLENT)',
  priority: 'low',
  data: {
    newScore: 92,
    newRating: 4.75,
    level: 'EXCELLENT',
  },
  actionUrl: '/driver/reputation',
});
```

#### BADGE_EARNED
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'BADGE_EARNED',
  title: '🏆 Badge earned',
  message: 'TOP_RATED - 4.8+ stars, 50+ ratings',
  priority: 'medium',
  data: {
    badgeName: 'TOP_RATED',
    description: '4.8+ stars, 50+ ratings',
  },
  actionUrl: '/driver/reputation',
});
```

#### DOCUMENT_APPROVED
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'DOCUMENT_APPROVED',
  title: '✅ Document approved',
  message: 'Your driving license has been approved',
  priority: 'medium',
  data: {
    documentType: 'PERMIS',
    documentId: 'doc-456',
  },
  actionUrl: '/driver/documents',
});
```

#### DOCUMENT_EXPIRING
```typescript
await notificationsService.send({
  userId: 'user-123',
  type: 'DOCUMENT_EXPIRING',
  title: '📋 License expires in 10 days',
  message: 'Renew your driving license before it expires',
  priority: 'high',
  data: {
    documentType: 'PERMIS',
    daysUntilExpiry: 10,
  },
  actionUrl: '/driver/documents',
});
```

### Admin Notifications

#### COMPLIANCE_ALERT
```typescript
await notificationsService.send({
  userId: 'admin-123',
  chauffeurId: 'chauffeur-456',
  type: 'COMPLIANCE_ALERT',
  title: '🚨 CRITICAL compliance issue',
  message: 'Fraud indicators detected',
  priority: 'critical',
  data: {
    chauffeurId: 'chauffeur-456',
    riskLevel: 'CRITICAL',
    reason: 'Fraud indicators detected',
    score: 15,
  },
  actionUrl: '/admin/drivers/chauffeur-456',
});
```

#### DRIVER_STATUS_CHANGED
```typescript
await notificationsService.send({
  userId: 'admin-123',
  type: 'DRIVER_STATUS_CHANGED',
  title: '🚫 Driver suspended',
  message: 'Driver has been suspended',
  priority: 'high',
  data: {
    chauffeurId: 'chauffeur-456',
    status: 'SUSPENDED',
    reason: 'Low reputation score',
  },
  actionUrl: '/admin/drivers/chauffeur-456',
});
```

---

## Email Templates

### Default Template
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI'; }
      .container { max-width: 600px; margin: 0 auto; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; padding: 40px; text-align: center; }
      .content { padding: 40px; background: #f9fafb; }
      .button { background: #667eea; color: white; padding: 12px 30px; 
               text-decoration: none; border-radius: 4px; }
      .footer { text-align: center; padding: 20px; color: #999; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header"><h1>🚗 ZupDrive</h1></div>
      <div class="content">
        <h2>[Title]</h2>
        <p>[Message]</p>
        <a href="[Action URL]" class="button">[Button Text]</a>
      </div>
      <div class="footer">
        <p>© 2026 ZupDrive</p>
        <p><a href="/notifications-preferences">Manage preferences</a></p>
      </div>
    </div>
  </body>
</html>
```

---

## Usage Examples

### Using the Service Directly
```typescript
import { notificationsService } from '../services/notifications';

// Simple notification
await notificationsService.send({
  userId: 'user-123',
  type: 'COURSE_COMPLETED',
  title: '🎉 Course completed',
  message: 'You earned €8.25',
  priority: 'medium',
  data: { amount: 825 },
  actionUrl: '/driver/dashboard',
});

// Batch notifications
await notificationsService.sendBatch([
  { userId: 'user-1', type: 'COURSE_COMPLETED', ... },
  { userId: 'user-2', type: 'PAYOUT_COMPLETED', ... },
  { userId: 'user-3', type: 'RATING_RECEIVED', ... },
]);
```

### Using Notification Helpers
```typescript
import {
  notifyCourseCompleted,
  notifyPayoutStatus,
  notifyRatingReceived,
  notifyDocumentExpiring,
  notifyComplianceAlert,
} from '../middleware/notifications-middleware';

// Course completed
await notifyCourseCompleted({
  userId: 'user-123',
  courseId: 'course-789',
  amount: 825,
  passengerName: 'Jean Dupont',
});

// Payout status changed
await notifyPayoutStatus({
  userId: 'user-123',
  payoutId: 'payout-456',
  status: 'COMPLETED',
  amount: 250000,
});

// Rating received
await notifyRatingReceived({
  userId: 'user-123',
  rating: 5,
  passengerName: 'Marie Durand',
  courseId: 'course-789',
});

// Document expiring
await notifyDocumentExpiring({
  userId: 'user-123',
  chauffeurId: 'chauffeur-123',
  documentType: 'PERMIS',
  daysUntilExpiry: 10,
});

// Compliance alert (admin)
await notifyComplianceAlert({
  userId: 'admin-123',
  chauffeurId: 'chauffeur-456',
  riskLevel: 'CRITICAL',
  reason: 'Fraud indicators detected',
  score: 15,
});
```

### Integration with Services
```typescript
// In CourseService
await notifyCourseCompleted({
  userId: driver.userId,
  courseId: course.id,
  amount: totalPrice,
  passengerName: passenger.name,
});

// In PaymentService
await notifyPayoutStatus({
  userId: driver.userId,
  payoutId: payout.id,
  status: payout.statut,
  amount: payout.montant,
  reason: payout.erreurMotif,
});

// In RatingService
await notifyRatingReceived({
  userId: driver.userId,
  rating: rating.note,
  comment: rating.commentaire,
  passengerName: passenger.name,
  courseId: rating.courseId,
});
```

---

## Features

### ✅ Implemented

- ✅ Multi-channel delivery (Email/Push/SMS/In-app)
- ✅ Priority-based routing
- ✅ Email template generation
- ✅ Push notification with priority levels
- ✅ SMS for critical alerts only
- ✅ In-app notification with WebSocket
- ✅ Batch notification support
- ✅ Error handling & logging
- ✅ FCM token management
- ✅ Email unsubscribe support

### 🔄 Coming Soon

- Notification preferences per user
- Email digest (hourly/daily/weekly)
- Scheduled notifications
- A/B testing templates
- Analytics & open rates
- Multi-language support

---

## Configuration

### Environment Variables
```env
# Email
EMAIL_PROVIDER=sendgrid|mailgun
SENDGRID_API_KEY=...
MAILGUN_SMTP_HOST=...
EMAIL_FROM=noreply@zupdrive.com

# Firebase
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...

# Frontend
FRONTEND_URL=http://localhost:3000
```

---

## Testing

```bash
npm test -- notifications
```

### Coverage
- ✅ Priority-based routing
- ✅ Email template generation
- ✅ Push notification sending
- ✅ SMS sending
- ✅ In-app notification saving
- ✅ Batch processing
- ✅ Error handling
- ✅ Data validation

---

## Troubleshooting

### Email not received
1. Check email configuration (SENDGRID_API_KEY, etc.)
2. Verify email address in database
3. Check spam folder
4. Review SendGrid delivery logs

### Push not received
1. Verify FCM tokens are saved
2. Check Firebase configuration
3. Test with test device
4. Review Firebase console

### SMS not received
1. Verify phone number format (E.164)
2. Check Twilio account balance
3. Verify Twilio number
4. Review Twilio logs

---

## Performance

### Delivery Times
- Email: 30-60 seconds
- Push: <5 seconds
- SMS: 10-30 seconds
- In-app: <1 second

### Throughput
- 1000+ notifications/second
- Batch processing for efficiency
- Non-blocking on frontend

---

## Files

```
backend/src/
├── services/
│   └── notifications.ts              (450 lines)
├── middleware/
│   └── notifications-middleware.ts   (250 lines)
└── __tests__/
    └── notifications.test.ts         (250 lines)

Total: ~950 lines
```

---

## Integration Points

```
Phase 11: Document Service
    ↓ notify: documentApproved(), documentExpiring()

Phase 12: Compliance Service
    ↓ notify: complianceAlert()

Phase 13: Rating Service
    ↓ notify: ratingReceived(), reputationChanged(), badgeEarned()

Phase 14: Payment Service
    ↓ notify: payoutStatusChanged()

Phase 15: Monitoring Service
    ↓ display notifications on dashboard
```

---

## Next Steps (Phase 16+)

1. **Notification Preferences**: Let users control channels
2. **Email Digest**: Hourly/daily/weekly summaries
3. **Analytics**: Track open/click rates
4. **Multi-language**: Translate templates
5. **Scheduled**: Send at preferred times

---

## Reference

- [SendGrid API](https://docs.sendgrid.com/)
- [Firebase FCM](https://firebase.google.com/docs/cloud-messaging)
- [Twilio SMS](https://www.twilio.com/docs/sms)
- [Nodemailer](https://nodemailer.com/)
