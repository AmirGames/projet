# Phase 15: Real-time Monitoring & Alerts 📊🔔

## Supervision des remboursements ZupEat — A03 (9 octobre 2026)

Les commandes payées après refus/abandon portent désormais une intention durable
avant acquittement. Le worker réconcilie Stripe avec une clé persistante ; une
création pending reste distincte d'une restitution réussie. La Vigie expose une
alerte critique `metier:remboursements-a-reprendre`, y compris sans ID Stripe,
avec revue et reprise autorisées/auditées par la permission billing.

Voir le [guide actuel de comportement, API, migration et exploitation](REMBOURSEMENTS-REPRISE.md)
et les [preuves datées](preuves-a03-2026-10-09.md). Les sections de phase ci-dessous
restent historiques ; elles ne prouvent ni intégration ni déploiement d'A03.


> **Document de phase, partiellement dépassé.** Les routes chauffeur (`/notifications`, `/metrics`, `/earnings-realtime`) sont bien sous `/api/zupdrive`. **`GET /ws` n'existe plus** (il renvoyait le jeton dans une URL) : le temps réel passe par Socket.IO. Les routes `/admin/*` demandent la permission d'équipe (sections `courses-drive` ou `chauffeurs`), pas le rôle `ADMIN_ZUPDRIVE`, et passent d'abord par le garde de `/api/zupdrive/admin` : superowner seul en pratique. Les gains sont calculés avec la règle de commission commune (`repartirPrixCourse`). La référence à jour est [`zupdrive-api-admin.md`](./zupdrive-api-admin.md).

**Status**: Real-time notifications, driver metrics, admin alerts, platform health monitoring

## Overview

ZupDrive's monitoring system delivers:
- **Real-time Notifications**: Push, Email, WebSocket
- **Driver Dashboards**: Live earnings, metrics, status
- **Admin Alerts**: Compliance issues, at-risk drivers, payout failures
- **Platform Health**: System-wide metrics and KPIs

---

## Notification System

### Types

```
DRIVER NOTIFICATIONS
├─ COURSE_COMPLETED       → "Course completed +€8.25"
├─ EARNINGS_UPDATED       → "Your earnings: €125.50 this week"
├─ PAYOUT_REQUESTED       → "Payout requested: €250.00"
├─ PAYOUT_PROCESSING      → "Your payout is being processed"
├─ PAYOUT_COMPLETED       → "€250.00 received in your account!"
├─ PAYOUT_FAILED          → "Payout failed. Update bank details."
├─ RATING_RECEIVED        → "⭐ 5-star rating from passenger"
├─ REPUTATION_CHANGED     → "Your rating changed to 4.8/5"
├─ BADGE_EARNED           → "🏆 TOP_RATED badge earned!"
├─ DOCUMENT_APPROVED      → "✅ Your license was approved"
├─ DOCUMENT_REJECTED      → "❌ Document rejected. Reupload."
├─ DOCUMENT_EXPIRING      → "📋 Your license expires in 10 days"
├─ COMPLIANCE_WARNING     → "⚠️ Low rating alert"
├─ INCENTIVE_AVAILABLE    → "💰 New bonus program available"
└─ SUSPENSION_WARNING     → "🚨 Risk of account suspension"

ADMIN NOTIFICATIONS
├─ ADMIN_ALERT            → "Critical compliance issue"
└─ SUSPICIOUS_PATTERN     → "Potential fraud detected"
```

### Priority Levels

```
Priority: LOW
├─ Channels: WebSocket only
├─ Examples: Minor earnings update, newsletter
└─ Frequency: Daily digest possible

Priority: MEDIUM
├─ Channels: Push + WebSocket
├─ Examples: New rating, document status, payout update
├─ Badge: Unread count on app icon
└─ Frequency: Real-time

Priority: HIGH
├─ Channels: Push + Email + WebSocket
├─ Examples: Payout failed, document expiring soon, low rating
├─ Badge: Red notification badge
└─ Frequency: Immediate

Priority: CRITICAL
├─ Channels: Push + Email + SMS + WebSocket
├─ Examples: Account suspended, fraud detected, emergency
├─ Badge: Red alert + sound
└─ Frequency: Immediate (retry if delivery fails)
```

---

## API Endpoints

### Driver Endpoints

#### Get Unread Notifications

```
GET /api/zupdrive/notifications?limit=20
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "notifications": [
    {
      "id": "notif-1",
      "type": "PAYOUT_COMPLETED",
      "titre": "€250.00 received",
      "message": "Your weekly payout arrived in your account",
      "priorite": "high",
      "donnees": {
        "amount": 250000,
        "date": "2026-10-17"
      },
      "lue": false,
      "createdAt": "2026-10-17T08:30:00Z",
      "urlAction": "/payouts/payout-789"
    },
    // ... more notifications
  ],
  "stats": {
    "total": 45,
    "unread": 3,
    "byType": [
      { "type": "COURSE_COMPLETED", "count": 20 },
      { "type": "PAYOUT_COMPLETED", "count": 15 },
      { "type": "RATING_RECEIVED", "count": 10 }
    ]
  }
}
```

---

#### Mark Notification as Read

```
POST /api/zupdrive/notifications/:id/read
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "message": "Notification marked as read"
}
```

---

#### Mark All as Read

```
POST /api/zupdrive/notifications/mark-all-read
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "message": "All notifications marked as read",
  "count": 5
}
```

---

#### Get Driver Metrics Dashboard

```
GET /api/zupdrive/metrics
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "metrics": {
    "chauffeurId": "chauffeur-123",
    "reputationScore": 4.75,
    "earningsToday": 8500,           // cents
    "earningsWeek": 215000,          // €2150
    "completionRate": 98,            // %
    "cancellationRate": 1,           // %
    "averageRating": 4.75,
    "coursesCompleted": 45,
    "pendingPayout": 215000,         // Next payout €2150
    "documentStatus": "COMPLETE",    // COMPLETE | PENDING | ISSUES
    "complianceScore": 92,           // 0-100
    "badges": [
      "TOP_RATED",
      "PROFESSIONAL",
      "CONSISTENT"
    ],
    "status": "ACTIVE"               // ACTIVE | WARNING | SUSPENDED | INACTIVE
  }
}
```

---

#### Get Real-time Earnings

```
GET /api/zupdrive/earnings-realtime
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "earnings": {
    "today": {
      "amount": 8500,    // cents
      "courses": 2
    },
    "week": {
      "amount": 215000,  // cents
      "courses": 45
    },
    "timestamp": "2026-10-17T15:30:00Z"
  }
}
```

---

#### WebSocket Connection

```
GET /api/zupdrive/ws?token={driverToken}

Response:
{
  "wsUrl": "wss://api.zupdrive.com/api/zupdrive/ws?token=..."
}

WebSocket Events (pushed from server):
{
  "type": "COURSE_COMPLETED",
  "data": {
    "courseId": "course-789",
    "amount": 825,
    "passenger": "Jean Dupont"
  }
}

{
  "type": "PAYOUT_PROCESSING",
  "data": {
    "payoutId": "payout-456",
    "amount": 215000,
    "status": "PROCESSING"
  }
}
```

---

### Admin Endpoints

#### Get Real-time Dashboard

```
GET /api/zupdrive/admin/dashboard
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "dashboard": {
    "realtime": {
      "activeDrivers": 245,
      "totalCourses": 8943,
      "totalEarnings": 892300000    // €8,923,000
    },
    "financials": {
      "pendingPayouts": 32           // Count of PENDING payouts
    },
    "compliance": {
      "alertCount": 7,
      "alerts": [
        {
          "id": "alert-1",
          "chauffeurId": "chauffeur-456",
          "riskLevel": "CRITICAL",
          "createdAt": "2026-10-17T14:20:00Z"
        }
      ]
    },
    "suspensions": {
      "count": 3
    },
    "timestamp": "2026-10-17T15:30:00Z"
  }
}
```

---

#### Get All High-Risk Drivers

```
GET /api/zupdrive/admin/alerts?type=compliance
Authorization: Bearer {adminToken}

Query Parameters:
- type: "all" | "compliance" | "rating" | "suspension"

Response 200:
{
  "success": true,
  "alertType": "compliance",
  "count": 7,
  "drivers": [
    {
      "id": "chauffeur-456",
      "nomComplet": "Marie Durand",
      "rating": 2.1,
      "statut": "VALIDE",
      "_count": {
        "courses": 12,
        "ratings": 8
      }
    },
    // ... more drivers
  ]
}
```

---

#### Get Compliance Alerts

```
GET /api/zupdrive/admin/compliance-alerts
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "criticalAlerts": [
    {
      "id": "report-123",
      "chauffeurId": "chauffeur-789",
      "overallScore": 15,           // Very low score
      "riskLevel": "CRITICAL",
      "createdAt": "2026-10-17T10:00:00Z",
      "chauffeur": {
        "nomComplet": "Pierre Martin",
        "email": "pierre@example.com"
      }
    },
    // ... more alerts
  ],
  "count": 3
}
```

---

#### Get Document Expiration Alerts

```
GET /api/zupdrive/admin/document-expiration-alerts
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "expiringDocuments": [
    {
      "id": "doc-456",
      "type": "PERMIS",
      "dateExpiration": "2026-11-10",
      "chauffeurId": "chauffeur-123",
      "chauffeur": {
        "nomComplet": "Jean Dupont",
        "email": "jean@example.com"
      }
    },
    // ... more expiring docs
  ],
  "count": 5
}
```

---

#### Get Payout Failure Alerts

```
GET /api/zupdrive/admin/payout-failure-alerts
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "failedPayouts": [
    {
      "id": "payout-123",
      "chauffeurId": "chauffeur-456",
      "montant": 150000,
      "erreurMotif": "Invalid IBAN",
      "createdAt": "2026-10-17T12:00:00Z",
      "chauffeur": {
        "nomComplet": "Marie Durand",
        "email": "marie@example.com"
      }
    },
    // ... more failures
  ],
  "count": 2
}
```

---

#### Platform Health Check

```
GET /api/zupdrive/admin/health
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "health": {
    "drivers": {
      "active": 245,
      "suspended": 3
    },
    "courses": {
      "active": 12              // Currently IN_PROGRESS
    },
    "quality": {
      "averageRating": 4.42
    },
    "status": "OPERATIONAL",
    "timestamp": "2026-10-17T15:30:00Z"
  }
}
```

---

## Monitoring Flows

### Real-time Updates

```
USER ACTION
    ↓
[Event Triggered]
    ├─ Course completed
    ├─ Rating received
    ├─ Payout status change
    ├─ Document expires
    └─ Compliance issue
    ↓
Service: ZupDriveMonitoringService.createNotification()
    ├─ Create notification record
    ├─ Determine priority
    └─ Select channels
    ↓
sendNotificationChannels()
    ├─ Push (Fireband/OneSignal)
    ├─ Email (SendGrid/Mailgun)
    └─ WebSocket (Real-time)
    ↓
[Delivered]
    ├─ Driver: Real-time app update
    ├─ Admin: Dashboard alert
    └─ Email: 24h summary (high priority)
```

---

### Alert Escalation

```
Condition Detected
    ↓
checkAndAlertIssues(chauffeurId)
    ├─ Check: Rating < 3.0?
    │  └─ Alert: "Improve service quality"
    ├─ Check: Cancellation > 15%?
    │  └─ Alert: "Risk of suspension"
    ├─ Check: Documents missing?
    │  └─ Alert: "Update required"
    └─ Check: Compliance CRITICAL?
       └─ Alert Admin: "Escalate for review"
    ↓
Admin notified → Can take action
    ├─ Suspend account
    ├─ Request documents
    ├─ Assign support
    └─ Monitor improvement
```

---

## Metrics Dashboard

### Driver View

```
═══════════════════════════════════════════════════
  My Performance Today
═══════════════════════════════════════════════════

📊 Earnings
├─ Today: €125.50 (3 courses)
├─ Week: €2,150.00 (45 courses)
└─ Next Payout: €2,150.00 (Monday)

⭐ Reputation
├─ Rating: 4.75/5
├─ Completion: 98%
├─ Cancellations: 1%
└─ Status: ACTIVE ✅

🏆 Badges
├─ TOP_RATED ⭐
├─ PROFESSIONAL 💼
└─ CONSISTENT ✓

📋 Documents: COMPLETE ✅
⚠️ Compliance Score: 92/100

═══════════════════════════════════════════════════
```

### Admin View

```
═══════════════════════════════════════════════════
  Platform Health
═══════════════════════════════════════════════════

🟢 Operational
├─ Active Drivers: 245
├─ Active Courses: 12
└─ Platform Rating: 4.42/5

💰 Financial
├─ Pending Payouts: 32
├─ Weekly Volume: €45,230
└─ Commission: €11,307.50

⚠️ Alerts
├─ Critical: 1 🔴
├─ High: 6 🟠
├─ Documents Expiring: 5 📋
└─ Payout Failures: 2 💳

🚫 Suspended: 3 drivers

═══════════════════════════════════════════════════
```

---

## Notification Templates

### For Drivers

```
COURSE_COMPLETED
Title: "🎉 Course completed!"
Message: "You earned €8.25 from your ride with Jean Dupont"
Action: View earnings → /earnings-realtime

PAYOUT_COMPLETED
Title: "💰 Payout received!"
Message: "€250.00 has been credited to your bank account"
Action: View payout → /payouts/payout-456

RATING_RECEIVED
Title: "⭐ 5-star rating"
Message: "Great job! Your passenger loved your service"
Action: View reviews → /reputation/reviews

DOCUMENT_EXPIRING
Title: "📋 License expires soon"
Message: "Your driving license expires in 10 days. Renew now"
Action: Update document → /documents/license

COMPLIANCE_WARNING
Title: "⚠️ Low rating alert"
Message: "Your rating has dropped to 2.8/5. Improve to avoid suspension"
Action: View recommendations → /support/improve-rating
```

### For Admins

```
CRITICAL_COMPLIANCE
Title: "🚨 Critical compliance issue"
Message: "Driver Jean Dupont (chauffeur-123): Fraud indicators detected"
Action: Review details → /admin/driver/chauffeur-123/compliance

PAYOUT_FAILURE
Title: "💳 Payout failed"
Message: "2 drivers' payouts failed due to invalid IBAN. Manual intervention required."
Action: Resolve → /admin/payout-failure-alerts

DRIVER_AT_RISK
Title: "⚠️ Driver suspension risk"
Message: "Marie Durand: 18% cancellation rate. Intervention recommended."
Action: Monitor → /admin/driver/chauffeur-456/metrics
```

---

## Real-time Capabilities

### WebSocket Subscription

```javascript
// Client-side example
const ws = new WebSocket(
  'wss://api.zupdrive.com/api/zupdrive/ws?token=...'
);

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  
  switch(type) {
    case 'COURSE_COMPLETED':
      updateEarnings(data.amount);
      showNotification(`Earned €${data.amount/100}`);
      break;
    case 'PAYOUT_PROCESSING':
      updatePayoutStatus('PROCESSING');
      break;
    case 'RATING_RECEIVED':
      updateReputation(data.newRating);
      break;
  }
};
```

---

## Testing

```bash
npm test -- zupdrive-monitoring
```

### Coverage

- ✅ Notification creation & routing
- ✅ Priority-based channel selection
- ✅ Unread notification retrieval
- ✅ Driver metrics aggregation
- ✅ Admin alert generation
- ✅ Document expiration detection
- ✅ Compliance score tracking
- ✅ Badge earning logic

---

## Integration with Other Phases

```
Phase 9: Account Unification
    ↓ Create notification on role change
    
Phase 11: Document Validation
    ↓ Notify on approval/rejection/expiration
    
Phase 12: Compliance Checks
    ↓ Alert on high-risk detection
    
Phase 13: Driver Rating
    ↓ Notify on new rating/badge
    
Phase 14: Payments
    ↓ Notify on payout status change
    
Phase 15: Monitoring (THIS)
    ↓ All events converge here
```

---

## Key Metrics Tracked

### Driver Performance

```
- Reputation Score (0-100)
- Earnings (today/week/month)
- Completion Rate (%)
- Cancellation Rate (%)
- Average Rating (1-5 stars)
- Badges earned
- Document status
- Compliance score
```

### Platform Health

```
- Active drivers
- Total courses
- Average rating
- Pending payouts
- Critical alerts
- Suspended accounts
- Revenue (daily/weekly)
```

---

## Next Steps (Future Phases)

1. **ML-based Anomaly Detection**: Fraud patterns, unusual behavior
2. **Predictive Alerts**: Warn before suspension risk
3. **Performance Recommendations**: AI-generated improvement tips
4. **Custom Notifications**: Driver preferences (quiet hours, digest)
5. **Audit Trail**: Track admin actions and decisions

---

## Support

**For drivers**: Check notifications in app dashboard
**For admins**: Monitor /admin/dashboard for real-time alerts
**For support team**: Use /admin/alerts to escalate issues
